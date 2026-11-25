let projectData=null;
let progressTimer=null;
let progressStarted=0;

let chatMode="general";
function openMathHelper(){
  chatMode="math";
  const title=document.querySelector("#chatTool h2");
  const description=document.querySelector("#chatTool .modal-content>p");
  const field=document.getElementById("chatQuestion");
  if(title)title.textContent="∑ Решить задачу по математике";
  if(description)description.textContent="Вставь условие задачи. Я оформлю решение по шагам: дано, найти, решение и ответ.";
  if(field)field.placeholder="Вставь сюда полное условие задачи...";
  const output=document.getElementById("chatAnswer");if(output){output.style.display="none";output.textContent="";}
  openModal("chatTool");
}
function openStudyHelper(){
  chatMode="study";
  const title=document.querySelector("#chatTool h2");
  const description=document.querySelector("#chatTool .modal-content>p");
  const field=document.getElementById("chatQuestion");
  if(title)title.textContent="📚 Помощь с уроками";
  if(description)description.textContent="Напиши тему или вопрос. Объясню простыми словами и помогу разобраться.";
  if(field)field.placeholder="Например: объясни теорему Пифагора...";
  const output=document.getElementById("chatAnswer");if(output){output.style.display="none";output.textContent="";}
  openModal("chatTool");
}
function go(id){document.getElementById(id)?.scrollIntoView({behavior:"smooth",block:"start"});}
function openModal(id){document.getElementById(id).style.display="flex";document.body.style.overflow="hidden";}
function closeModal(id){document.getElementById(id).style.display="none";if(![...document.querySelectorAll(".modal")].some(x=>x.style.display==="flex"))document.body.style.overflow="";}
document.querySelectorAll(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)closeModal(m.id)}));

function val(id){return String(document.getElementById(id)?.value||"").trim();}
function esc(s){return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}

function saveProjectState(){
  if(!projectData)return;
  try{
    const state={...projectData};
    // Файлы могут быть большими — сохраняем их отдельно в IndexedDB.
    const withoutFiles={...state};delete withoutFiles.files;
    sessionStorage.setItem("vseProektyProject",JSON.stringify(withoutFiles));
    if(state.files) saveFilesToIDB(state.files);
  }catch(e){console.warn("Не удалось сохранить проект",e);}
}

function restoreProjectState(){
  try{
    const raw=sessionStorage.getItem("vseProektyProject");
    if(!raw)return;
    projectData=JSON.parse(raw);
    restoreFilesFromIDB().then(files=>{
      if(files){projectData.files=files;showRestoredProject();}
    });
    showRestoredProject();
  }catch(e){console.warn("Не удалось восстановить проект",e);}
}

function openProjectDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open("vseProektyDB",1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains("files"))req.result.createObjectStore("files");};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function saveFilesToIDB(files){
  try{
    const db=await openProjectDB();
    const tx=db.transaction("files","readwrite");
    tx.objectStore("files").put(files,"latest");
    tx.oncomplete=()=>db.close();
  }catch(e){console.warn("IndexedDB unavailable",e);}
}

async function restoreFilesFromIDB(){
  try{
    const db=await openProjectDB();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction("files","readonly");
      const req=tx.objectStore("files").get("latest");
      req.onsuccess=()=>{db.close();resolve(req.result||null);};
      req.onerror=()=>{db.close();reject(req.error);};
    });
  }catch(e){return null;}
}

function showRestoredProject(){
  if(!projectData?.ai)return;
  const result=document.getElementById("projectResult");
  document.getElementById("progressBox").style.display="block";
  document.getElementById("progressBar").style.width="100%";
  setThinkingState("Готово",true);
  document.getElementById("status").textContent=Array.isArray(projectData.fileErrors)&&projectData.fileErrors.length
    ? "⚠️ Проект создан. Не удалось подготовить: "+projectData.fileErrors.map(x=>x.name).join(", ")
    : "✅ Проект готов!";
  document.getElementById("readyTopic").textContent="«"+projectData.topic+"»";
  document.getElementById("resultName").textContent=([projectData.firstName,projectData.lastName].filter(Boolean).join(" ")||"Не указано");
  document.getElementById("resultClass").textContent=projectData.className||"Не указан";
  document.getElementById("resultSchool").textContent=projectData.school||"Не указана";
  document.getElementById("resultSlides").textContent=projectData.slides+" слайдов";
  result.style.display="block";
}

