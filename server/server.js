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
    let code = "";
    for (let i = 0; i < 4; i++) {
        code += letters[Math.floor(Math.random() * letters.length)];
    }
    return code;
}

// توزيع الأدوار
function assignRoles(players){
    const roles = ["werewolf","werewolf","seer","doctor"];

    while(roles.length < players.length){
        roles.push("villager");
    }

    for(let i = roles.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    return roles;
}

// إرسال اللاعبين
function broadcastPlayers(code){
    const players = rooms[code].players
        .filter(p => p.alive)
        .map(p => p.name);

    rooms[code].players.forEach(player => {
        player.socket.send(JSON.stringify({
            type:"player_list",
            players:players
        }));
    });
}

wss.on("connection", (ws) => {

    ws.on("message", (message) => {

        const data = JSON.parse(message);

        // إنشاء غرفة
        if(data.type === "create_room"){

            const code = generateRoomCode();

            rooms[code] = {
                players: [],
                phase: "lobby",
                votes: {},
                nightKill: null
            };

            const player = {
                name: data.name,
                socket: ws,
                role: null,
                alive: true
            };

            rooms[code].players.push(player);
            ws.room = code;

            ws.send(JSON.stringify({
                type:"room_created",
                code:code
            }));

            broadcastPlayers(code);
        }

        // دخول غرفة
        if(data.type === "join_room"){

            const code = data.code;

            if(rooms[code]){

                const player = {
                    name:data.name,
                    socket:ws,
                    role:null,
                    alive:true
                };

                rooms[code].players.push(player);
                ws.room = code;

                ws.send(JSON.stringify({
                    type:"room_joined",
                    code:code
                }));

                broadcastPlayers(code);
            }
        }

        // بدء اللعبة
        if(data.type === "start_game"){

            const room = rooms[ws.room];
            if(!room) return;

            const roles = assignRoles(room.players);

            room.players.forEach((player, index) => {
                player.role = roles[index];

                player.socket.send(JSON.stringify({
                    type:"your_role",
                    role:player.role
                }));
            });

            room.phase = "night";

            room.players.forEach(p=>{
                p.socket.send(JSON.stringify({ type:"night_start" }));
            });
        }

        // 🌙 اختيار الضحية
        if(data.type === "kill"){

            const room = rooms[ws.room];
            if(!room || room.phase !== "night") return;

            const sender = room.players.find(p=>p.socket===ws);

            if(sender.role !== "werewolf") return;

            room.nightKill = data.target;

            // انتقال للنهار
            room.phase = "day";

            const victim = room.players.find(p=>p.name === room.nightKill);
            if(victim) victim.alive = false;

            room.players.forEach(p=>{
                p.socket.send(JSON.stringify({
                    type:"day_start",
                    dead: room.nightKill
                }));
            });

            broadcastPlayers(ws.room);
        }

        // 🗳️ التصويت
        if(data.type === "vote"){

            const room = rooms[ws.room];
            if(!room || room.phase !== "day") return;

            room.votes[data.target] = (room.votes[data.target] || 0) + 1;

            const totalVotes = Object.values(room.votes).reduce((a,b)=>a+b,0);
            const alivePlayers = room.players.filter(p=>p.alive).length;

            if(totalVotes >= alivePlayers){

                let maxVotes = 0;
                let votedPlayer = null;

                for(let name in room.votes){
                    if(room.votes[name] > maxVotes){
                        maxVotes = room.votes[name];
                        votedPlayer = name;
                    }
                }

                const player = room.players.find(p=>p.name===votedPlayer);
                if(player) player.alive = false;

                room.players.forEach(p=>{
                    p.socket.send(JSON.stringify({
                        type:"player_killed",
                        name:votedPlayer
                    }));
                });

                // إعادة
                room.votes = {};
                room.phase = "night";

                room.players.forEach(p=>{
                    p.socket.send(JSON.stringify({ type:"night_start" }));
                });

                broadcastPlayers(ws.room);
            }
        }

        // 💬 الشات
        if(data.type === "chat"){

            const room = rooms[ws.room];
            if(!room) return;

            if(room.phase === "night"){
                const sender = room.players.find(p=>p.socket===ws);

                if(sender.role === "werewolf"){
                    room.players.forEach(p=>{
                        if(p.role === "werewolf"){
                            p.socket.send(JSON.stringify({
                                type:"chat",
                                name:data.name,
                                message:data.message
                            }));
                        }
                    });
                }
            } else {
                room.players.forEach(p=>{
                    p.socket.send(JSON.stringify({
                        type:"chat",
                        name:data.name,
                        message:data.message
                    }));
                });
            }
        }

    });

});

server.listen(3000, ()=>{
    console.log("Server running at http://localhost:3000");
});