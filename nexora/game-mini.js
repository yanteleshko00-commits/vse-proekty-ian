// Three compact offline games. Never embed the NEXORA Game Studio page in a preview.
const TEMPLATE=String.raw`<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}body{margin:0;background:#10192d;color:#eef4ff;font:600 14px system-ui}
.wrap{padding:10px;max-width:850px;margin:auto}
header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
header strong{font-size:16px}header span{font-size:12px;color:#a8b9e1}
canvas{display:block;width:100%;height:auto;aspect-ratio:12/7;touch-action:none;border:1px solid #395375;border-radius:14px;background:#182744}
footer{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-top:10px}
footer span{font-size:11px;color:#adbedc}button{border:0;border-radius:10px;padding:9px 13px;background:#6981ed;color:#fff;font-weight:700}
</style></head><body><div class="wrap">
<header><strong id="title">Игра</strong><span id="score">Очки: 0</span></header>
<canvas id="board" width="720" height="420" aria-label="Игровое поле"></canvas>
<footer><span id="hint">Стрелки и свайпы</span><button id="reset">↻ Заново</button></footer>
</div><script>
(function(){
"use strict";
const cfg=__CONFIG__,mode=cfg.mode,W=720,H=420,canvas=document.getElementById("board"),ctx=canvas.getContext("2d");
const held=new Set();let state,last=performance.now();
document.getElementById("title").textContent=cfg.title;
document.getElementById("hint").textContent=mode==="snake"?"Собирайте яблоки, избегайте стен":mode==="target"?"Нажимайте на движущиеся цели":"← → : собирайте звёзды";
function newFood(snake){
 for(let i=0;i<100;i++){const x=Math.floor(Math.random()*23),y=Math.floor(Math.random()*13);
 if(!snake.some(p=>p.x===x&&p.y===y))return {x,y}}
 return {x:10,y:10};
}
function reset(){
 const snake=[{x:10,y:6},{x:9,y:6},{x:8,y:6}];
 state={score:0,over:false,t:0,clock:0,spawn:0,lives:3,basket:360,items:[],snake,food:newFood(snake),dir:"right",next:"right",
 target:{x:290,y:200,vx:150,vy:140,r:29}};
 document.getElementById("score").textContent="Очки: 0";
 last=performance.now();
}
function point(n){state.score+=n;document.getElementById("score").textContent="Очки: "+state.score}
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h)}
function circle(x,y,r,c){ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
function tick(dt){
 const s=state;if(s.over)return;s.t+=dt;
 if(mode==="snake"){
  s.clock+=dt;
  if(s.clock<.17)return;s.clock=0;s.dir=s.next;
  const dir={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]}[s.dir];
  const head={x:s.snake[0].x+dir[0],y:s.snake[0].y+dir[1]};
  const eat=head.x===s.food.x&&head.y===s.food.y;
  const body=eat?s.snake:s.snake.slice(0,-1);
  if(head.x<0||head.x>=24||head.y<0||head.y>=14||body.some(p=>p.x===head.x&&p.y===head.y)){s.over=true;return}
  s.snake.unshift(head);
  if(eat){point(10);s.food=newFood(s.snake)}else s.snake.pop();
 }else if(mode==="target"){
  const t=s.target;t.x+=t.vx*dt;t.y+=t.vy*dt;
  if(t.x<t.r||t.x>W-t.r)t.vx*=-1;
  if(t.y<t.r||t.y>H-t.r)t.vy*=-1;
  if(s.t>60)s.over=true;
 }else{
  if(held.has("left"))s.basket-=370*dt;
  if(held.has("right"))s.basket+=370*dt;
  s.basket=Math.max(42,Math.min(W-42,s.basket));
  s.spawn+=dt;
  if(s.spawn>.47){s.spawn=0;s.items.push({x:30+Math.random()*(W-60),y:-15,bad:Math.random()<.22})}
  s.items.forEach(o=>{
   o.y+=205*dt;
   if(o.y>H-49&&o.y<H-20&&Math.abs(o.x-s.basket)<43){
    o.y=H+50;if(o.bad){s.lives--;if(s.lives<=0)s.over=true}else point(10);
   }
  });
  s.items=s.items.filter(o=>o.y<H+20);
  if(s.t>65)s.over=true;
 }
}
function render(){
 const s=state;rect(0,0,W,H,"#172843");
 ctx.strokeStyle="#263953";for(let x=0;x<W;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
 for(let y=0;y<H;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
 if(mode==="snake"){
  s.snake.forEach((p,i)=>rect(p.x*30+2,p.y*30+2,26,26,i?"#65bfa0":"#ecda7f"));
  circle(s.food.x*30+15,s.food.y*30+15,12,"#f57e8e");
 }else if(mode==="target"){
  circle(s.target.x,s.target.y,s.target.r,"#f57e8e");
  circle(s.target.x,s.target.y,19,"#fff");circle(s.target.x,s.target.y,8,"#667de5");
 }else{
  s.items.forEach(o=>circle(o.x,o.y,13,o.bad?"#ee6886":"#f6c777"));
  rect(s.basket-43,H-42,86,22,"#82b6ff");
  ctx.fillStyle="#fff";ctx.font="bold 15px system-ui";ctx.fillText("Жизни: "+s.lives,18,28);
 }
 if(s.over){
  rect(110,145,500,128,"#081326");
  ctx.textAlign="center";ctx.fillStyle="#fff";ctx.font="bold 25px system-ui";
  ctx.fillText("Раунд окончен",360,201);ctx.font="16px system-ui";
  ctx.fillText("Очки: "+s.score+" · Нажмите «Заново»",360,240);ctx.textAlign="left";
 }
}
function key(e,down){
 const name={ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down",a:"left",d:"right",w:"up",s:"down"}[e.key];
 if(!name)return;e.preventDefault();
 if(down){
  held.add(name);
  if(mode==="snake"){
   const opposite={left:"right",right:"left",up:"down",down:"up"};
   if(name!==opposite[state.dir])state.next=name;
  }
 }else held.delete(name);
}
document.addEventListener("keydown",e=>key(e,true));
document.addEventListener("keyup",e=>key(e,false));
canvas.addEventListener("pointerdown",e=>{
 if(state.over)return;
 const bounds=canvas.getBoundingClientRect();
 const x=(e.clientX-bounds.left)*W/bounds.width,y=(e.clientY-bounds.top)*H/bounds.height;
 if(mode==="target"){
  const t=state.target;
  if(Math.hypot(x-t.x,y-t.y)<t.r+10){
   point(10);t.x=40+Math.random()*(W-80);t.y=40+Math.random()*(H-80);
  }
 }else if(mode==="catch"){state.basket=x}
});
document.getElementById("reset").addEventListener("click",reset);
function loop(now){
 const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
 tick(dt);render();requestAnimationFrame(loop);
}
reset();requestAnimationFrame(loop);
})();
</script></body></html>`;
export function miniGameHTML(idea,mode){
 const title=String(idea||"Мини-игра").trim().slice(0,70);
 const cfg=JSON.stringify({title,mode}).replace(/</g,"\\u003c").replace(/>/g,"\\u003e");
 return TEMPLATE.replace("__CONFIG__",cfg);
}
