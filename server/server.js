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

    const roles = [];

    roles.push("werewolf");
    roles.push("werewolf");

    roles.push("seer");
    roles.push("doctor");

    while(roles.length < players.length){
        roles.push("villager");
    }

    // خلط
    for(let i = roles.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    return roles;
}

// إرسال قائمة اللاعبين
function broadcastPlayers(code){

    const players = rooms[code].map(p => p.name);

    rooms[code].forEach(player => {
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

            rooms[code] = [];

            const player = {
                name: data.name,
                socket: ws
            };

            rooms[code].push(player);
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
                    socket:ws
                };

                rooms[code].push(player);
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

            const code = ws.room;
            const room = rooms[code];

            if(!room) return;

            const roles = assignRoles(room);

            room.forEach((player, index) => {

                player.role = roles[index];

                player.socket.send(JSON.stringify({
                    type:"your_role",
                    role:player.role
                }));

            });

        }

    });

});

server.listen(3000, ()=>{
    console.log("Server running at http://localhost:3000");
});