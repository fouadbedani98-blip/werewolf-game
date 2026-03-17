const socket = new WebSocket(
  (location.protocol==="https:"?"wss://":"ws://")+location.host
);

let name="";

socket.onmessage = (e)=>{
const d = JSON.parse(e.data);

if(d.type==="your_role") alert("Role: "+d.role);

if(d.type==="night_start")
setPhase("Night 🌙");

if(d.type==="day_start"){
setPhase("Day ☀️");
alert("Dead: "+d.dead);
}

if(d.type==="seer_result")
alert("Role: "+d.role);

if(d.type==="game_over")
alert(d.message);

if(d.type==="player_list"){
updatePlayers(d.players);
}

if(d.type==="chat"){
addChat(d.name, d.message);
}

if(d.type==="room_created"||d.type==="room_joined"){
document.getElementById("room").innerText="Room: "+d.code;
}
};

function setPhase(text){
document.getElementById("phase").innerText="Phase: "+text;
}

function updatePlayers(players){
const list=document.getElementById("players");
list.innerHTML="";
players.forEach(p=>{
const li=document.createElement("li");
li.innerText=p;
list.appendChild(li);
});
}

function addChat(name,msg){
const li=document.createElement("li");
li.innerText=name+": "+msg;
document.getElementById("chat").appendChild(li);
}

function createRoom(){
name=getValue("name");
send({type:"create_room",name});
}

function joinRoom(){
name=getValue("name");
send({type:"join_room",name,code:getValue("roomCode")});
}

function startGame(){ send({type:"start_game"}); }
function kill(){ send({type:"kill",target:getValue("target")}); }
function save(){ send({type:"save",target:getValue("target")}); }
function see(){ send({type:"see",target:getValue("target")}); }
function vote(){ send({type:"vote",target:getValue("target")}); }
function endNight(){ send({type:"end_night"}); }

function sendChat(){
send({type:"chat",name,message:getValue("chatInput")});
}

function send(data){
socket.send(JSON.stringify(data));
}

function getValue(id){
return document.getElementById(id).value;
}