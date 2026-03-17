const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("client"));

let rooms = {};

const NIGHT_TIME = 15000; // 15s
const DAY_TIME = 20000;   // 20s

function generateRoomCode() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return Array.from({length:4},()=>letters[Math.floor(Math.random()*26)]).join("");
}

function assignRoles(players){
    const roles = ["werewolf","werewolf","seer","doctor"];
    while(roles.length < players.length) roles.push("villager");

    for(let i=roles.length-1;i>0;i--){
        const j=Math.floor(Math.random()*(i+1));
        [roles[i],roles[j]]=[roles[j],roles[i]];
    }
    return roles;
}

function broadcast(room, data){
    room.players.forEach(p=>{
        p.socket.send(JSON.stringify(data));
    });
}

function broadcastPlayers(room){
    const alive = room.players.filter(p=>p.alive).map(p=>p.name);
    broadcast(room,{type:"player_list",players:alive});
}

function checkWin(room){
    const alive = room.players.filter(p=>p.alive);
    const wolves = alive.filter(p=>p.role==="werewolf").length;
    const villagers = alive.length - wolves;

    if(wolves===0) return "Villagers Win 🏆";
    if(wolves>=villagers) return "Werewolves Win 🐺";
    return null;
}

// ================= NIGHT =================
function startNight(room){

    room.phase="night";
    room.nightKill=null;
    room.doctorSave=null;

    broadcast(room,{type:"night_start",time:NIGHT_TIME/1000});

    room.timer = setTimeout(()=>{
        endNight(room);
    },NIGHT_TIME);
}

// ================= END NIGHT =================
function endNight(room){

    let dead=null;

    if(room.nightKill !== room.doctorSave){
        const victim = room.players.find(p=>p.name===room.nightKill);
        if(victim){
            victim.alive=false;
            dead=victim.name;
        }
    }

    broadcast(room,{type:"day_start",dead:dead||"No one",time:DAY_TIME/1000});

    broadcastPlayers(room);

    const win = checkWin(room);
    if(win){
        broadcast(room,{type:"game_over",message:win});
        return;
    }

    room.phase="day";
    room.votes={};

    room.timer = setTimeout(()=>{
        endDay(room);
    },DAY_TIME);
}

// ================= END DAY =================
function endDay(room){

    let max=0, target=null;

    for(let name in room.votes){
        if(room.votes[name]>max){
            max=room.votes[name];
            target=name;
        }
    }

    if(target){
        const player = room.players.find(p=>p.name===target);
        if(player) player.alive=false;
    }

    broadcast(room,{type:"player_killed",name:target||"No one"});

    broadcastPlayers(room);

    const win = checkWin(room);
    if(win){
        broadcast(room,{type:"game_over",message:win});
        return;
    }

    startNight(room);
}

wss.on("connection",(ws)=>{

ws.on("message",(msg)=>{

const data = JSON.parse(msg);
const room = rooms[ws.room];
const sender = room?.players.find(p=>p.socket===ws);

// منع الميتين
if(sender && !sender.alive) return;

// CREATE
if(data.type==="create_room"){

    const code=generateRoomCode();

    rooms[code]={
        players:[],
        readyCount:0,
        phase:"lobby"
    };

    const player={name:data.name,socket:ws,alive:true,role:null,ready:false};

    rooms[code].players.push(player);
    ws.room=code;

    ws.send(JSON.stringify({type:"room_created",code}));
    broadcastPlayers(rooms[code]);
}

// JOIN
if(data.type==="join_room"){

    const room=rooms[data.code];
    if(!room) return;

    const player={name:data.name,socket:ws,alive:true,role:null,ready:false};

    room.players.push(player);
    ws.room=data.code;

    ws.send(JSON.stringify({type:"room_joined",code:data.code}));
    broadcastPlayers(room);
}

// READY SYSTEM
if(data.type==="ready"){

    if(!room) return;

    sender.ready=true;

    const readyCount = room.players.filter(p=>p.ready).length;

    broadcast(room,{
        type:"ready_update",
        ready:readyCount,
        total:room.players.length
    });

    if(readyCount === room.players.length){

        const roles = assignRoles(room.players);

        room.players.forEach((p,i)=>{
            p.role=roles[i];
            p.socket.send(JSON.stringify({type:"your_role",role:p.role}));
        });

        startNight(room);
    }
}

// ACTIONS
if(data.type==="kill"){
    if(room.phase==="night" && sender.role==="werewolf"){
        room.nightKill=data.target;
    }
}

if(data.type==="save"){
    if(room.phase==="night" && sender.role==="doctor"){
        room.doctorSave=data.target;
    }
}

if(data.type==="see"){
    if(sender.role==="seer"){
        const target=room.players.find(p=>p.name===data.target);
        sender.socket.send(JSON.stringify({
            type:"seer_result",
            role:target?target.role:"unknown"
        }));
    }
}

// VOTE
if(data.type==="vote"){
    if(room.phase!=="day") return;
    room.votes[data.target]=(room.votes[data.target]||0)+1;
}

// CHAT
if(data.type==="chat"){

    if(room.phase==="night"){
        if(sender.role==="werewolf"){
            room.players.forEach(p=>{
                if(p.role==="werewolf"){
                    p.socket.send(JSON.stringify({
                        type:"chat",
                        name:data.name,
                        message:data.message
                    }));
                }
            });
        }
    } else {
        broadcast(room,{
            type:"chat",
            name:data.name,
            message:data.message
        });
    }
}

});

});

server.listen(3000,()=>console.log("PRO server running"));