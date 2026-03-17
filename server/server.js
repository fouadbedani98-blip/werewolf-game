const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("client"));

let rooms = {};
let waitingPlayers = [];

const NIGHT_TIME = 10000;
const DAY_TIME = 15000;

function assignRoles(players){
    const roles = ["werewolf","werewolf","seer","doctor"];
    while(roles.length < players.length) roles.push("villager");

    for(let i=roles.length-1;i>0;i--){
        const j=Math.floor(Math.random()*(i+1));
        [roles[i],roles[j]]=[roles[j],roles[i]];
    }
    return roles;
}

function broadcast(room,data){
    room.players.forEach(p=>{
        if(p.socket){
            p.socket.send(JSON.stringify(data));
        }
    });
}

function checkWin(room){
    const alive = room.players.filter(p=>p.alive);
    const wolves = alive.filter(p=>p.role==="werewolf").length;
    const villagers = alive.length - wolves;

    if(wolves===0) return "Villagers Win 🏆";
    if(wolves>=villagers) return "Werewolves Win 🐺";
    return null;
}

// 🤖 BOT ACTION
function botPlay(room){

    room.players.forEach(p=>{
        if(p.isBot && p.alive){

            if(room.phase==="night"){
                if(p.role==="werewolf"){
                    const targets = room.players.filter(x=>x.alive && x.role!=="werewolf");
                    if(targets.length){
                        room.nightKill = targets[Math.floor(Math.random()*targets.length)].name;
                    }
                }
                if(p.role==="doctor"){
                    const targets = room.players.filter(x=>x.alive);
                    room.doctorSave = targets[Math.floor(Math.random()*targets.length)].name;
                }
            }

            if(room.phase==="day"){
                const targets = room.players.filter(x=>x.alive);
                const vote = targets[Math.floor(Math.random()*targets.length)].name;
                room.votes[vote] = (room.votes[vote]||0)+1;
            }
        }
    });
}

function startNight(room){

    room.phase="night";
    room.nightKill=null;
    room.doctorSave=null;

    broadcast(room,{type:"night_start",time:NIGHT_TIME/1000});

    setTimeout(()=>{
        botPlay(room);
        endNight(room);
    },NIGHT_TIME);
}

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

    const win = checkWin(room);
    if(win){
        broadcast(room,{type:"game_over",message:win});
        return;
    }

    room.phase="day";
    room.votes={};

    setTimeout(()=>{
        botPlay(room);
        endDay(room);
    },DAY_TIME);
}

function endDay(room){

    let max=0,target=null;

    for(let n in room.votes){
        if(room.votes[n]>max){
            max=room.votes[n];
            target=n;
        }
    }

    if(target){
        const p=room.players.find(x=>x.name===target);
        if(p) p.alive=false;
    }

    broadcast(room,{type:"player_killed",name:target||"No one"});

    const win = checkWin(room);
    if(win){
        broadcast(room,{type:"game_over",message:win});
        return;
    }

    startNight(room);
}

// 🌍 MATCHMAKING
function tryMatchmaking(){

    if(waitingPlayers.length >= 2){

        const roomId = "MM"+Math.floor(Math.random()*9999);

        const players = waitingPlayers.splice(0,2);

        rooms[roomId] = {
            players: [],
            phase:"lobby"
        };

        players.forEach(ws=>{
            const player = {name:"Player",socket:ws,alive:true};
            rooms[roomId].players.push(player);
            ws.room = roomId;
            ws.send(JSON.stringify({type:"room_joined",code:roomId}));
        });

        // 🤖 add bots
        while(rooms[roomId].players.length < 6){
            rooms[roomId].players.push({
                name:"Bot"+Math.floor(Math.random()*100),
                isBot:true,
                alive:true
            });
        }

        const roles = assignRoles(rooms[roomId].players);
        rooms[roomId].players.forEach((p,i)=>{
            p.role=roles[i];
            if(p.socket){
                p.socket.send(JSON.stringify({type:"your_role",role:p.role}));
            }
        });

        startNight(rooms[roomId]);
    }
}

wss.on("connection",(ws)=>{

ws.on("message",(msg)=>{

const data = JSON.parse(msg);
const room = rooms[ws.room];
const sender = room?.players.find(p=>p.socket===ws);

// MATCHMAKING
if(data.type==="quick_play"){
    waitingPlayers.push(ws);
    ws.send(JSON.stringify({type:"searching"}));
    tryMatchmaking();
}

// ACTIONS
if(data.type==="kill" && sender?.role==="werewolf"){
    room.nightKill=data.target;
}

if(data.type==="save" && sender?.role==="doctor"){
    room.doctorSave=data.target;
}

if(data.type==="see" && sender?.role==="seer"){
    const t=room.players.find(p=>p.name===data.target);
    ws.send(JSON.stringify({type:"seer_result",role:t?t.role:"unknown"}));
}

if(data.type==="vote"){
    room.votes[data.target]=(room.votes[data.target]||0)+1;
}

if(data.type==="chat"){
    broadcast(room,{type:"chat",name:data.name,message:data.message});
}

});

});

server.listen(3000,()=>console.log("🔥 PRO MAX server running"));