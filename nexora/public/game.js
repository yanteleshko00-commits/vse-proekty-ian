"use strict";
// All game mechanics run locally. AI responses are text-only game plans, never code.
const $=id=>document.getElementById(id);
const canvas=$("game"),ctx=canvas.getContext("2d"),W=660,H=420;
const tones={
 violet:{bg:"#faf7ff",grid:"#ebe1fb",main:"#855cda",dark:"#4d348d",accent:"#f8b84e",bad:"#e36e8e"},
 blue:{bg:"#f5faff",grid:"#deecff",main:"#4284e8",dark:"#2e5494",accent:"#f9bd57",bad:"#e56e80"},
 mint:{bg:"#f3fcf9",grid:"#ddf1e8",main:"#41aa8b",dark:"#206c65",accent:"#f8b64c",bad:"#e87586"},
 sunset:{bg:"#fff9f7",grid:"#fde6de",main:"#dd7a83",dark:"#934f70",accent:"#f2b34e",bad:"#af5b80"}
};
const GAME_KINDS=["auto","catch","snake","target"];
let type="auto",plan=null,status="idle",last=0,frame=0,session=null,held=new Set(),loading=false;
function text(id,value){$(id).textContent=String(value)}
function showError(message){text("error",message);$("error").classList.add("show")}
function clearError(){$("error").classList.remove("show");text("error","")}
function chooseType(next){type=GAME_KINDS.includes(next)?next:"auto";document.querySelectorAll("[data-type].choice").forEach(b=>{let active=b.dataset.type===type;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active))})}
document.querySelectorAll(".choice[data-type]").forEach(b=>b.addEventListener("click",()=>chooseType(b.dataset.type)));
document.querySelectorAll(".example").forEach(b=>b.addEventListener("click",()=>{$("idea").value=b.dataset.idea;chooseType(b.dataset.type);$("idea").focus()}));
function inferred(idea){
 const p=String(idea).toLowerCase();
 return /змейк|snake|лабиринт/.test(p)?"snake":/мишен|реакци|тап|цель|стреля|попади/.test(p)?"target":"catch";
}
function fallback(input){
 const selected=input.type==="auto"?inferred(input.idea):input.type;
 const presets={
 catch:["Лови звёзды","Перемещайтесь влево и вправо, собирайте звёзды и избегайте препятствий."],
 snake:["Змейка","Управляйте змейкой, собирайте еду и не сталкивайтесь с препятствиями."],
 target:["Меткость","Нажимайте на движущиеся мишени и зарабатывайте очки до конца таймера."]
 };
 const [title,instructions]=presets[selected]||presets.catch;
 return {type:selected,title,instructions,color:input.color,difficulty:input.level,aiUsed:false,provider:"Игровой движок NEXORA"};
}
async function create(){
 if(loading)return;
 clearError();
 const idea=$("idea").value.trim();
 if(idea.length<5){showError("Опишите идею игры хотя бы в нескольких словах.");$("idea").focus();return}
 if(idea.length>500){showError("Описание игры слишком длинное.");return}
 const input={idea,type,level:$("difficulty").value,color:$("color").value};
 loading=true;$("generate").disabled=true;
 $("stage").hidden=false;$("play-area").classList.remove("visible");
 $("stage").classList.add("wait");text("stage-icon","✦");text("stage-title","Продумываю игру…");text("stage-description","Нейросеть подбирает название и правила. Сам игровой движок уже готов.");
 let item=fallback(input);
 try{
  const response=await fetch("/api/game/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input),signal:AbortSignal.timeout(59000)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok||!result.game)throw Error(result.message||"Модель пока недоступна.");
  item=result.game;
 }catch(error){
  console.warn("Game concept fallback:",error.message);
  text("stage-description","Концепция создана из готового игрового шаблона. ИИ не ответил, но игра всё равно работает.");
 }finally{loading=false;$("generate").disabled=false;$("stage").classList.remove("wait")}
 install(item);
}

const nxqSteps=[
 {key:"type",question:"Какая механика игры?",options:[["auto","✦ Определить автоматически"],["catch","★ Лови звёзды"],["snake","〰 Змейка"],["target","◎ Меткость"]]},
 {key:"difficulty",question:"Какой уровень сложности?",options:[["easy","Лёгкий"],["normal","Обычный"],["hard","Сложный"]]},
 {key:"color",question:"Как оформить игру?",options:[["violet","Сиреневый"],["blue","Голубой"],["mint","Мятный"],["sunset","Закат"]]}
];
let nxqIndex=0,nxqAnswers={};
function nxqOpenGame(){
 if(loading)return;
 const idea=$("idea").value.trim();
 if(idea.length<5){showError("Опишите идею игры хотя бы в нескольких словах.");$("idea").focus();return}
 nxqIndex=0;
 nxqAnswers={type,difficulty:$("difficulty").value,color:$("color").value};
 $("nxq-preview").textContent=idea.slice(0,175);
 $("nxquiz").hidden=false;nxqRenderGame();$("nxq-back").focus();
}
function nxqRenderGame(){
 const step=nxqSteps[nxqIndex];
 $("nxq-question").textContent=step.question;
 $("nxq-count").textContent="Шаг "+(nxqIndex+1)+" из "+nxqSteps.length;
 $("nxq-track").setAttribute("aria-valuenow",String(nxqIndex+1));
 $("nxq-fill").style.width=((nxqIndex+1)*100/nxqSteps.length)+"%";
 const host=$("nxq-options");host.replaceChildren();
 for(const [value,label] of step.options){
  const option=document.createElement("button");option.type="button";option.className="nxq-option";option.textContent=label;
  option.setAttribute("aria-pressed",String(nxqAnswers[step.key]===value));
  option.addEventListener("click",()=>{nxqAnswers[step.key]=value;nxqRenderGame()});
  host.appendChild(option);
 }
 $("nxq-next").textContent=nxqIndex===nxqSteps.length-1?"✦ Создать игру":"Далее →";
}
function nxqAdvanceGame(skip=false){
 const step=nxqSteps[nxqIndex];
 if(skip)nxqAnswers[step.key]={type:"auto",difficulty:"normal",color:"violet"}[step.key];
 if(nxqIndex<nxqSteps.length-1){nxqIndex++;nxqRenderGame();return}
 $("nxquiz").hidden=true;
 chooseType(nxqAnswers.type||"auto");
 $("difficulty").value=nxqAnswers.difficulty||"normal";
 $("color").value=nxqAnswers.color||"violet";
 void create().then(()=>{if(plan&&status==="ready")start()});
}
$("nxq-next").addEventListener("click",()=>nxqAdvanceGame());
$("nxq-skip").addEventListener("click",()=>nxqAdvanceGame(true));
$("nxq-back").addEventListener("click",()=>{if(nxqIndex===0){$("nxquiz").hidden=true;return}nxqIndex--;nxqRenderGame()});

$("generate").addEventListener("click",nxqOpenGame);
function install(item){
 const t=["catch","snake","target"].includes(item.type)?item.type:"catch";
 const diff=["easy","normal","hard"].includes(item.difficulty)?item.difficulty:"normal";
 const color=Object.prototype.hasOwnProperty.call(tones,item.color)?item.color:"violet";
 plan={type:t,difficulty:diff,color,title:String(item.title||"Новая игра").slice(0,60),instructions:String(item.instructions||"Набирайте очки и соревнуйтесь с собой.").slice(0,210),provider:String(item.provider||"Игровой движок NEXORA").slice(0,80),aiUsed:!!item.aiUsed};
 text("game-title",plan.title);text("instructions",plan.instructions);
 text("provider",plan.aiUsed?"Идея: "+plan.provider+" · движок NEXORA":"Готовый игровой движок NEXORA");
 text("state-label","ГОТОВО / PLAY");
 $("stage").hidden=true;$("play-area").classList.add("visible");
 resetGame();
 if(window.innerWidth<920&&!document.body.classList.contains("standalone"))$("result-card").scrollIntoView({behavior:"smooth",block:"start"});
}
function randomCell(snake){
 for(let i=0;i<120;i++){const p={x:Math.floor(Math.random()*22),y:Math.floor(Math.random()*14)};if(!snake.some(v=>v.x===p.x&&v.y===p.y))return p}
 return {x:2,y:2};
}
function resetGame(){
 if(!plan)return;
 cancelAnimationFrame(frame);frame=0;held.clear();status="ready";last=0;
 session={score:0,elapsed:0,lives:3,items:[],spawn:0,playerX:W/2,
  snake:[{x:10,y:7},{x:9,y:7},{x:8,y:7}],dir:{x:1,y:0},next:{x:1,y:0},clock:0,
  food:null,target:null,hits:0,miss:0
 };
 session.food=randomCell(session.snake);
 spawnTarget();
 text("start","▶ Играть");text("pause","Ⅱ Пауза");updateScores();draw();
}
function updateScores(){
 if(!session)return;
 text("score","Очки: "+session.score);
 const max=plan?.type==="target"?45:plan?.type==="catch"?60:0;
 text("time",max?"Время: "+Math.max(0,Math.ceil(max-session.elapsed)):"Время: "+Math.floor(session.elapsed));
 $("lives").hidden=plan?.type==="target";
 text("lives","Жизни: "+session.lives);
}
function start(){
 if(!plan)return;
 if(status==="finished")resetGame();
 if(status==="playing")return;
 status="playing";text("start","▶ Идёт игра");text("pause","Ⅱ Пауза");
 last=performance.now();cancelAnimationFrame(frame);frame=requestAnimationFrame(loop);
}
function pause(){
 if(status==="playing"){status="paused";text("pause","▶ Продолжить");cancelAnimationFrame(frame);frame=0;draw();}
 else if(status==="paused"){start()}
}
$("start").addEventListener("click",()=>{if(status==="playing")return;start()});
$("pause").addEventListener("click",pause);
document.addEventListener("nexora-classic-close",()=>{if(status==="playing")pause();held.clear();});
$("reset").addEventListener("click",()=>{resetGame();start()});
function endGame(message){
 status="finished";cancelAnimationFrame(frame);frame=0;draw();
 ctx.fillStyle="rgba(36,23,65,.83)";ctx.fillRect(110,125,440,176);
 ctx.textAlign="center";ctx.fillStyle="#fff";ctx.font="800 28px system-ui";ctx.fillText(message,330,195);
 ctx.font="700 18px system-ui";ctx.fillText("Очки: "+session.score+" · Нажмите «Играть» ещё раз",330,236);
 text("start","↻ Играть ещё раз");text("pause","Ⅱ Пауза");
}
function loop(now){
 if(status!=="playing")return;
 const dt=Math.min(.06,Math.max(0,(now-last)/1000));last=now;
 session.elapsed+=dt;
 if(plan.type==="catch")tickCatch(dt);
 if(plan.type==="snake")tickSnake(dt);
 if(plan.type==="target")tickTarget(dt);
 if(status!=="playing")return;
 updateScores();draw();frame=requestAnimationFrame(loop);
}
function tickCatch(dt){
 const difficulty={easy:.78,normal:1,hard:1.34}[plan.difficulty];
 if(held.has("left"))session.playerX-=340*dt;
 if(held.has("right"))session.playerX+=340*dt;
 session.playerX=Math.max(44,Math.min(W-44,session.playerX));
 session.spawn+=dt;
 if(session.spawn>.62/difficulty){session.spawn=0;session.items.push({x:25+Math.random()*(W-50),y:-18,speed:(145+Math.random()*65)*difficulty,bad:Math.random()<.22,r:13})}
 for(const object of session.items){
  object.y+=object.speed*dt;
  if(object.y>H-54&&object.y<H-18&&Math.abs(object.x-session.playerX)<49){
   object.y=H+100;
   if(object.bad)session.lives--;else session.score+=10;
  }
 }
 session.items=session.items.filter(x=>x.y<H+25);
 if(session.lives<=0)endGame("Препятствия победили");
 else if(session.elapsed>=60)endGame("Время вышло!");
}
function tickSnake(dt){
 session.clock+=dt*1000;
 const interval={easy:190,normal:145,hard:105}[plan.difficulty];
 if(session.clock<interval)return;
 session.clock=0;
 session.dir={...session.next};
 const head={x:session.snake[0].x+session.dir.x,y:session.snake[0].y+session.dir.y};
 const eating=head.x===session.food.x&&head.y===session.food.y;
 const own=session.snake.slice(0,eating?undefined:-1);
 if(head.x<0||head.x>=22||head.y<0||head.y>=14||own.some(p=>p.x===head.x&&p.y===head.y))return endGame("Змейка закончила путь");
 session.snake.unshift(head);
 if(eating){session.score+=10;session.food=randomCell(session.snake)}
 else session.snake.pop();
}
function spawnTarget(){
 if(!session)return;
 session.target={x:45+Math.random()*(W-90),y:45+Math.random()*(H-90),r:30,vx:(Math.random()>.5?1:-1)*75,vy:(Math.random()>.5?1:-1)*65};
}
function tickTarget(dt){
 const t=session.target,mult={easy:.55,normal:1,hard:1.45}[plan.difficulty];
 if(t){t.x+=t.vx*mult*dt;t.y+=t.vy*mult*dt;
  if(t.x<t.r||t.x>W-t.r)t.vx*=-1;
  if(t.y<t.r||t.y>H-t.r)t.vy*=-1;
  t.x=Math.max(t.r,Math.min(W-t.r,t.x));t.y=Math.max(t.r,Math.min(H-t.r,t.y));
 }
 if(session.elapsed>=45)endGame("Время вышло!");
}
function drawStar(x,y,r,color){
 ctx.beginPath();
 for(let k=0;k<10;k++){
  const a=-Math.PI/2+k*Math.PI/5,rad=k%2?r*.48:r;
  if(k===0)ctx.moveTo(x+Math.cos(a)*rad,y+Math.sin(a)*rad);
  else ctx.lineTo(x+Math.cos(a)*rad,y+Math.sin(a)*rad);
 }
 ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
function rounded(x,y,w,h,r,color){
 ctx.fillStyle=color;ctx.beginPath();
 ctx.roundRect(x,y,w,h,r);ctx.fill();
}
function draw(){
 if(!ctx||!plan||!session)return;
 const p=tones[plan.color];
 ctx.clearRect(0,0,W,H);ctx.fillStyle=p.bg;ctx.fillRect(0,0,W,H);
 ctx.strokeStyle=p.grid;ctx.lineWidth=1;
 for(let x=0;x<=W;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
 for(let y=0;y<=H;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
 if(plan.type==="catch"){
  for(const i of session.items){if(i.bad){ctx.fillStyle=p.bad;ctx.beginPath();ctx.arc(i.x,i.y,i.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(i.x-5,i.y-5);ctx.lineTo(i.x+5,i.y+5);ctx.moveTo(i.x+5,i.y-5);ctx.lineTo(i.x-5,i.y+5);ctx.stroke()}
  else drawStar(i.x,i.y,i.r,p.accent)}
  rounded(session.playerX-42,H-52,84,24,12,p.main);
  rounded(session.playerX-19,H-68,38,22,9,p.dark);
 }else if(plan.type==="snake"){
  const sz=30;
  session.snake.forEach((v,index)=>rounded(v.x*sz+2,v.y*sz+2,sz-4,sz-4,8,index===0?p.dark:p.main));
  drawStar(session.food.x*sz+15,session.food.y*sz+15,12,p.accent);
 }else if(plan.type==="target"){
  const t=session.target;
  if(t){
   ctx.fillStyle=p.bad;ctx.beginPath();ctx.arc(t.x,t.y,t.r,0,Math.PI*2);ctx.fill();
   ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(t.x,t.y,t.r*.65,0,Math.PI*2);ctx.fill();
   ctx.fillStyle=p.main;ctx.beginPath();ctx.arc(t.x,t.y,t.r*.34,0,Math.PI*2);ctx.fill();
  }
 }
 if(status==="paused"){
  rounded(187,153,286,114,18,"rgba(33,25,57,.85)");
  ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="800 27px system-ui";ctx.fillText("Пауза",330,219);
 }
 if(status==="ready"){
  rounded(132,158,396,101,18,"rgba(43,31,75,.77)");
  ctx.fillStyle="#fff";ctx.textAlign="center";ctx.font="800 22px system-ui";ctx.fillText("Нажмите «Играть»",330,217);
 }
}
function direction(dir){
 if(!plan||!session)return;
 if(plan.type==="snake"){
  const next={left:{x:-1,y:0},right:{x:1,y:0},up:{x:0,y:-1},down:{x:0,y:1}}[dir];
  if(next&&(next.x!==-session.dir.x||next.y!==-session.dir.y))session.next=next;
 }else if(plan.type==="catch"){
  if(dir==="left")session.playerX=Math.max(44,session.playerX-34);
  if(dir==="right")session.playerX=Math.min(W-44,session.playerX+34);
  if(status!=="playing")draw();
 }
}
document.querySelectorAll("[data-dir]").forEach(b=>{
 const dir=b.dataset.dir;
 b.addEventListener("pointerdown",e=>{e.preventDefault();held.add(dir);direction(dir)});
 for(const ev of ["pointerup","pointerleave","pointercancel"])b.addEventListener(ev,()=>held.delete(dir));
 b.addEventListener("click",()=>direction(dir));
});
document.addEventListener("keydown",e=>{
 const tag=document.activeElement?.tagName;
 if(["INPUT","TEXTAREA","SELECT"].includes(tag))return;
 const dir={ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down",KeyA:"left",KeyD:"right",KeyW:"up",KeyS:"down",a:"left",d:"right",w:"up",s:"down"}[e.code||e.key];
 if(dir){if(!plan)return;e.preventDefault();held.add(dir);direction(dir)}
 if(e.code==="Space"&&plan&&!e.repeat){e.preventDefault();if(status==="ready"||status==="finished")start();else pause()}
});
document.addEventListener("keyup",e=>{const dir={ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down",KeyA:"left",KeyD:"right",KeyW:"up",KeyS:"down",a:"left",d:"right",w:"up",s:"down"}[e.code||e.key];if(dir)held.delete(dir)});
let pointerStart=null;
canvas.addEventListener("pointerdown",e=>{
 if(!plan||status!=="playing")return;
 const box=canvas.getBoundingClientRect(),x=(e.clientX-box.left)*W/box.width,y=(e.clientY-box.top)*H/box.height;
 if(e.pointerType==="mouse"&&e.button!==0)return;
  pointerStart={x,y};try{canvas.setPointerCapture(e.pointerId)}catch{}
 if(plan.type==="target"){
  const t=session.target;
  if(t&&Math.hypot(x-t.x,y-t.y)<t.r+5){session.score+=10;session.hits++;spawnTarget()}else session.miss++;
 }else if(plan.type==="catch"){session.playerX=Math.max(44,Math.min(W-44,x))}
});
canvas.addEventListener("pointermove",e=>{
 if(plan?.type!=="catch"||status!=="playing"||(!pointerStart&&e.pointerType!=="mouse"))return;
 const box=canvas.getBoundingClientRect(),x=(e.clientX-box.left)*W/box.width;
 session.playerX=Math.max(44,Math.min(W-44,x));
});
canvas.addEventListener("pointerup",e=>{
 if(plan?.type==="snake"&&pointerStart){
  const box=canvas.getBoundingClientRect(),x=(e.clientX-box.left)*W/box.width,y=(e.clientY-box.top)*H/box.height,dx=x-pointerStart.x,dy=y-pointerStart.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))>17)direction(Math.abs(dx)>Math.abs(dy)?dx>0?"right":"left":dy>0?"down":"up");
 }
 pointerStart=null;
});
canvas.addEventListener("pointercancel",()=>{pointerStart=null});
canvas.addEventListener("lostpointercapture",()=>{pointerStart=null});
window.addEventListener("blur",()=>{held.clear();pointerStart=null});
document.addEventListener("visibilitychange",()=>{if(document.hidden){held.clear();pointerStart=null}});
async function download(){
 if(!plan)return;
 $("download").disabled=true;
 try{
  const [pageResponse,jsResponse]=await Promise.all([fetch("/game"),fetch("/game.js")]);
  if(!pageResponse.ok||!jsResponse.ok)throw Error("Не удалось получить файлы игры.");
  const [html,js]=await Promise.all([pageResponse.text(),jsResponse.text()]);
  const scriptEnd="</scr"+"ipt>",scriptStart="<scr"+"ipt>";
  const preset=JSON.stringify(plan).replace(/</g,"\\u003c").replace(/>/g,"\\u003e");
  const cleanJs=js.replace(/<\/script/gi,"<\\/script");
  const code=scriptStart+"window.__GAME_PRESET__="+preset+";"+scriptEnd+scriptStart+cleanJs+scriptEnd;
  const compiled=html.replace('<script src="/game.js"></script>',code);
  if(compiled===html)throw Error("Не удалось собрать игру.");
  const link=document.createElement("a"),file=URL.createObjectURL(new Blob([compiled],{type:"text/html;charset=utf-8"}));
  link.href=file;link.download="nexora-game-"+plan.type+".html";document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(file),12000);
 }catch(error){showError(error.message||"Ошибка сохранения HTML.")}finally{$("download").disabled=false}
}
$("download").addEventListener("click",download);
if(window.__GAME_PRESET__){
 document.body.classList.add("standalone");install(window.__GAME_PRESET__);start();
}
