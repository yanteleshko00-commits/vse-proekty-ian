"use strict";
// NEXORA Game Studio: description -> actual HTML source -> isolated live game.
// No AI or user code is ever evaluated in the parent NEXORA document.
(function(){
 const $=id=>document.getElementById(id);
 const idea=$("ai-idea"),build=$("ai-build"),code=$("ai-source"),frame=$("ai-frame");
 const status=$("ai-status"),error=$("ai-error");
 const playTab=$("ai-play-tab"),codeTab=$("ai-code-tab");
 const DRAFT_KEY="nexora-game-idea-draft-v1";
 const MODE_KEY="nexora-game-dimension-v1";
 let dimension="auto";
 let raw="",compiled="",busy=false,ready=false,sourceKind="";
 function setStatus(message){status.textContent=message;}
 function fail(message){error.hidden=false;error.textContent=String(message||"Ошибка генерации.").slice(0,400);}
 function clearError(){error.hidden=true;error.textContent="";}

 function selectDimension(next){
  if(!["auto","2d","3d"].includes(next))return;
  dimension=next;
  document.querySelectorAll("[data-game-dimension]").forEach(button=>{
   const chosen=button.dataset.gameDimension===dimension;
   button.classList.toggle("selected",chosen);
   button.setAttribute("aria-pressed",String(chosen));
  });
  try{localStorage.setItem(MODE_KEY,dimension);}catch{}
 }
 function setLoader(active){
  $("ai-loading").hidden=!active;
  $("ai-placeholder").classList.toggle("is-building",active);
 }
 function saveDraft(value){
  try{localStorage.setItem(DRAFT_KEY,value.slice(0,500));}catch{}
 }
 function setBusy(value){
  busy=value;build.disabled=value;$("ai-run-code").disabled=value;
  build.textContent=value?"✦ Создаю код и запускаю…":"✦ Создать и запустить игру";
 }
 function showTab(which){
  const isCode=which==="code";
  $("ai-game-view").hidden=isCode;
  $("ai-code-view").hidden=!isCode;
  playTab.classList.toggle("active",!isCode);codeTab.classList.toggle("active",isCode);
  playTab.setAttribute("aria-selected",String(!isCode));codeTab.setAttribute("aria-selected",String(isCode));
 }
 function showReady(){
  setLoader(false);
  $("ai-placeholder").hidden=true;$("ai-result").hidden=false;
  $("ai-game-view").classList.remove("ai-enter");void $("ai-game-view").offsetWidth;$("ai-game-view").classList.add("ai-enter");
  $("ai-toolbar").hidden=false;ready=true;
  showTab("play");
  if(window.matchMedia("(max-width:900px)").matches)
   $("ai-result-card").scrollIntoView({behavior:"smooth",block:"start"});
 }
 async function compileGame(html){
  const response=await fetch("/api/game/preview",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({html}),signal:AbortSignal.timeout(18000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok||!data.url)throw Error(data.message||"Не получилось запустить код.");
  // Only the server-sanitized, expiring same-origin URL is loaded, and it is
  // rendered with a unique opaque origin thanks to iframe[sandbox=allow-scripts].
  if(!/^\/game\/preview\/[0-9a-f-]{36}$/.test(data.url))throw Error("Некорректный адрес предпросмотра.");
  compiled=data.html||"";frame.src=data.url;
 }
 async function createGame(){
  if(busy)return;
  clearError();
  const description=idea.value.trim();
  saveDraft(description);
  if(description.length<2){fail("Напишите название или короткое описание игры.");idea.focus();return;}
  if(description.length>500){fail("Описание не должно превышать 500 символов.");return;}
  setBusy(true);setStatus("ИИ создаёт "+(dimension==="3d"?"трёхмерный":"игровой")+" мир, код и управление…");
  ready=false;setLoader(true);
  $("ai-placeholder").hidden=false;
  $("ai-result").hidden=true;$("ai-toolbar").hidden=true;
  $("ai-placeholder-title").textContent="Создаю вашу игру…";
  $("ai-placeholder-description").textContent="ИИ определяет механику, создаёт HTML, JavaScript и "+(dimension==="3d"?"3D-сцену на WebGL.":"игровые объекты.");
  try{
   const startJob=()=>fetch("/api/game/code",{
    method:"POST",headers:{"Content-Type":"application/json","X-NEXORA-Async":"1"},
    body:JSON.stringify({idea:description,dimension}),signal:AbortSignal.timeout(20000)
   });
   let response=await startJob();
   let data=await response.json().catch(()=>({}));
   let jobId=data.jobId,deadline=Date.now()+185000,missing=0,restarted=false;
   while(response.status===202&&data.pending&&jobId){
    if(Date.now()>deadline)throw Error("ИИ не завершил генерацию за отведённое время.");
    await new Promise(resolve=>setTimeout(resolve,2500));
    try{
     response=await fetch("/api/game/code",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({jobId}),signal:AbortSignal.timeout(15000)
     });
     if([502,503,504].includes(response.status)){
      const error=await response.json().catch(()=>null);
      if(error?.error==="generation_unavailable"){data=error;break;}
      response={status:202,ok:true};data={pending:true};continue;
     }
     data=await response.json().catch(()=>({}));
    }catch(error){
     response={status:202,ok:true};data={pending:true};continue;
    }
    if(response.status===404&&(data.error==="job_missing"||!data.error)){
     if(restarted&&missing>=2)throw Error("Сервер снова потерял задание. Ваше описание сохранено.");
     if(++missing<3){response={status:202,ok:true};data={pending:true};continue;}
     restarted=true;missing=0;
     setStatus("Сервер обновился. Восстанавливаю создание игры по вашему описанию…");
     response=await startJob();
     data=await response.json().catch(()=>({}));
     jobId=data.jobId;deadline=Date.now()+185000;
     continue;
    }
    missing=0;
   }
   if(!response.ok||!data.ok||typeof data.html!=="string")
    throw Error(data.message||"ИИ не смог написать игру. Попробуйте уточнить описание.");
   if(data.source!=="ai")throw Error("ИИ не создал код. Подмена вашего запроса готовым шаблоном отключена.");
   raw=data.html;code.value=raw;sourceKind=data.source;
   const renderedDimension=data.dimension==="3d"?"3d":dimension;
   $("ai-placeholder-title").textContent="Код создан — собираю игру…";
   $("ai-placeholder-description").textContent="Проверяю HTML и подготавливаю безопасное игровое окно.";
   setStatus("Код готов. Подготавливаю "+(dimension==="3d"?"3D WebGL":"игру")+" для запуска…");
   $("ai-game-title").textContent=data.title||description;
   $("ai-source-label").textContent="Код создан ИИ";
   $("ai-source-label").classList.add("generated");
   $("ai-description").textContent="ИИ создал "+(renderedDimension==="3d"?"3D WebGL-игру":"игру")+" по вашему описанию. Исходный код доступен во вкладке «Код».";
   $("ai-control-hint").textContent=renderedDimension==="3d"
    ?"В 3D: свайпайте по сцене для поворота камеры, экранные стрелки — движение, «Действие» — взаимодействие. На компьютере — WASD и мышь."
    :"На телефоне проводите пальцем по игровому полю или держите стрелки. Нажмите «Действие» для прыжка/выстрела.";
   setStatus("Код игры готов. Можно играть, редактировать и скачать HTML.");
   await compileGame(raw);showReady();
  }catch(e){
   $("ai-placeholder-title").textContent="Игра пока не создана";
   $("ai-placeholder-description").textContent="Ваш запрос сохранён. ИИ не создал игру — готовый шаблон вместо неё не подставляется.";
   setStatus("Не удалось подготовить игру.");
   fail(e.message||"Произошла ошибка при создании игры.");
  }finally{setBusy(false);setLoader(false);}
 }
 async function runEdited(){
  if(busy)return;
  clearError();
  const next=code.value.trim();
  if(next.length<300){fail("Вставьте полный HTML игры с JavaScript.");return;}
  setBusy(true);setStatus("Проверяю код и открываю игру…");
  try{
   await compileGame(next);
   raw=next;sourceKind="edited";
   $("ai-source-label").textContent="Код изменён";$("ai-source-label").classList.remove("generated");
   $("ai-description").textContent="Игра перезапущена из отредактированного HTML-кода.";
   showReady();setStatus("Изменения запущены.");
  }catch(e){fail(e.message||"Код не удалось запустить.");showTab("code");}
  finally{setBusy(false);}
 }
 function saveGame(){
  if(!compiled){fail("Сначала создайте игру.");return;}
  const file=new Blob([compiled],{type:"text/html;charset=utf-8"});
  const url=URL.createObjectURL(file),link=document.createElement("a");
  link.href=url;link.download="NEXORA-Game-"+(idea.value.trim().replace(/[^\p{L}\p{N}_-]/gu,"-").slice(0,40)||"my-game")+".html";
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),12000);
  setStatus("HTML-файл игры сохранён. Его можно открыть отдельно.");
 }
 function control(direction,action){
  if(!ready||!frame.contentWindow)return;
  if(!["left","right","up","down","space"].includes(direction))return;
  frame.contentWindow.postMessage({type:"nexora-game-control",direction,action},"*");
 }
 window.addEventListener("message",event=>{
  if(event.source!==frame.contentWindow||!event.data||event.data.type!=="nexora-game-error")return;
  const message=String(event.data.message||"Ошибка игрового кода").slice(0,170);
  setStatus("Ошибка выполнения игры: "+message);
  fail("Созданная игра запустилась с ошибкой. Откройте вкладку «Код» или создайте заново: "+message);
 });
 document.querySelectorAll("[data-game-arrow]").forEach(b=>{
  const dir=b.dataset.gameArrow;
  b.addEventListener("pointerdown",e=>{
   e.preventDefault();b.setPointerCapture?.(e.pointerId);control(dir,"down");
  });
  const stop=()=>control(dir,"up");
  b.addEventListener("pointerup",stop);
  b.addEventListener("pointercancel",stop);
  b.addEventListener("lostpointercapture",stop);
  b.addEventListener("click",e=>{if(e.detail===0)control(dir,"tap")});
 });
 document.querySelectorAll("[data-game-dimension]").forEach(b=>
  b.addEventListener("click",()=>selectDimension(b.dataset.gameDimension)));
 document.querySelectorAll("[data-ai-example]").forEach(b=>b.addEventListener("click",()=>{
  if(b.dataset.aiDimension)selectDimension(b.dataset.aiDimension);
  idea.value=b.dataset.aiExample||"";
  saveDraft(idea.value);
  void createGame();
 }));
 idea.addEventListener("input",()=>saveDraft(idea.value));
 try{
  const draft=localStorage.getItem(DRAFT_KEY);
  if(draft)idea.value=draft.slice(0,500);
  selectDimension(localStorage.getItem(MODE_KEY)||"auto");
 }catch{selectDimension("auto");}
 build.addEventListener("click",createGame);
 playTab.addEventListener("click",()=>showTab("play"));
 codeTab.addEventListener("click",()=>showTab("code"));
 $("ai-run-code").addEventListener("click",runEdited);
 $("ai-download").addEventListener("click",saveGame);
 $("ai-restart").addEventListener("click",()=>{
  if(ready&&frame.src)frame.src=frame.src;
 });
 $("ai-classic-toggle").addEventListener("click",()=>{
  $("ai-workspace").hidden=true;$("classic-workspace").hidden=false;
  $("ai-hero-label").textContent="Классические мини-игры";window.scrollTo({top:0,behavior:"smooth"});
 });
 $("ai-return").addEventListener("click",()=>{
  $("ai-workspace").hidden=false;$("classic-workspace").hidden=true;
  $("ai-hero-label").textContent="Опишите игру — получите готовый код";window.scrollTo({top:0,behavior:"smooth"});
 });
 // When switching away, keep iframe sandboxed. Reopening creates a fresh
 // game document and resets gameplay, matching the Replay button behavior.
 showTab("play");
})();
