const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("client"));

let rooms = {};

// إنشاء كود غرفة
function generateRoomCode() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return Array.from({ length: 4 }, () =>
        letters[Math.floor(Math.random() * letters.length)]
    ).join("");
}

// توزيع الأدوار
function assignRoles(players) {
    const roles = ["werewolf", "werewolf", "seer", "doctor"];
    while (roles.length < players.length) roles.push("villager");

    for (let i = roles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    return roles;
}

// إرسال قائمة اللاعبين
function broadcastPlayers(room) {
    const alive = room.players.filter(p => p.alive).map(p => p.name);

    room.players.forEach(p => {
        p.socket.send(JSON.stringify({
            type: "player_list",
            players: alive
        }));
    });
}

// التحقق من الفوز
function checkWin(room) {
    const alive = room.players.filter(p => p.alive);

    const wolves = alive.filter(p => p.role === "werewolf").length;
    const villagers = alive.length - wolves;

    if (wolves === 0) return "Villagers Win 🏆";
    if (wolves >= villagers) return "Werewolves Win 🐺";

    return null;
}

wss.on("connection", (ws) => {

    ws.on("message", (msg) => {

        const data = JSON.parse(msg);

        const room = rooms[ws.room];
        const sender = room?.players.find(p => p.socket === ws);

        // 🚫 منع الميتين
        if (sender && !sender.alive) return;

        // =========================
        // CREATE ROOM
        // =========================
        if (data.type === "create_room") {

            const code = generateRoomCode();

            rooms[code] = {
                players: [],
                phase: "lobby",
                nightKill: null,
                doctorSave: null,
                votes: {}
            };

            const player = {
                name: data.name,
                socket: ws,
                role: null,
                alive: true
            };

            rooms[code].players.push(player);
            ws.room = code;

            ws.send(JSON.stringify({ type: "room_created", code }));

            broadcastPlayers(rooms[code]);
        }

        // =========================
        // JOIN ROOM
        // =========================
        if (data.type === "join_room") {

            const room = rooms[data.code];
            if (!room) return;

            const player = {
                name: data.name,
                socket: ws,
                role: null,
                alive: true
            };

            room.players.push(player);
            ws.room = data.code;

            ws.send(JSON.stringify({ type: "room_joined", code: data.code }));

            broadcastPlayers(room);
        }

        // =========================
        // START GAME
        // =========================
        if (data.type === "start_game") {

            const room = rooms[ws.room];
            if (!room) return;

            const roles = assignRoles(room.players);

            room.players.forEach((p, i) => {
                p.role = roles[i];
                p.socket.send(JSON.stringify({
                    type: "your_role",
                    role: p.role
                }));
            });

            room.phase = "night";

            room.players.forEach(p => {
                p.socket.send(JSON.stringify({ type: "night_start" }));
            });
        }

        // =========================
        // WEREWOLF KILL
        // =========================
        if (data.type === "kill") {

            if (!room || room.phase !== "night") return;
            if (sender.role !== "werewolf") return;

            room.nightKill = data.target;
        }

        // =========================
        // DOCTOR SAVE
        // =========================
        if (data.type === "save") {

            if (!room || room.phase !== "night") return;
            if (sender.role !== "doctor") return;

            room.doctorSave = data.target;
        }

        // =========================
        // SEER CHECK
        // =========================
        if (data.type === "see") {

            if (!room || sender.role !== "seer") return;

            const target = room.players.find(p => p.name === data.target);

            sender.socket.send(JSON.stringify({
                type: "seer_result",
                role: target ? target.role : "unknown"
            }));
        }

        // =========================
        // END NIGHT → DAY
        // =========================
        if (data.type === "end_night") {

            if (!room || room.phase !== "night") return;

            let dead = null;

            if (room.nightKill !== room.doctorSave) {
                const victim = room.players.find(p => p.name === room.nightKill);
                if (victim) {
                    victim.alive = false;
                    dead = victim.name;
                }
            }

            room.phase = "day";

            room.players.forEach(p => {
                p.socket.send(JSON.stringify({
                    type: "day_start",
                    dead: dead || "No one"
                }));
            });

            broadcastPlayers(room);

            const win = checkWin(room);
            if (win) {
                room.players.forEach(p => {
                    p.socket.send(JSON.stringify({
                        type: "game_over",
                        message: win
                    }));
                });
            }

            room.nightKill = null;
            room.doctorSave = null;
        }

        // =========================
        // VOTE
        // =========================
        if (data.type === "vote") {

            if (!room || room.phase !== "day") return;

            room.votes[data.target] = (room.votes[data.target] || 0) + 1;

            const aliveCount = room.players.filter(p => p.alive).length;
            const totalVotes = Object.values(room.votes).reduce((a, b) => a + b, 0);

            if (totalVotes >= aliveCount) {

                let max = 0;
                let target = null;

                for (let name in room.votes) {
                    if (room.votes[name] > max) {
                        max = room.votes[name];
                        target = name;
                    }
                }

                const player = room.players.find(p => p.name === target);
                if (player) player.alive = false;

                room.players.forEach(p => {
                    p.socket.send(JSON.stringify({
                        type: "player_killed",
                        name: target
                    }));
                });

                room.votes = {};
                room.phase = "night";

                broadcastPlayers(room);

                const win = checkWin(room);
                if (win) {
                    room.players.forEach(p => {
                        p.socket.send(JSON.stringify({
                            type: "game_over",
                            message: win
                        }));
                    });
                } else {
                    room.players.forEach(p => {
                        p.socket.send(JSON.stringify({ type: "night_start" }));
                    });
                }
            }
        }

        // =========================
        // CHAT
        // =========================
        if (data.type === "chat") {

            if (!room) return;

            if (room.phase === "night") {

                if (sender.role === "werewolf") {
                    room.players.forEach(p => {
                        if (p.role === "werewolf") {
                            p.socket.send(JSON.stringify({
                                type: "chat",
                                name: data.name,
                                message: data.message
                            }));
                        }
                    });
                }

            } else {

                room.players.forEach(p => {
                    p.socket.send(JSON.stringify({
                        type: "chat",
                        name: data.name,
                        message: data.message
                    }));
                });

            }
        }

    });

});

server.listen(3000, () => {
    console.log("Server running on port 3000");
});