function setThinkingState(label="Размышление",done=false){
  const motion=document.getElementById("nx-project-motion");if(motion)motion.hidden=done;
  const indicator=document.getElementById("thinkingIndicator");
  const text=document.getElementById("thinkingLabel");
  if(text)text.textContent=label;
  if(indicator)indicator.classList.toggle("done",done);
}
function setGenerationProgress(progress,message){
  const bar=document.getElementById("progressBar");
  const status=document.getElementById("status");
  const value=Math.max(3,Math.min(100,Number(progress)||3));
  if(bar)bar.style.width=value+"%";
  setThinkingState("Размышление",false);
  if(status&&message)status.textContent=message;
}
function animateProgress(){
  setGenerationProgress(3,"🔎 Проверяем тему и параметры проекта...");
}

function stopProgress(){
  if(progressTimer){cancelAnimationFrame(progressTimer);progressTimer=null;}
}

async function askChatGPT(){
  const rawQuestion=val("chatQuestion");const out=document.getElementById("chatAnswer");const btn=document.getElementById("chatSend");
  if(!rawQuestion){out.style.display="block";out.textContent="Сначала напиши вопрос.";return;}
  const question=chatMode==="math"
    ? "Ты — внимательный учитель математики. Реши задачу по данному условию. Обязательно оформи ответ на русском языке по структуре: «Дано», «Найти», «Решение» с понятными пошаговыми вычислениями и формулами, затем «Ответ». Не придумывай отсутствующие данные. Если условие неполное или неоднозначное, сначала укажи, чего не хватает. Условие задачи: "+rawQuestion
    : chatMode==="study" ? "Помоги школьнику разобраться в теме. Объясняй простым и точным языком, по шагам, с коротким примером. Вопрос: "+rawQuestion : rawQuestion;
  btn.disabled=true;btn.textContent="Думаю...";out.style.display="block";out.textContent="Готовлю ответ...";
  try{const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Не удалось получить ответ.");out.textContent=d.answer||"Ответ не получен.";}catch(e){out.textContent="Ошибка: "+e.message;}finally{btn.disabled=false;btn.textContent="Отправить вопрос";}
}
async function generatePicture(){
  const prompt=val("imagePrompt");const out=document.getElementById("imageAnswer");const btn=document.getElementById("imageSend");
  if(!prompt){out.style.display="block";out.textContent="Сначала опиши картинку.";return;}
  btn.disabled=true;btn.textContent="Создаю изображение...";out.style.display="block";out.textContent="Генерирую картинку. Это может занять до минуты...";
  try{const r=await fetch("/api/generate-image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Не удалось создать изображение.");out.textContent="Готово!";if(d.image){const img=document.createElement("img");img.alt="Созданное изображение";img.src="data:"+(d.mime||"image/png")+";base64,"+d.image;out.appendChild(img);const a=document.createElement("a");a.href=img.src;a.download=(d.mime==="image/svg+xml"?"Моя_картинка.svg":"Моя_картинка.png");a.textContent="Скачать изображение";a.style.display="inline-block";a.style.marginTop="12px";a.style.fontWeight="800";a.style.color="#123a80";out.appendChild(a);}}catch(e){out.textContent="Ошибка: "+e.message;}finally{btn.disabled=false;btn.textContent="Создать изображение";}
}

// Polling GET requests are safe to retry; never silently repeat a paid POST.
let activeProjectPoll=null;
async function pollProjectStatus(jobId){
  let lastError;
  for(let attempt=0;attempt<4;attempt++){
    try{
      const response=await fetch("/api/generation-jobs/"+encodeURIComponent(jobId),{cache:"no-store",signal:AbortSignal.timeout(20000)});
      const state=await response.json().catch(()=>null);
      if(response.ok&&state&&["running","completed","failed"].includes(state.status))return state;
      if([401,403,404].includes(response.status))throw Object.assign(new Error(state?.error||"Задача больше недоступна."),{terminal:true});
      throw new Error(state?.error||"Сервер временно недоступен. Повторяем проверку.");
    }catch(error){
      if(error.terminal)throw error;
      lastError=error;
      if(attempt<3)await new Promise(resolve=>setTimeout(resolve,2000*(attempt+1)));
    }
  }
  throw new Error(lastError?.message||"Связь с сервером потеряна. Обновите страницу для восстановления.");
}
async function suggestProjectTopics(){
  const button=document.getElementById("suggestTopicsButton");
  const topicInput=document.getElementById("topic");
  const status=document.getElementById("topicAIStatus");
  if(!button||!topicInput||!status)return;
  button.disabled=true;button.textContent="⏳ Генерирую…";
  status.textContent="Искусственный интеллект подбирает тему проекта…";
  const previousTopic=topicInput.value;topicInput.placeholder="Подбираю тему…";
  try{
    const response=await fetch("/api/suggest-topics",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({interests:previousTopic.trim().slice(0,300)}),signal:AbortSignal.timeout(45000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Не удалось сгенерировать тему.");
    const generated=String(data.topic||"").trim();
    if(!generated)throw new Error("ИИ не вернул тему проекта.");
    topicInput.placeholder="";
    topicInput.value=generated;topicInput.dispatchEvent(new Event("input",{bubbles:true}));
    status.textContent="✨ Тема готова. Её можно изменить вручную.";
    topicInput.focus();
  }catch(error){
    topicInput.placeholder="Например: Снижение расхода электроэнергии";
    topicInput.value=previousTopic;status.textContent="❌ "+(error.name==="TimeoutError"?"ИИ не успел ответить. Попробуй ещё раз.":(error.message||"Ошибка генерации темы."));
  }finally{button.disabled=false;button.textContent="✨ Сгенерировать с ИИ";}
}

async function createProject(){
stopProgress();
const topic=val("topic");
if(!topic){alert("Введите тему проекта.");document.getElementById("topic").focus();return;}

projectData={
 firstName:val("firstName"),lastName:val("lastName"),className:val("className"),
 school:val("school"),topic,slides:Math.max(7,Math.min(100,Math.floor(Number(val("slides"))||12))),
 productType:val("productType"),requirements:val("requirements"),ai:null,files:null,fileErrors:[]
};

const box=document.getElementById("progressBox"),bar=document.getElementById("progressBar"),status=document.getElementById("status"),result=document.getElementById("projectResult"),btn=document.getElementById("createButton");
box.style.display="block";result.style.display="none";btn.disabled=true;btn.textContent="⏳ Создаём проект...";
bar.style.width="3%";setThinkingState("Размышление",false);status.textContent="🔎 Анализируем тему и готовим проект...";
animateProgress();

try{
  const payload={
    firstName:projectData.firstName,lastName:projectData.lastName,className:projectData.className,
    school:projectData.school,topic:projectData.topic,slidesCount:projectData.slides,
    productType:projectData.productType,extraRequirements:projectData.requirements
  };
  const startResponse=await fetch("/api/generate-project/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const started=await startResponse.json().catch(()=>({}));
  if(!startResponse.ok||!started.jobId) throw new Error(started.error||"Не удалось запустить фоновую генерацию.");
  activeProjectPoll=started.jobId;
  try{localStorage.setItem("vseProektyActiveJob",JSON.stringify({jobId:started.jobId,project:{...projectData},startedAt:Date.now()}));}catch{}
  let data=null;
  while(true){
    await new Promise(resolve=>setTimeout(resolve,2200));
    const state=await pollProjectStatus(started.jobId);
    if(state.status==="completed"){data=state.result;break;}
    if(state.status==="failed"){localStorage.removeItem("vseProektyActiveJob");throw new Error(state.error||"Фоновая генерация завершилась ошибкой.");}
    setGenerationProgress(state.progress||3,state.message||"⚙️ Сервер продолжает собирать проект. Можно свернуть сайт — задача останется на сервере.");
  }
  localStorage.removeItem("vseProektyActiveJob");
  if(!data.project) throw new Error("ИИ не вернул проект.");

  projectData.ai=data.project;
  projectData.slides=data.project.slideCount||projectData.slides;
  projectData.files=data.files||[];
  projectData.fileErrors=Array.isArray(data.fileErrors)?data.fileErrors:[];
  saveProjectState();
  stopProgress();
  bar.style.transition="width .7s ease";bar.style.width="100%";setThinkingState("Готово",true);status.textContent=projectData.fileErrors.length
    ? "⚠️ Проект создан. Не удалось подготовить: "+projectData.fileErrors.map(x=>x.name).join(", ")
    : (data.notice ? "✅ "+data.notice : "✅ Проект готов!");
  document.getElementById("readyTopic").textContent="«"+projectData.topic+"»";
  document.getElementById("resultName").textContent=([projectData.firstName,projectData.lastName].filter(Boolean).join(" ")||"Не указано");
  document.getElementById("resultClass").textContent=projectData.className||"Не указан";
  document.getElementById("resultSchool").textContent=projectData.school||"Не указана";
  document.getElementById("resultSlides").textContent=projectData.slides+" слайдов";
  result.style.display="block";btn.disabled=false;btn.textContent="🔄 СОЗДАТЬ ЕЩЁ РАЗ";
  result.scrollIntoView({behavior:"smooth",block:"nearest"});
}catch(error){
  stopProgress();
  bar.style.width="0%";setThinkingState("Ошибка",true);status.textContent="❌ Не удалось создать проект";
  btn.disabled=false;btn.textContent="✨ СОЗДАТЬ ПРОЕКТ";
  alert(error.message||"Ошибка при создании проекта.");
}finally{activeProjectPoll=null;}
}

async function editProject() {
  const instruction = document.getElementById("editInstruction").value.trim();
  const status = document.getElementById("editStatus");
  const button = document.getElementById("editProjectButton");

  if (!instruction) {
    status.textContent = "Напиши, что нужно изменить.";
    return;
  }

  if (!projectData?.ai) {
    status.textContent = "Сначала создай проект.";
    return;
  }

  button.disabled = true;
  status.textContent = "⏳ Вношу изменения и пересоздаю файлы...";

  try {
    const response = await fetch("/api/edit-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: projectData.ai,
        instruction: instruction
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Не удалось изменить проект.");
    }
    if (!data.project) {
      throw new Error("Сервер не вернул обновлённый проект.");
    }
    if (!data.files) {
      throw new Error("Сервер не вернул обновлённые файлы.");
    }

    projectData.ai = data.project;
    projectData.slides = data.project.slideCount || projectData.slides;
    projectData.files = data.files;
    projectData.fileErrors = Array.isArray(data.fileErrors) ? data.fileErrors : [];

    await saveFilesToIDB(data.files);
    saveProjectState();

    document.getElementById("editInstruction").value = "";
    status.textContent = projectData.fileErrors.length
      ? "⚠️ Проект обновлён, но не подготовлены: " + projectData.fileErrors.map(x => x.name).join(", ")
      : "✅ Проект обновлён! Новые файлы готовы к скачиванию.";

    document.getElementById("readyTopic").textContent = "«" + projectData.topic + "»";
    document.getElementById("resultSlides").textContent =
      (data.project.presentation?.length || projectData.slides) + " слайдов";

  } catch (error) {
    status.textContent = "❌ " + (error.message || "Ошибка редактирования.");
  } finally {
    button.disabled = false;
  }
}


function base64ToBlob(base64,mime){
  const binary=atob(base64);const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:mime});
}
function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function resolveDownloadFile(files, requestedName){
  if(!files) return null;

  // Поддерживаем как новую структуру (массив {name, mime, base64}),
  // так и старую структуру объекта из предыдущих версий сайта.
  if(!Array.isArray(files) && files[requestedName]?.base64){
    return {name: requestedName, ...files[requestedName]};
  }

  const list = Array.isArray(files)
    ? files.filter(Boolean)
    : Object.entries(files).map(([key, file]) => file && typeof file === "object"
        ? ({...file, name: file.name || key})
        : null).filter(Boolean);

  const exact = list.find(file => (file.name || file.filename) === requestedName && file.base64);
  if(exact) return exact;

  const extension = requestedName.split(".").pop().toLowerCase();
  const byExtension = list.filter(file => String(file.name || file.filename || "").toLowerCase().endsWith("." + extension) && file.base64);
  if(!byExtension.length) return null;

  // Совместимость со старым сервером, который называл файлы по теме проекта.
  if(extension === "pdf" && requestedName === "Презентация_проекта.pdf"){
    const presentationPdf = byExtension.find(file => /презентац/i.test(file.name || file.filename || ""));
    return presentationPdf || null;
  }
  if(extension === "pdf" && requestedName === "Проект_текст.pdf"){
    const textPdf = byExtension.find(file => !/презентац/i.test(file.name || file.filename || ""));
    return textPdf || byExtension[0];
  }
  return byExtension[0];
}

async function downloadFile(name){
  try{
    // Восстанавливаем состояние синхронно из sessionStorage, если страница была
    // открыта кнопкой «Назад» или браузер восстановил её из памяти.
    if(!projectData){
      const saved = sessionStorage.getItem("vseProektyProject");
      if(saved) projectData = JSON.parse(saved);
    }

    if(!projectData?.ai){
      alert("Сначала создай проект, затем скачивай готовые файлы.");
      return;
    }

    if(!projectData.files){
      const files = await restoreFilesFromIDB();
      if(files) projectData.files = files;
    }

    const file = resolveDownloadFile(projectData.files, name);
    if(!file?.base64){
      const failed = (projectData.fileErrors || []).find(item => item.name === name);
      const reason = failed?.message ? "\nПричина: " + failed.message : "";
      alert("Файл «" + name + "» не был создан." + reason);
      return;
    }

    downloadBlob(base64ToBlob(file.base64, file.mime || "application/octet-stream"), name);
  }catch(error){
    console.error("Ошибка скачивания файла:", error);
    alert("Не удалось скачать файл. Попробуй создать проект ещё раз.");
  }
}
function downloadAll(){downloadFile("Весь_проект.zip");}

async function resumeBackgroundJob(){
  let saved;try{saved=JSON.parse(localStorage.getItem("vseProektyActiveJob")||"null");}catch{}
  if(!saved?.jobId||activeProjectPoll)return;
  activeProjectPoll=saved.jobId;
  const status=document.getElementById("status"),box=document.getElementById("progressBox"),bar=document.getElementById("progressBar");
  box.style.display="block";setGenerationProgress(3,"⚙️ Проверяем фоновую задачу...");
  try{while(true){
    const state=await pollProjectStatus(saved.jobId);
    setGenerationProgress(state.progress||3,state.message||"⚙️ Проект создаётся на сервере...");
    if(state.status==="completed"){const data=state.result;projectData={...saved.project,ai:data.project,files:data.files||[],fileErrors:data.fileErrors||[]};saveProjectState();localStorage.removeItem("vseProektyActiveJob");showRestoredProject();return;}
    if(state.status==="failed"){localStorage.removeItem("vseProektyActiveJob");throw new Error(state.error||"Не удалось создать проект.");}
    status.textContent="⚙️ Проект создаётся на сервере — можно пока пользоваться телефоном.";await new Promise(resolve=>setTimeout(resolve,2500));
  }}catch(e){if(e.terminal)try{localStorage.removeItem("vseProektyActiveJob");}catch{}status.textContent="⚠️ "+e.message;}finally{activeProjectPoll=null;}
}

window.addEventListener("pageshow",()=>{restoreProjectState();resumeBackgroundJob();});
window.addEventListener("popstate",()=>{restoreProjectState();});

document.addEventListener("DOMContentLoaded",()=>{
 document.querySelectorAll("input,textarea,select").forEach(el=>{
  el.disabled=false;el.readOnly=false;el.style.color="#17231d";el.style.webkitTextFillColor="#17231d";
 });
 restoreProjectState();
});
