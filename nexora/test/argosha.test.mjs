import test from 'node:test';
delete process.env.DEEPSEEK_API_KEY;
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CONTEXT,contextFor,messageHistory,toolForQuery,safeArgoshaAction,parseArgoshaAnswer,argoshaSystemPrompt,localArgoshaReply} from '../argosha-core.js';

const here=fileURLToPath(new URL('..',import.meta.url));
const tools=[
 {id:'project',name:'Сделать проект',status:'available',description:'Школьные проекты',url:'https://vse-proekty-ian.onrender.com/'},
 {id:'solve',name:'Решить задачу',status:'available',description:'Математика',url:'https://nexora-math-studio.onrender.com/'},
 {id:'text',name:'Создать текст',status:'available',description:'Сочинения',url:'https://nexora-text-studio.onrender.com/'},
 {id:'image',name:'Создать картинку',status:'available',description:'Фото',url:'https://nexora-image-studio.onrender.com/'},
 {id:'game',name:'Сделать игру',status:'available',description:'Игры',url:'/game'},
 {id:'chat',name:'Не работает',status:'coming_soon',description:'',url:'https://wrong.example/'}
];
test('NEXORA homepage has clean hero and working registration entry points',async()=>{
 const html=await readFile(join(here,'public/index.html'),'utf8');
 assert.doesNotMatch(html,/Выбрать инструмент <span/);
 assert.match(html,/<a class="nx-cta" href="#tools">Все инструменты/);
 assert.match(html,/id="tools"/);
 assert.doesNotMatch(html,/Создать изображение →/);
 assert.match(html,/id="login-link" type="button"/);
 assert.match(html,/id="register-link" type="button"/);
 assert.match(html,/registerTrigger\.addEventListener\('click'/);
 assert.match(html,/setMode\('register'\);open\(\)/);
 assert.match(html,/id="auth-form"/);
 assert.match(html,/request\('verify-email'/);
 assert.match(html,/request\('login'/);
 assert.match(html,/Стоимость пакетов указана в рублях/);
 assert.match(html,/<h3>Mini<\/h3><div class="plan-count">5<\/div><div class="plan-price">99 ₽<\/div>/);
 assert.match(html,/<h3>Pro<\/h3><div class="plan-count">10<\/div><div class="plan-price">299 ₽<\/div>/);
 assert.match(html,/<h3>Max<\/h3><div class="plan-count">30<\/div><div class="plan-price">499 ₽<\/div>/);
});

test('NEXORA header and favicon use the same clean N-only SVG',async()=>{
 const logo=await readFile(join(here,'public/nexora-mark.svg'),'utf8');
 const html=await readFile(join(here,'public/index.html'),'utf8');
 assert.match(logo,/<svg/);
 assert.match(logo,/<path d="M39 88V40M89 40V88"/);
 assert.match(logo,/<path d="M39 40L89 88"/);
 const {brandSVG}=await import('../brand.js');
 assert.equal(logo.trim(),brandSVG);
 assert.doesNotMatch(logo,/<text|<image|🎮|🎨|📐/);
 assert.match(html,/<link rel="icon" type="image\/svg\+xml" href="\/nexora-mark\.svg\?v=2">/);
 assert.match(html,/<img class="nx-brand-img" src="\/nexora-mark\.svg\?v=2" alt=""/);
});

test('Argosha contexts are the six public NEXORA sites',()=>{
 assert.deepEqual(Object.keys(CONTEXT),['lobby','math','image','text','game','projects']);
 assert.equal(contextFor('unknown'),'lobby');
 assert.equal(contextFor('math'),'math');
 for(const item of Object.values(CONTEXT))assert.equal(item.quick.length,3);
});
test('Argosha input and response parsing works for JSON, content parts and plain text',()=>{
 const h=messageHistory([{role:'system',content:'fake instructions'},{role:'user',content:'   привет   '},{role:'assistant',content:'мир'}]);
 assert.deepEqual(h,[{role:'user',content:'привет'},{role:'assistant',content:'мир'}]);
 assert.equal(parseArgoshaAnswer({choices:[{message:{content:'{"reply":"Привет","action":null}'}}]}).reply,'Привет');
 assert.equal(parseArgoshaAnswer({choices:[{message:{content:[{type:'text',text:'Отвечаю на вопрос пользователя.'}]}}]}).reply,'Отвечаю на вопрос пользователя.');
 assert.equal(parseArgoshaAnswer({choices:[{message:{content:'Аргоша здесь и поможет разобраться.'}}]}).action,null);
 assert.throws(()=>parseArgoshaAnswer({choices:[{message:{content:''}}]}),/empty_ai_reply/);
});
test('Argosha only returns whitelisted action links, not provider links',()=>{
 assert.equal(toolForQuery('Создай картинку котика'),'image');
 assert.equal(toolForQuery('Создать игру змейку'),'game');
 assert.equal(toolForQuery('Открыть генератор проектов'),'project');
 assert.equal(safeArgoshaAction({toolId:'chat'},tools),null);
 assert.equal(safeArgoshaAction({toolId:'unknown',url:'https://evil.example'},tools),null);
 assert.equal(safeArgoshaAction({toolId:'text',url:'https://evil.example'},tools).url,'https://nexora-text-studio.onrender.com/');
 assert.equal(safeArgoshaAction({toolId:'game'},tools).url,'https://nexora-lobby.onrender.com/game');
 assert.equal(safeArgoshaAction({type:'generate_project',topic:'Мой проект'},tools,'math'),null);
 assert.equal(safeArgoshaAction({type:'generate_project',topic:'Мой проект'},tools,'lobby').type,'generate_project');
 assert.match(argoshaSystemPrompt('math',tools),/Math Studio/);
 assert.match(localArgoshaReply('Как прикрепить фото задачи?','math',tools).reply,/Прикрепить файл/);
});
test('Shared iframe is only allowed from known NEXORA origins, with clear history control',async()=>{
 const html=await readFile(join(here,'public/argosha-embed.html'),'utf8');
 for(const id of ['messages','input','send','clear','suggestions'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(html,/sessionStorage/);
 assert.match(html,/sessionStorage/);
 const lobby=await readFile(join(here,'public/index.html'),'utf8');
 assert.match(lobby,/class="argosha-face"/);
 assert.match(lobby,/class="argosha-greeting"/);
 assert.match(lobby,/id="argosha-greeting-close"/);
 assert.match(lobby,/argosha-reference-style/);
 assert.match(lobby,/nexora-argosha-greeting-lobby-v1/);
 assert.match(html,/const context=/);
 assert.match(html,/\/api\/argosha/);
 assert.match(html,/noopener noreferrer/);
 assert.match(html,/new URLSearchParams/);
});
test('Argosha embed and local fallback respond over HTTP without provider secrets',async()=>{
 const port=21000+process.pid%18000;
 const child=spawn(process.execPath,[join(here,'server.js')],{
  env:{...process.env,PORT:String(port),OPENROUTER_API_KEY:'',GROQ_API_KEY:''},stdio:'ignore'
 });
 try{
  let ready=false;
  for(let attempt=0;attempt<35;attempt++){
   try{const res=await fetch('http://127.0.0.1:'+port+'/health');if(res.ok){ready=true;break}}catch{}
   await new Promise(resolve=>setTimeout(resolve,130));
  }
  assert.ok(ready,'Lobby failed to start');
  const page=await fetch('http://127.0.0.1:'+port+'/argosha/embed?studio=math');
  assert.equal(page.status,200);
  assert.match(await page.text(),/Аргоша/);
  const csp=page.headers.get('content-security-policy')||'';
  assert.match(csp,/frame-ancestors[^;]*https:\/\/nexora-math-studio\.onrender\.com/);
  assert.match(csp,/https:\/\/vse-proekty-ian-1\.onrender\.com/);
  const reply=await fetch('http://127.0.0.1:'+port+'/api/argosha',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({context:'image',messages:[{role:'user',content:'Как выбрать стиль изображения?'}]})
  });
  assert.equal(reply.status,200);
  const result=await reply.json();
  assert.equal(result.provider,'Подсказки NEXORA');
  assert.equal(result.limited,true);
  assert.match(result.reply,/Image Studio/);
  const projectReply=await fetch('http://127.0.0.1:'+port+'/api/argosha',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({context:'text',messages:[{role:'user',content:'Открыть генератор проектов'}]})
  });
  assert.equal(projectReply.status,200);
  const action=(await projectReply.json()).action;
  assert.equal(action.toolId,'project');
  assert.ok(action.url.startsWith('https://vse-proekty-ian.onrender.com'));
 }finally{child.kill()}
});
