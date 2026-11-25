(function(){
 "use strict";
 const get=id=>document.getElementById(id);
 const questions=[
  {key:"className",question:"В каком ты классе?",options:[["7","7 класс"],["8","8 класс"],["9","9 класс"],["10","10 класс"],["11","11 класс"],["custom","Другой класс"]],placeholder:"Например: 9А"},
  {key:"name",question:"Как тебя зовут?",options:[],placeholder:"Фамилия Имя Отчество"},
  {key:"school",question:"В какой школе ты учишься?",options:[],placeholder:"Название школы (необязательно)"},
  {key:"slides",question:"Сколько слайдов сделать?",options:[["7","7 слайдов"],["10","10 слайдов"],["12","12 слайдов"],["15","15 слайдов"],["20","20 слайдов"],["custom","Своё количество"]],placeholder:"От 7 до 100"},
  {key:"productType",question:"Какой итоговый продукт нужен?",options:[["","Подобрать автоматически"],["Памятка","Памятка"],["Буклет","Буклет"],["Чек-лист","Чек-лист"],["Мини-гайд","Мини-гайд"],["Карточки","Карточки"],["Инструкция","Инструкция"]]},
  {key:"requirements",question:"Какие дополнительные требования?",options:[],placeholder:"Например: теория, примеры, практическая часть..."}
 ];
 let step=0;
 let answers={};
 const hidden=["firstName","lastName","className","school","slides","productType","requirements"];
 for(const name of hidden){const el=get(name);if(el&&el.closest(".field"))el.closest(".field").style.display="none";}
 function fieldValue(){
  if(questions[step].key==="className"&&answers.className!=="custom"&&answers.className)return answers.className;
  if(questions[step].key==="slides"&&answers.slides!=="custom"&&answers.slides)return answers.slides;
  return get("nxqp-field").value.trim();
 }
 function saveField(){
  const key=questions[step].key;
  const inp=get("nxqp-field");
  if(!get("nxqp-extra").hidden){
   if(key==="className"&&answers.className==="custom")answers.customClass=inp.value.slice(0,45).trim();
   else if(key==="slides"&&answers.slides==="custom")answers.customSlides=inp.value.trim();
   else answers[key]=inp.value.slice(0,1200).trim();
  }
 }
 function show(){
  const q=questions[step];
  get("nxqp-question").textContent=q.question;
  get("nxqp-number").textContent="Шаг "+(step+1)+" из "+questions.length;
  get("nxqp-track").setAttribute("aria-valuenow",String(step+1));
  get("nxqp-fill").style.width=((step+1)*100/questions.length)+"%";
  const list=get("nxqp-options");list.replaceChildren();
  get("nxqp-error").hidden=true;
  for(const [value,label] of q.options){
   const b=document.createElement("button");b.type="button";b.className="nxqp-option";b.textContent=label;
   b.setAttribute("aria-pressed",String(answers[q.key]===value));
   b.addEventListener("click",()=>{saveField();answers[q.key]=value;show()});
   list.appendChild(b);
  }
  const needsInput=q.options.length===0||(q.key==="className"&&answers.className==="custom")||(q.key==="slides"&&answers.slides==="custom");
  get("nxqp-extra").hidden=!needsInput;
  const field=get("nxqp-field");
  if(needsInput){
   field.type=q.key==="slides"?"number":q.key==="requirements"?"text":"text";
   field.placeholder=q.placeholder||"Введите ответ";
   field.value=q.key==="className"?(answers.customClass||""):q.key==="slides"?(answers.customSlides||""):(answers[q.key]||"");
   if(q.key==="requirements"){field.replaceWith(document.createElement("textarea"));const ta=get("nxqp-extra").querySelector("textarea");ta.id="nxqp-field";ta.className="nxqp-input";ta.placeholder=q.placeholder;ta.maxLength=1200;ta.value=answers.requirements||"";}
  }
  get("nxqp-next").textContent=step===questions.length-1?"✦ Создать проект":"Далее →";
 }
 function restoreInput(){
  const field=get("nxqp-field");
  if(field?.tagName==="TEXTAREA"&&questions[step].key!=="requirements"){
   const input=document.createElement("input");input.id="nxqp-field";input.className="nxqp-input";input.type="text";field.replaceWith(input);
  }
 }
 function goNext(skip){
  saveField();
  const q=questions[step],key=q.key;
  if(skip){answers[key]=key==="slides"?"12":key==="productType"?"":"";if(key==="className")answers.customClass="";if(key==="slides")answers.customSlides="";}
  if(key==="slides"){
   const val=Number(answers.slides==="custom"?answers.customSlides:answers.slides);
   if(!skip&&(!Number.isInteger(val)||val<7||val>100)){get("nxqp-error").textContent="Выберите число слайдов от 7 до 100.";get("nxqp-error").hidden=false;return;}
  }
  if(key==="className"&&!skip&&answers.className==="custom"&&!answers.customClass){get("nxqp-error").textContent="Укажите класс.";get("nxqp-error").hidden=false;return;}
  if(step<questions.length-1){step++;restoreInput();show();return;}
  get("nxq-project").hidden=true;
  const fullName=String(answers.name||"").trim().split(/\s+/);
  get("lastName").value=fullName.length>1?fullName.shift():"";
  get("firstName").value=fullName.join(" ")||String(answers.name||"").trim();
  get("className").value=answers.className==="custom"?(answers.customClass||""):answers.className||"";
  get("school").value=String(answers.school||"");
  get("slides").value=answers.slides==="custom"?(answers.customSlides||"12"):answers.slides||"12";
  get("productType").value=answers.productType||"";
  get("requirements").value=String(answers.requirements||"");
  void createProject();
 }
 window.startProjectQuiz=function(){
  const topic=String(get("topic").value||"").trim();
  if(!topic){alert("Сначала введите тему проекта.");get("topic").focus();return;}
  if(get("createButton").disabled)return;
  answers={className:get("className").value||"9",name:[get("lastName").value,get("firstName").value].filter(Boolean).join(" "),school:get("school").value||"",slides:get("slides").value||"12",productType:get("productType").value||"",requirements:get("requirements").value||""};
  step=0;restoreInput();
  get("nxqp-preview").textContent=topic.slice(0,180);
  get("nxq-project").hidden=false;show();get("nxqp-back").focus();
 };
 get("nxqp-next").addEventListener("click",()=>goNext(false));
 get("nxqp-skip").addEventListener("click",()=>goNext(true));
 get("nxqp-back").addEventListener("click",()=>{saveField();if(step===0){get("nxq-project").hidden=true;return}step--;restoreInput();show()});
})();
