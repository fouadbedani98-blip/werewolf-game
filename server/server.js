const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("client"));

let rooms = {};

// 📢 Broadcast
function broadcast(room,data){
    room.players.forEach(p=>{
        if(p.socket){
            p.socket.send(JSON.stringify(data));
        }
    });
}

// 🧠 Update lobby
function updateLobby(room){
    broadcast(room,{
        type:"lobby_update",
        players: room.players.map(p=>({
            name:p.name,
            ready:p.ready,
            host:p.host
        }))
    });
}

// 🎭 Roles
function assignRoles(players){
    const roles=["werewolf","seer","doctor"];
    while(roles.length<players.length) roles.push("villager");
    return roles.sort(()=>Math.random()-0.5);
}

// 🌙 Start game
function startGame(room){

    const roles = assignRoles(room.players);

    room.players.forEach((p,i)=>{
        p.role=roles[i];
        p.alive=true;

        if(p.socket){
            p.socket.send(JSON.stringify({
                type:"your_role",
                role:p.role
            }));
        }
    });

    broadcast(room,{type:"game_started"});
}

// 🔌 Connection
wss.on("connection",(ws)=>{

ws.on("message",(msg)=>{

const data = JSON.parse(msg);

// 🏠 Create room
if(data.type==="create_room"){

const code = Math.floor(Math.random()*9999).toString();

rooms[code]={
players:[]
};

const player={
name:data.name,
socket:ws,
ready:false,
host:true
};

rooms[code].players.push(player);

ws.room=code;

ws.send(JSON.stringify({type:"room_created",code}));

updateLobby(rooms[code]);
}

// 🚪 Join room
if(data.type==="join_room"){

const room = rooms[data.code];
if(!room) return;

const player={
name:data.name,
socket:ws,
ready:false,
host:false
};

room.players.push(player);
ws.room=data.code;

ws.send(JSON.stringify({type:"room_joined",code:data.code}));

updateLobby(room);
}

// 🟢 Ready toggle
if(data.type==="toggle_ready"){

const room = rooms[ws.room];
const player = room.players.find(p=>p.socket===ws);

player.ready = !player.ready;

updateLobby(room);
}

// ▶️ Start game
if(data.type==="start_game"){

const room = rooms[ws.room];
const player = room.players.find(p=>p.socket===ws);

if(!player.host) return;

// check all ready
const allReady = room.players.every(p=>p.ready);

if(!allReady){
ws.send(JSON.stringify({type:"error",message:"All players must be ready"}));
return;
}

startGame(room);
}

});

});

server.listen(3000,()=>console.log("🔥 Lobby System Ready"));