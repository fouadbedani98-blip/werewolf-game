const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("client"));

let rooms = {};

const NIGHT_TIME = 10000;
const DAY_TIME = 15000;

// 📢 Broadcast
function broadcast(room,data){
    room.players.forEach(p=>{
        if(p.socket){
            p.socket.send(JSON.stringify(data));
        }
    });
}

// 🎭 Roles
function assignRoles(players){
    const roles=["werewolf","seer","doctor"];
    while(roles.length<players.length) roles.push("villager");
    return roles.sort(()=>Math.random()-0.5);
}

// 🧠 Lobby update
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

// 🧠 Win check
function checkWin(room){
    const alive = room.players.filter(p=>p.alive);
    const wolves = alive.filter(p=>p.role==="werewolf").length;
    const villagers = alive.length - wolves;

    if(wolves===0) return "villagers";
    if(wolves>=villagers) return "werewolves";
    return null;
}

// 💾 XP
function saveStats(room, winner){
    room.players.forEach(p=>{
        if(!p.email) return;

        const win =
        (winner==="villagers" && p.role!=="werewolf") ||
        (winner==="werewolves" && p.role==="werewolf");

        p.socket.send(JSON.stringify({
            type:"update_stats",
            win
        }));
    });
}

// 🌙 Night
function startNight(room){
    room.phase="night";
    room.nightKill=null;
    room.doctorSave=null;

    broadcast(room,{type:"night_start"});

    setTimeout(()=>endNight(room),NIGHT_TIME);
}

// ☀️ End night
function endNight(room){

    let dead=null;

    if(room.nightKill !== room.doctorSave){
        const p = room.players.find(x=>x.name===room.nightKill);
        if(p){
            p.alive=false;
            dead=p.name;
        }
    }

    broadcast(room,{type:"day_start",dead:dead || "No one"});

    const win = checkWin(room);
    if(win){
        saveStats(room,win);
        broadcast(room,{type:"game_over",message:win});
        return;
    }

    room.phase="day";
    room.votes={};

    setTimeout(()=>endDay(room),DAY_TIME);
}

// 🗳️ End day
function endDay(room){

    let max=0,target=null;

    for(let n in room.votes){
        if(room.votes[n]>max){
            max=room.votes[n];
            target=n;
        }
    }

    if(target){
        const p = room.players.find(x=>x.name===target);
        if(p) p.alive=false;
    }

    broadcast(room,{type:"player_killed",name:target || "No one"});

    const win = checkWin(room);
    if(win){
        saveStats(room,win);
        broadcast(room,{type:"game_over",message:win});
        return;
    }

    startNight(room);
}

// ▶️ Start game
function startGame(room){

    const roles = assignRoles(room.players);

    room.players.forEach((p,i)=>{
        p.role=roles[i];
        p.alive=true;
    });

    broadcast(room,{type:"game_started"});

    room.players.forEach(p=>{
        if(p.socket){
            p.socket.send(JSON.stringify({
                type:"your_role",
                role:p.role
            }));
        }
    });

    startNight(room);
}

// 🔌 Connection
wss.on("connection",(ws)=>{

ws.on("message",(msg)=>{

const data = JSON.parse(msg);

// 🏠 CREATE
if(data.type==="create_room"){

const code = Math.floor(Math.random()*9999).toString();

rooms[code]={ players:[] };

const player={
name:data.name,
socket:ws,
ready:false,
host:true,
email:data.email || null
};

rooms[code].players.push(player);
ws.room=code;

ws.send(JSON.stringify({type:"room_created",code}));

updateLobby(rooms[code]);
}

// 🚪 JOIN
if(data.type==="join_room"){

const room = rooms[data.code];
if(!room) return;

const player={
name:data.name,
socket:ws,
ready:false,
host:false,
email:data.email || null
};

room.players.push(player);
ws.room=data.code;

ws.send(JSON.stringify({type:"room_joined",code:data.code}));

updateLobby(room);
}

// 🟢 READY
if(data.type==="toggle_ready"){

const room = rooms[ws.room];
const player = room.players.find(p=>p.socket===ws);

player.ready = !player.ready;

updateLobby(room);
}

// ▶️ START
if(data.type==="start_game"){

const room = rooms[ws.room];
const player = room.players.find(p=>p.socket===ws);

if(!player.host) return;

if(!room.players.every(p=>p.ready)){
ws.send(JSON.stringify({type:"error",message:"All players must be ready"}));
return;
}

startGame(room);
}

// 🎮 GAME ACTIONS
const room = rooms[ws.room];
if(!room) return;

const sender = room.players.find(p=>p.socket===ws);

if(data.type==="kill" && sender.role==="werewolf"){
room.nightKill=data.target;
}

if(data.type==="save" && sender.role==="doctor"){
room.doctorSave=data.target;
}

if(data.type==="see" && sender.role==="seer"){
const t = room.players.find(p=>p.name===data.target);
ws.send(JSON.stringify({type:"seer_result",role:t.role}));
}

if(data.type==="vote"){
room.votes[data.target]=(room.votes[data.target]||0)+1;
}

});

});

server.listen(3000,()=>console.log("🔥 NightMind FULL SYSTEM READY"));