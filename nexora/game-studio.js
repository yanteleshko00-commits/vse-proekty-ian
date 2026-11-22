// Game Studio: model writes a bounded game concept, while the playable engine
// uses audited built-in mechanics. Never execute model-generated JavaScript.
export const GAME_TYPES = Object.freeze(['auto','catch','snake','target']);
const COLORS = Object.freeze(['violet','blue','mint','sunset']);
const levels = ['easy','normal','hard'];
const recent = new Map();

function clean(value,max=100){return String(value||'').replace(/[<>\u0000-\u001f]/g,' ').trim().slice(0,max)}
export function gameType(prompt,requested='auto'){
  if(GAME_TYPES.includes(requested)&&requested!=='auto')return requested;
  const p=String(prompt||'').toLowerCase();
  if(/змейк|snake|лабиринт|полз|червяк/.test(p))return 'snake';
  if(/реакци|мишен|стрел|попад|мишень|target|тап|нажим/.test(p))return 'target';
  return 'catch';
}
export function basicGamePlan({idea='',type='auto',level='normal',color='violet'}={}){
  const game=gameType(idea,type),tone=COLORS.includes(color)?color:'violet',difficulty=levels.includes(level)?level:'normal';
  const config={
    catch:['Лови звёзды','Перемещайтесь влево и вправо, собирайте звёзды и избегайте красных препятствий.'],
    snake:['Змейка','Собирайте фрукты, растите и не сталкивайтесь со стенами и хвостом.'],
    target:['Меткость','Нажимайте на появляющиеся цели до окончания времени.']
  };
  const [title,instructions]=config[game];
  return {type:game,title,instructions,difficulty,color:tone,idea:clean(idea,500),aiUsed:false,provider:'Игровой движок NEXORA'};
}
function parseModelPlan(message,fallback){
  const raw=typeof message==='string'?message:Array.isArray(message)?message.filter(x=>x?.type==='text').map(x=>x.text||'').join(''):'';
  const objectText=raw.match(/\{[\s\S]*\}/)?.[0];
  if(!objectText||objectText.length>3000)return null;
  try{
    const obj=JSON.parse(objectText);
    if(!obj||typeof obj!=='object')return null;
    const type=fallback.type; // preserve the specific chosen game mechanic
    const title=clean(obj.title,58),instructions=clean(obj.instructions,210);
    if(title.length<3||instructions.length<12)return null;
    return {...fallback,type,title,instructions,aiUsed:true};
  }catch{return null}
}
function providers(){
  const out=[],or=process.env.OPENROUTER_API_KEY?.trim(),groq=process.env.GROQ_API_KEY?.trim();
  if(or){
    const model=process.env.GAME_OPENROUTER_MODEL||process.env.ARGOSHA_OPENROUTER_MODEL||'openrouter/free';
    out.push({name:'OpenRouter',model,key:or,url:'https://openrouter.ai/api/v1/chat/completions'});
    const backup=process.env.GAME_OPENROUTER_FALLBACK_MODEL||'google/gemma-4-26b-a4b-it:free';
    if(backup!==model)out.push({name:'OpenRouter (резерв)',model:backup,key:or,url:'https://openrouter.ai/api/v1/chat/completions'});
  }
  if(groq)out.push({name:'Groq',model:process.env.GAME_GROQ_MODEL||'openai/gpt-oss-20b',key:groq,url:'https://api.groq.com/openai/v1/chat/completions'});
  return out;
}
async function generateConcept(plan){
  const msg='Кратко придумай название и правила браузерной мини-игры. Русский язык. Только JSON вида {"title":"...","instructions":"..."}. Тип механики УЖЕ выбран и не меняется: '+plan.type+'. Сложность: '+plan.difficulty+'. Идея пользователя: '+plan.idea+'. Название максимум 58 символов, правила максимум 200. Не обещай игровые функции, которых нет в шаблоне. Для snake — змейка и сбор еды; для catch — сбор падающих звёзд; для target — клики по движущимся мишеням. Без Markdown.';
  for(const model of providers()){
    try{
      const r=await fetch(model.url,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+model.key,'HTTP-Referer':process.env.APP_URL||'https://nexora-lobby.onrender.com','X-Title':'NEXORA Game Studio'},
        body:JSON.stringify({model:model.model,max_tokens:260,temperature:.65,
          ...(model.name.startsWith('OpenRouter')?{reasoning:{effort:'minimal'}}:{}),
          messages:[{role:'system',content:'Ты пишешь краткую концепцию для готового игрового движка. Только JSON.'},{role:'user',content:msg}]
        }),
        signal:AbortSignal.timeout(16000)
      });
      const data=await r.json().catch(()=>({}));
      if(!r.ok){console.warn('Game concept provider:',model.name,r.status);continue}
      const result=parseModelPlan(data.choices?.[0]?.message?.content,plan);
      if(result)return {...result,provider:model.name};
    }catch(e){console.warn('Game concept unavailable:',model.name,e.message)}
  }
  return plan;
}
function send(res,status,data){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
}
async function getJson(req){
  if(!String(req.headers['content-type']||'').includes('application/json'))throw Error('Ожидался JSON.');
  const parts=[];let total=0;
  for await(const chunk of req){total+=chunk.length;if(total>5500)throw Error('Слишком длинное описание.');parts.push(chunk)}
  return JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');
}
export async function makeGame(req,res){
  let input;
  try{input=await getJson(req)}
  catch(e){return send(res,400,{ok:false,message:e.message||'Неверный запрос.'})}
  const idea=typeof input.idea==='string'?input.idea.trim():'';
  if(idea.length<5||idea.length>500)return send(res,400,{ok:false,message:'Опишите идею игры (от 5 до 500 символов).'});
  if(input.type&&!GAME_TYPES.includes(input.type))return send(res,400,{ok:false,message:'Неизвестный тип игры.'});
  const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'anonymous').split(',')[0].slice(0,80),now=Date.now();
  const times=(recent.get(ip)||[]).filter(t=>now-t<60000);
  if(times.length>=5)return send(res,429,{ok:false,message:'До пяти игр в минуту. Повторите немного позже.'});
  times.push(now);recent.set(ip,times);
  if(recent.size>2000)for(const [k,v] of recent)if(v.every(t=>now-t>60000))recent.delete(k);
  const config=basicGamePlan({...input,idea});
  const plan=await generateConcept(config);
  return send(res,200,{ok:true,game:plan});
}
