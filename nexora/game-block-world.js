// Original 2D block sandbox, inspired by common voxel survival game mechanics.
// Completely offline: no external assets, packages, iframe, or network access.
const SOURCE=String.raw`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}html,body{margin:0;background:#10182a;color:#e9f3ff;font:600 14px system-ui;overscroll-behavior:none}
.wrap{max-width:920px;margin:auto;padding:10px}
header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
header strong{font-size:15px;letter-spacing:-.02em}
header span{font-size:11px;color:#c2def8}
canvas{width:100%;height:auto;aspect-ratio:12/7;display:block;border-radius:15px;background:#90c9ff;touch-action:none;image-rendering:pixelated}
.toolbar{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 0}
.toolbar button{border:1px solid #536a92;border-radius:10px;background:#253957;color:#ecf6ff;padding:9px 11px;font-size:12px;font-weight:750}
.toolbar button.active{background:#486dd1;border-color:#88b0ff}
.help{margin:10px 2px 0;color:#b9cde5;font-size:11px;line-height:1.5}
</style></head><body><div class="wrap">
<header><strong>⛏ Блочный мир · NEXORA</strong><span id="resources">Добыто: 0 · Блоки: 6</span></header>
<canvas id="world" width="720" height="420" aria-label="Двумерный мир: копайте блоки, стройте и исследуйте"></canvas>
<div class="toolbar">
<button type="button" id="mine" class="active">⛏ Копать</button>
<button type="button" id="place">▣ Строить</button>
<button type="button" id="restart">↻ Новый мир</button>
</div>
<p class="help" id="notice">← → — идти, ↑ или пробел — прыгнуть. Касайтесь блоков для добычи или строительства. Свайпы и стрелки работают на телефоне.</p>
</div>
<script>
(function(){
"use strict";
const canvas=document.getElementById("world"),ctx=canvas.getContext("2d"),T=30,WW=64,HH=22;
const keys=new Set(),grid=[],ground=[],clouds=[],player={x:6,y:7,vx:0,vy:0,dir:1,grounded:false};
let mode="mine",found=0,blocks=6,last=performance.now(),camera=0,started=false;
const tileColor={grass:"#4aa65a",dirt:"#916442",stone:"#68798b",ore:"#e4bb65"};
function message(text){document.getElementById("notice").textContent=text}
function resources(){document.getElementById("resources").textContent="Добыто: "+found+" · Блоки: "+blocks}
function setMode(next){
 mode=next;
 document.getElementById("mine").classList.toggle("active",next==="mine");
 document.getElementById("place").classList.toggle("active",next==="place");
 message(next==="mine"?"⛏ Коснитесь блока рядом с героем или нажмите «Действие»":"▣ Коснитесь свободной клетки рядом с героем или нажмите «Действие»");
}
document.getElementById("mine").addEventListener("click",()=>setMode("mine"));
document.getElementById("place").addEventListener("click",()=>setMode("place"));
document.getElementById("restart").addEventListener("click",init);
function init(){
 grid.length=0;ground.length=0;clouds.length=0;
 for(let x=0;x<WW;x++)ground[x]=13+Math.round(Math.sin(x*.33)*1.3+Math.sin(x*.09)*1.2);
 for(let y=0;y<HH;y++){
  const row=[];
  for(let x=0;x<WW;x++){
   let type=0;
   if(y>=ground[x]){
    if(y===ground[x])type=1;else if(y<ground[x]+4)type=2;else type=3;
    if(y>ground[x]+5&&Math.random()<.075)type=4;
   }
   row.push(type);
  }
  grid.push(row);
 }
 for(let x=0;x<WW;x+=9)clouds.push({x:x*T+Math.random()*65,y:20+Math.random()*85});
 player.x=6;player.y=ground[6]-1.12;player.vx=0;player.vy=0;player.grounded=false;player.dir=1;
 found=0;blocks=6;camera=0;keys.clear();resources();started=true;last=performance.now();
 setMode("mine");
}
const solid=(tx,ty)=>tx<0||tx>=WW||ty>=HH||ty>=0&&!!grid[ty][tx];
function touching(px,py){
 const left=Math.floor(px+.11),right=Math.floor(px+.8),top=Math.floor(py+.08),bottom=Math.floor(py+.98);
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)if(solid(x,y))return true;
 return false;
}
function moveAxis(axis,amount){
 const steps=Math.max(1,Math.ceil(Math.abs(amount)/.11)),delta=amount/steps;
 for(let i=0;i<steps;i++){
  if(axis==="x"){if(!touching(player.x+delta,player.y))player.x+=delta;else{player.vx=0;return}}
  else{if(!touching(player.x,player.y+delta))player.y+=delta;else{if(delta>0)player.grounded=true;player.vy=0;return}}
 }
}
function jump(){
 if(player.grounded){player.vy=-12.5;player.grounded=false}
}
function update(dt){
 const left=keys.has("left"),right=keys.has("right");
 player.vx=(right?1:0)-(left?1:0);
 if(player.vx)player.dir=player.vx;
 moveAxis("x",player.vx*5.8*dt);
 player.vy=Math.min(17,player.vy+29*dt);
 player.grounded=false;moveAxis("y",player.vy*dt);
 if(player.y>HH){player.x=6;player.y=ground[6]-2;player.vy=0}
 camera=Math.max(0,Math.min(WW*T-720,(player.x+.5)*T-360));
}
function validReach(x,y){
 if(x<0||x>=WW||y<0||y>=HH)return false;
 const dx=x+.5-(player.x+.45),dy=y+.5-(player.y+.5);
 return dx*dx+dy*dy<=19;
}
function interact(x,y){
 if(!validReach(x,y)){message("Подойдите поближе к выбранному блоку.");return}
 if(mode==="mine"){
  if(grid[y][x]){grid[y][x]=0;found++;blocks++;resources();message("Блок добыт! Можно использовать его для строительства.")}
  else message("Здесь нет блока. Выберите землю или камень.");
 }else{
  if(!blocks){message("Блоки закончились. Сначала добудьте землю или камень.");return}
  if(grid[y][x]){message("Здесь уже есть блок.");return}
  if(x+.95>player.x&&x<player.x+.85&&y+1>player.y&&y<player.y+1){message("Нельзя поставить блок внутри героя.");return}
  grid[y][x]=2;blocks--;resources();message("Блок поставлен!");
 }
}
function action(){
 const x=Math.floor(player.x+.45+player.dir*1.2),y=Math.floor(player.y+1);
 interact(x,Math.max(0,Math.min(HH-1,y)));
}
function key(event,on){
 const map={ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down",a:"left",d:"right",w:"up",s:"down"};
 const d=map[event.key];
 if(d){
  event.preventDefault();
  if(on){keys.add(d);if(d==="up")jump();}
  else keys.delete(d);
 }
 if(on&&(event.key===" "||event.key==="Space"||event.code==="Space")){event.preventDefault();action();}
}
document.addEventListener("keydown",e=>key(e,true));
document.addEventListener("keyup",e=>key(e,false));
let pointer=null;
canvas.addEventListener("pointerdown",e=>{
 pointer={x:e.clientX,y:e.clientY};
 try{canvas.setPointerCapture(e.pointerId)}catch{}
});
canvas.addEventListener("pointerup",e=>{
 if(!pointer)return;
 const px=e.clientX-pointer.x,py=e.clientY-pointer.y;pointer=null;
 if(Math.hypot(px,py)>20)return;
 const box=canvas.getBoundingClientRect();
 const x=Math.floor((e.clientX-box.left)*720/box.width+camera)/T;
 const y=(e.clientY-box.top)*420/box.height/T;
 interact(Math.floor(x),Math.floor(y));
});
canvas.addEventListener("pointercancel",()=>{pointer=null});
function tile(x,y,type){
 const dx=x*T-camera,dy=y*T;
 if(dx<-T||dx>720+T)return;
 ctx.fillStyle=tileColor[{1:"grass",2:"dirt",3:"stone",4:"ore"}[type]];
 ctx.fillRect(dx,dy,T,T);
 if(type===1){ctx.fillStyle="#85d869";ctx.fillRect(dx,dy,T,7);ctx.fillStyle="#387947";ctx.fillRect(dx,dy+7,T,3);}
 if(type===2){ctx.fillStyle="#b08b62";ctx.fillRect(dx+3,dy+11,7,3);ctx.fillRect(dx+19,dy+21,6,4)}
 if(type===3){ctx.fillStyle="#8b9cac";ctx.fillRect(dx+3,dy+3,12,4);ctx.fillRect(dx+17,dy+16,9,3)}
 if(type===4){ctx.fillStyle="#ffe29b";ctx.fillRect(dx+7,dy+9,7,9);ctx.fillRect(dx+19,dy+18,6,6)}
 ctx.strokeStyle="rgba(15,25,38,.10)";ctx.strokeRect(dx+.5,dy+.5,T-1,T-1);
}
function render(){
 const sky=ctx.createLinearGradient(0,0,0,420);sky.addColorStop(0,"#6db4ff");sky.addColorStop(1,"#d5ecff");
 ctx.fillStyle=sky;ctx.fillRect(0,0,720,420);
 ctx.fillStyle="#fff0a5";ctx.beginPath();ctx.arc(615-camera*.05,75,31,0,Math.PI*2);ctx.fill();
 for(const c of clouds){
  const x=c.x-camera*.35;ctx.fillStyle="rgba(255,255,255,.83)";
  for(const [px,py,r] of [[0,0,22],[23,-10,27],[50,0,22]]){ctx.beginPath();ctx.arc(x+px,c.y+py,r,0,Math.PI*2);ctx.fill()}
 }
 const left=Math.max(0,Math.floor(camera/T)-1),right=Math.min(WW,Math.ceil((camera+720)/T)+1);
 for(let y=0;y<HH;y++)for(let x=left;x<right;x++)if(grid[y][x])tile(x,y,grid[y][x]);
 const px=player.x*T-camera,py=player.y*T;
 ctx.fillStyle="#344d85";ctx.fillRect(px+5,py+14,18,16);
 ctx.fillStyle="#ffd1aa";ctx.fillRect(px+4,py+2,21,17);
 ctx.fillStyle="#6f4e36";ctx.fillRect(px+3,py,22,7);
 ctx.fillStyle="#252c39";ctx.fillRect(px+(player.dir>0?20:7),py+9,3,3);
 ctx.fillStyle="#293a62";ctx.fillRect(px+6,py+27,7,5);ctx.fillRect(px+17,py+27,7,5);
 ctx.fillStyle="#fff";ctx.font="bold 12px system-ui";ctx.fillText("Построй свой мир",15,23);
}
function loop(now){
 const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
 if(started){update(dt);render();}
 requestAnimationFrame(loop);
}
init();requestAnimationFrame(loop);
})();
</script></body></html>`;
export function blockSandboxHTML(idea){
 const title=String(idea||'Блочный мир').trim().slice(0,75).replace(/[&<>]/g,'');
 return SOURCE.replace('⛏ Блочный мир · NEXORA','⛏ '+title+' · 2D');
}
