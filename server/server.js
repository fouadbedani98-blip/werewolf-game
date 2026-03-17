const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("."));

let rooms = {};
let queue = [];

function send(ws,data){
  if(ws.readyState===1) ws.send(JSON.stringify(data));
}

function broadcast(room,data){
  room.players.forEach(p=>send(p.ws,data));
}

function updateLobby(room){
  broadcast(room,{
    type:"lobby",
    players:room.players.map(p=>({
      name:p.name,
      ready:p.ready,
      alive:p.alive,
      host:p.host
    }))
  });
}

function assignRoles(players){
  let roles=["werewolf","doctor","seer"];
  while(roles.length<players.length) roles.push("villager");
  return roles.sort(()=>Math.random()-0.5);
}

function checkWin(room){
  const alive=room.players.filter(p=>p.alive);
  const wolves=alive.filter(p=>p.role==="werewolf").length;
  const others=alive.length-wolves;

  if(wolves===0) return "Villagers Win";
  if(wolves>=others) return "Werewolves Win";
  return null;
}

// ---------- GAME ----------

function startGame(room){
  const roles=assignRoles(room.players);

  room.players.forEach((p,i)=>{
    p.role=roles[i];
    p.alive=true;
  });

  broadcast(room,{type:"game_started"});

  room.players.forEach(p=>{
    send(p.ws,{type:"role",role:p.role});
  });

  startNight(room);
}

function startNight(room){
  room.phase="night";
  room.kill=null;
  room.save=null;

  broadcast(room,{type:"phase",value:"night"});
  setTimeout(()=>endNight(room),8000);
}

function endNight(room){
  let dead=null;

  if(room.kill && room.kill!==room.save){
    const target=room.players.find(p=>p.name===room.kill);
    if(target){ target.alive=false; dead=target.name; }
  }

  broadcast(room,{type:"night_result",dead});

  const win=checkWin(room);
  if(win){
    broadcast(room,{type:"game_over",msg:win});
    return;
  }

  room.votes={};
  startDay(room);
}

function startDay(room){
  room.phase="day";
  broadcast(room,{type:"phase",value:"day"});
  setTimeout(()=>endDay(room),10000);
}

function endDay(room){
  let max=0,target=null;

  for(let name in room.votes){
    if(room.votes[name]>max){
      max=room.votes[name];
      target=name;
    }
  }

  if(target){
    const p=room.players.find(x=>x.name===target);
    if(p) p.alive=false;
  }

  broadcast(room,{type:"day_result",killed:target});

  const win=checkWin(room);
  if(win){
    broadcast(room,{type:"game_over",msg:win});
    return;
  }

  startNight(room);
}

// ---------- MATCHMAKING FIX ----------

function tryMatch(){
  if(queue.length>=2){

    const code=Math.floor(Math.random()*9999).toString();
    rooms[code]={players:[]};

    const players=queue.splice(0,Math.min(6,queue.length));

    players.forEach(p=>{
      p.ws.room=code;
      rooms[code].players.push(p);
      send(p.ws,{type:"room",code});
    });

    updateLobby(rooms[code]);
  }
}

// ---------- SOCKET ----------

wss.on("connection",ws=>{

  ws.on("message",msg=>{
    const data=JSON.parse(msg);

    // QUICK MATCH
    if(data.type==="quick"){
      queue.push({
        name:data.name,
        ws,
        ready:true,
        host:false,
        alive:true
      });
      tryMatch();
      return;
    }

    // CREATE
    if(data.type==="create"){
      const code=Math.floor(Math.random()*9999).toString();

      rooms[code]={players:[]};

      const player={
        name:data.name,
        ws,
        ready:false,
        host:true,
        alive:true
      };

      rooms[code].players.push(player);
      ws.room=code;

      send(ws,{type:"room",code});
      updateLobby(rooms[code]);
      return;
    }

    // JOIN
    if(data.type==="join"){
      const room=rooms[data.code];
      if(!room) return;

      const player={
        name:data.name,
        ws,
        ready:false,
        host:false,
        alive:true
      };

      room.players.push(player);
      ws.room=data.code;

      send(ws,{type:"room",code:data.code});
      updateLobby(room);
      return;
    }

    const room=rooms[ws.room];
    if(!room) return;

    const player=room.players.find(p=>p.ws===ws);

    // READY
    if(data.type==="ready"){
      player.ready=!player.ready;
      updateLobby(room);
    }

    // START
    if(data.type==="start"){
      if(!player.host) return;
      if(!room.players.every(p=>p.ready)) return;
      startGame(room);
    }

    // NIGHT ACTIONS
    if(room.phase==="night"){
      if(player.role==="werewolf" && data.type==="kill"){
        room.kill=data.target;
      }
      if(player.role==="doctor" && data.type==="save"){
        room.save=data.target;
      }
      if(player.role==="seer" && data.type==="see"){
        const t=room.players.find(p=>p.name===data.target);
        send(ws,{type:"see",role:t?t.role:"unknown"});
      }
    }

    // DAY VOTE
    if(room.phase==="day" && data.type==="vote"){
      if(!room.votes[data.target]) room.votes[data.target]=0;
      room.votes[data.target]++;
    }

  });

});

server.listen(3000,()=>console.log("🔥 FIXED GAME RUNNING"));