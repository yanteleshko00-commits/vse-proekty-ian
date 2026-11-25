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
 let raw="",compiled="",busy=false,ready=false,sourceKind="",previewUrl="",playing=false,testing=false,restoreOverflow="",restoreBodyOverflow="",playerAnchor=null;
 const player=$("ai-game-view"),launch=$("ai-open-game"),close=$("ai-close-game");
 const LIBRARY_KEY="nexora-my-games-v1",library=$("my-games-list"),libraryStatus=$("my-games-status");
 let selectedId=null,currentReview=null,gameDimension="auto";
 function readLibrary(){try{const items=JSON.parse(localStorage.getItem(LIBRARY_KEY)||"[]");return Array.isArray(items)?items.filter(x=>x&&typeof x.id==="string"&&typeof x.html==="string"&&x.html.length<=52000&&typeof x.title==="string").slice(0,25):[];}catch{return [];}}
 function storeLibrary(items){try{localStorage.setItem(LIBRARY_KEY,JSON.stringify(items.slice(0,25)));return true;}catch{libraryStatus.textContent="Не удалось сохранить игру: хранилище заполнено или недоступно.";return false;}}
 function renderLibrary(){library.replaceChildren();const items=readLibrary();if(!items.length){libraryStatus.textContent="Пока нет сохранённых игр. Создайте первую игру.";return;}libraryStatus.textContent=items.length+" · сохранено в этом браузере";for(const item of items){const card=document.createElement("article"),open=document.createElement("button"),title=document.createElement("strong"),meta=document.createElement("small"),del=document.createElement("button");card.className="nx-library-card";open.type="button";open.className="nx-library-open";title.textContent=item.title;meta.textContent=(item.dimension==="3d"?"3D":"Игра")+" · "+(item.review?.status==="passed"?"ИИ-проверка пройдена":"Черновик");open.append(title,meta);open.addEventListener("click",()=>void loadSaved(item));del.type="button";del.className="nx-library-delete";del.textContent="×";del.setAttribute("aria-label","Удалить "+item.title);del.addEventListener("click",()=>{if(storeLibrary(readLibrary().filter(x=>x.id!==item.id)))renderLibrary();});card.append(open,del);library.append(card);}}
 function persistGame(){if(!ready||!raw||!currentReview)return;const id=selectedId||globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);const item={id,title:$("ai-game-title").textContent.slice(0,75),idea:idea.value.trim().slice(0,500),html:raw,dimension:gameDimension,review:currentReview,createdAt:Date.now()};if(storeLibrary([item,...readLibrary().filter(x=>x.id!==id)])){selectedId=id;renderLibrary();}}
 function reportReview(){const passed=currentReview?.status==="passed";$("ai-source-label").textContent=passed?"ИИ проверил код":"Личный черновик";launch.querySelector("strong").textContent=passed?"Открыть игру":"Открыть черновик";$("ai-review-report").textContent=passed?(currentReview.repaired?"ИИ исправил замечания, повторная проверка и пробный запуск пройдены.":"ИИ-проверка и пробный запуск пройдены."):"Пробный запуск пройден, но ИИ не подтвердил качество. Это личный черновик, возможны баги. "+(currentReview?.issues||[]).slice(0,3).join(" · ");}
 async function loadSaved(item){if(busy)return;clearError();setBusy(true);try{if(playing)closeGame();ready=false;launch.hidden=true;selectedId=item.id;currentReview=item.review||{status:"needs_review",issues:[]};gameDimension=item.dimension;idea.value=item.idea||item.title;selectDimension(["auto","2d","3d"].includes(item.dimension)?item.dimension:"auto");raw=item.html;code.value=raw;$("ai-game-title").textContent=item.title;$("ai-description").textContent="Сохранённая игра";setStatus("Проверяю запуск сохранённой игры…");await compileGame(raw);showReady();reportReview();setStatus("Игра открыта из библиотеки.");setBusy(false);openGame();}catch(e){fail(e.message);setStatus("Не удалось открыть сохранённую игру.");}finally{setBusy(false);}}
 renderLibrary();
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
 let lastSource='',lastAttempt=null;
 function resetLive(){
  lastSource='';lastAttempt=null;
  $("nx-live-provider").textContent="Подключение к ИИ";
  $("nx-live-count").textContent="0 символов";
  $("nx-live-source").textContent="Ожидаю первые строки кода…";
  $("nx-live-phase").textContent="Ожидание ответа модели";
 }
 function showLive(progress){
  if(!progress||typeof progress!=="object")return;
  const source=typeof progress.source==="string"?progress.source:"";
  const pre=$("nx-live-source");
  if(progress.attempt!==lastAttempt){lastAttempt=progress.attempt;lastSource="";}
  $("nx-live-provider").textContent=String(progress.provider||"NEXORA AI").slice(0,80);
  $("nx-live-count").textContent=source.length.toLocaleString("ru-RU")+" символов";
  $("nx-live-phase").textContent=progress.phase==="reviewing"?"ИИ проверяет код и игровые механики":progress.phase==="repairing"?"ИИ исправляет обнаруженные ошибки":progress.phase==="writing"?"Получаю реальный HTML / CSS / JS":"Ожидаю ответ модели";
  if(source!==lastSource||!source){pre.textContent=source||"Ожидаю первые строки кода…";pre.scrollTop=pre.scrollHeight;lastSource=source;}
 }
 function revealGame(){
  const wrapper=frame.closest(".ai-game-frame");
  if(!wrapper)return;
  wrapper.classList.remove("nx-real-reveal");
  void wrapper.offsetWidth;wrapper.classList.add("nx-real-reveal");
 }
 function saveDraft(value){
  try{localStorage.setItem(DRAFT_KEY,value.slice(0,500));}catch{}
 }
 function setBusy(value){
  busy=value;build.disabled=value;$("ai-run-code").disabled=value;
  build.textContent=value?"✦ Создаю и проверяю игру…":"✦ Создать игру";
 }
 function showTab(which){
  const isCode=which==="code";
  if(isCode&&playing)closeGame();
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
  launch.hidden=false;showTab("play");
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
  testing=true;ready=false;previewUrl=data.url;
  // Give the test document a real viewport even while the result is hidden.
  // It is off-screen, sandboxed, and destroyed before the public play button.
  const probe=document.createElement("iframe");
  probe.setAttribute("sandbox","allow-scripts");probe.setAttribute("aria-hidden","true");probe.setAttribute("referrerpolicy","no-referrer");probe.tabIndex=-1;
  probe.className="nx-game-probe";probe.style.width=Math.min(window.innerWidth,960)+"px";probe.style.height=Math.max(320,Math.min(window.innerHeight,600))+"px";
  document.body.append(probe);
  try{
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>finish(Error("Игра не завершила пробный запуск.")),12000);
    function finish(err){clearTimeout(timer);window.removeEventListener("message",check);err?reject(err):resolve();}
    function check(event){if(event.source!==probe.contentWindow||!event.data)return;
     if(event.data.type==="nexora-game-error")finish(Error("Ошибка пробного запуска: "+String(event.data.message||"JavaScript").slice(0,170)));
     if(event.data.type==="nexora-game-ready")finish();
    }
    window.addEventListener("message",check);
    probe.src=data.url+"#nx-check";
   });
   compiled=data.html||"";
  }finally{testing=false;probe.remove();}
 }
 function openGame(){
  if(!ready||!previewUrl||playing||busy)return;
  showTab("play");player.classList.remove("ai-enter");playing=true;restoreOverflow=document.documentElement.style.overflow;restoreBodyOverflow=document.body.style.overflow;
  playerAnchor=document.createComment("NEXORA game player");player.before(playerAnchor);document.body.append(player);
  document.documentElement.style.overflow="hidden";document.body.style.overflow="hidden";player.classList.add("nx-game-playing");
  launch.hidden=true;close.hidden=false;frame.addEventListener("load",revealGame,{once:true});frame.src=previewUrl;
  close.focus({preventScroll:true});
 }
 function closeGame(){
  if(!playing)return;
  playing=false;frame.src="about:blank";player.classList.remove("nx-game-playing");
  if(playerAnchor?.isConnected){playerAnchor.replaceWith(player);playerAnchor=null;}
  document.documentElement.style.overflow=restoreOverflow;document.body.style.overflow=restoreBodyOverflow;close.hidden=true;launch.hidden=false;launch.focus({preventScroll:true});
 }
 launch.addEventListener("click",openGame);close.addEventListener("click",closeGame);
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&playing){e.preventDefault();closeGame();}});
 async function createGame(){
  if(busy)return;
  clearError();
  const description=idea.value.trim();
  saveDraft(description);
  if(description.length<2){fail("Напишите название или короткое описание игры.");idea.focus();return;}
  if(description.length>500){fail("Описание не должно превышать 500 символов.");return;}
  setBusy(true);setStatus("ИИ создаёт "+(dimension==="3d"?"трёхмерный":"игровой")+" мир, код и управление…");
  if(playing)closeGame();selectedId=null;currentReview=null;ready=false;compiled="";previewUrl="";launch.hidden=true;resetLive();setLoader(true);
  $("ai-placeholder").hidden=false;
  $("ai-result").hidden=true;$("ai-toolbar").hidden=true;
  $("ai-placeholder-title").textContent="Создаю вашу игру…";
  $("ai-placeholder-description").textContent="Показываем полученные от модели строки. Игра запустится только после проверки полного кода.";
  if(window.matchMedia("(max-width:900px)").matches)$("ai-result-card").scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion:reduce)").matches?"auto":"smooth",block:"start"});
  try{
   const startJob=()=>fetch("/api/game/code",{
    method:"POST",headers:{"Content-Type":"application/json","X-NEXORA-Async":"1"},
    body:JSON.stringify({idea:description,dimension}),signal:AbortSignal.timeout(20000)
   });
   let response=await startJob();
   let data=await response.json().catch(()=>({}));
   showLive(data.progress);
   let jobId=data.jobId,deadline=Date.now()+480000,missing=0,restarted=false;
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
     jobId=data.jobId;deadline=Date.now()+480000;
     continue;
    }
    missing=0;
    showLive(data.progress);
   }
   if(!response.ok||!data.ok||typeof data.html!=="string")
    throw Error(data.message||"ИИ не смог написать игру. Попробуйте уточнить описание.");
   if(data.source!=="ai")throw Error("ИИ не создал код. Подмена вашего запроса готовым шаблоном отключена.");
   if(!["passed","needs_review"].includes(data.review?.status))throw Error("Проверка игры не завершена.");
   currentReview=data.review;gameDimension=data.dimension||dimension;
   raw=data.html;code.value=raw;sourceKind=data.source;
   showLive({provider:data.provider,phase:"writing",source:raw,attempt:"final"});
   $("nx-live-phase").textContent="Код получен · проверка и запуск";
   const renderedDimension=data.dimension==="3d"?"3d":dimension;
   $("ai-placeholder-title").textContent="Код создан — собираю игру…";
   $("ai-placeholder-description").textContent="Проверяю HTML и подготавливаю безопасное игровое окно.";
   setStatus("Код готов. Подготавливаю "+(dimension==="3d"?"3D WebGL":"игру")+" для запуска…");
   $("ai-game-title").textContent=data.title||description;
   $("ai-source-label").textContent=data.review.status==="passed"?"ИИ проверил код":"Личный черновик";
   $("ai-source-label").classList.add("generated");
   $("ai-description").textContent="ИИ создал "+(renderedDimension==="3d"?"3D WebGL-игру":"игру")+" по вашему описанию. Исходный код доступен во вкладке «Код».";
   $("ai-control-hint").textContent=renderedDimension==="3d"
    ?"В 3D: свайпайте по сцене для поворота камеры, экранные стрелки — движение, «Действие» — взаимодействие. На компьютере — WASD и мышь."
    :"На телефоне проводите пальцем по игровому полю или держите стрелки. Нажмите «Действие» для прыжка/выстрела.";
   setStatus("Выполняю пробный запуск и проверяю управление…");
   $("nx-live-phase").textContent="Пробный запуск в песочнице";
   await compileGame(raw);showReady();
   reportReview();persistGame();
   setStatus(currentReview.status==="passed"?"Игра готова к запуску.":"Черновик сохранён. Можно проверить его лично.");
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
   if(playing)closeGame();compiled="";previewUrl="";ready=false;
   await compileGame(next);
   raw=next;sourceKind="edited";
   $("ai-source-label").textContent="Код изменён";$("ai-source-label").classList.remove("generated");
   $("ai-description").textContent="Игра перезапущена из отредактированного HTML-кода.";
   currentReview={status:"needs_review",issues:["Ручной код: ИИ-аудит не выполнялся."]};selectedId=null;showReady();reportReview();persistGame();setStatus("Изменения готовы к запуску.");
  }catch(e){fail(e.message||"Код не удалось запустить.");showTab("code");}
  finally{setBusy(false);}
 }
 function saveGame(){
  if(!ready||!compiled){fail("Сначала завершите пробный запуск игры.");return;}
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
  if(testing||!playing||event.source!==frame.contentWindow||!event.data||event.data.type!=="nexora-game-error")return;
  const message=String(event.data.message||"Ошибка игрового кода").slice(0,170);
  setStatus("Ошибка выполнения игры: "+message);
  closeGame();ready=false;compiled="";previewUrl="";launch.hidden=true;
  $("ai-review-report").textContent="Во время игры обнаружилась ошибка. Запуск остановлен.";
  fail("Обнаружена ошибка выполнения. Откройте вкладку «Код» или создайте заново: "+message);
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
 playTab.addEventListener("click",()=>{showTab("play");openGame();});
 codeTab.addEventListener("click",()=>showTab("code"));
 $("ai-run-code").addEventListener("click",runEdited);
 $("ai-download").addEventListener("click",saveGame);
 $("ai-restart").addEventListener("click",()=>{
  if(ready&&playing&&previewUrl)frame.src=previewUrl;else openGame();
 });
 $("ai-classic-toggle").addEventListener("click",()=>{
  if(playing)closeGame();$("ai-workspace").hidden=true;$("classic-workspace").hidden=false;
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
