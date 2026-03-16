const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("client"));

let rooms = {};

function generateRoomCode() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 4; i++) {
        code += letters[Math.floor(Math.random() * letters.length)];
    }
    return code;
}

function broadcastPlayers(code) {

    const players = rooms[code].map(p => p.name);

    rooms[code].forEach(player => {
        player.socket.send(JSON.stringify({
            type: "player_list",
            players: players
        }));
    });

}

function assignRoles(code){

    const players = rooms[code];

    const roles = ["werewolf","villager","villager","seer","doctor"];

    players.forEach((player,index)=>{

        const role = roles[index % roles.length];

        player.socket.send(JSON.stringify({
            type:"role",
            role:role
        }));

    });

}

wss.on("connection", (ws) => {

    ws.on("message", (message) => {

        const data = JSON.parse(message);

        if(data.type === "create_room"){

            const code = generateRoomCode();

            rooms[code] = [];

            const player = {
                name:data.name,
                socket:ws
            };

            rooms[code].push(player);

            ws.room = code;

            ws.send(JSON.stringify({
                type:"room_created",
                code:code
            }));

            broadcastPlayers(code);

        }

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

        if(data.type === "start_game"){

            const code = ws.room;

            assignRoles(code);

        }

        if(data.type === "chat"){

            const code = ws.room;

            rooms[code].forEach(player=>{
                player.socket.send(JSON.stringify({
                    type:"chat",
                    name:data.name,
                    message:data.message
                }));
            });

        }

    });

});

server.listen(3000, ()=>{
    console.log("Server running at http://localhost:3000");
});