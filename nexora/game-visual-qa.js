export const GAME_VISUAL_QA = String.raw`// Only installed inside the isolated test document. Sample the actual canvas
// framebuffer after rendering, before a WebGL drawing buffer is discarded.
const qaMode=location.hash.startsWith('#nx-check');
const qa3d=location.hash==='#nx-check-3d';
const qaContexts=new Map(),qaSamples=new Map();
let qaStarted=0,qaFrameCount=0,qaLast=0,qaGraphicsErrors=[];
const qaNativeContext=HTMLCanvasElement.prototype.getContext;
const qaNativeRAF=window.requestAnimationFrame.bind(window);
function qaMeasure(canvas,ctx,type){
 if(!canvas.isConnected||!canvas.width||!canvas.height)return null;
 const r=canvas.getBoundingClientRect();if(r.width<60||r.height<60)return null;
 if(getComputedStyle(canvas).visibility==='hidden'||getComputedStyle(canvas).display==='none')return null;
 let data;
 try{
  if(type==='2d'){
   const tiny=document.createElement('canvas');tiny.width=32;tiny.height=24;
   const c=qaNativeContext.call(tiny,'2d',{willReadFrequently:true});
   c.drawImage(canvas,0,0,32,24);data=c.getImageData(0,0,32,24).data;
  }else{
   const w=ctx.drawingBufferWidth,h=ctx.drawingBufferHeight;
   if(!w||!h||w*h>8000000||ctx.isContextLost())return null;
   // Reading a non-default framebuffer gives misleading pixels. Do not
   // change the game's GL state just to measure an off-screen render target.
   if(ctx.getParameter(ctx.FRAMEBUFFER_BINDING)!==null)return null;
   const rgba=new Uint8Array(w*h*4);ctx.readPixels(0,0,w,h,ctx.RGBA,ctx.UNSIGNED_BYTE,rgba);
   data=new Uint8Array(32*24*4);
   for(let y=0;y<24;y++)for(let x=0;x<32;x++){
    const from=(Math.min(h-1,Math.floor((y+.5)*h/24))*w+Math.min(w-1,Math.floor((x+.5)*w/32)))*4;
    data.set(rgba.subarray(from,from+4),(y*32+x)*4);
   }
  }
  const hist=new Map();let hash=2166136261;
  for(let i=0;i<data.length;i+=4){
   const a=data[i+3],v=a<16?0:1+((data[i]>>4)<<8)+((data[i+1]>>4)<<4)+(data[i+2]>>4);
   hist.set(v,(hist.get(v)||0)+1);hash=Math.imul(hash^v,16777619);
  }
  return {colors:hist.size,dominant:Math.max(...hist.values())/(data.length/4),hash:hash>>>0};
 }catch{return null;}
}
function qaSample(){
 const now=performance.now();
 if(!qaStarted||now-qaLast<350)return;qaLast=now;
 for(const [canvas,entry] of qaContexts){
  const m=qaMeasure(canvas,entry.ctx,entry.type);if(!m)continue;
  const samples=qaSamples.get(canvas)||[];samples.push({...m,ms:Math.round(now-qaStarted)});
  if(samples.length>40)samples.shift();qaSamples.set(canvas,samples);
 }
}
if(qaMode){
 HTMLCanvasElement.prototype.getContext=function(type,...args){
  const ctx=qaNativeContext.call(this,type,...args);
  if(ctx&&/^(2d|webgl2?|experimental-webgl)$/.test(type)&&!qaContexts.has(this)){
   qaContexts.set(this,{ctx,type});
   if(type!=='2d'){
    for(const name of ['compileShader','linkProgram']){
     const orig=ctx[name];if(typeof orig!=='function')continue;
     try{ctx[name]=function(obj){const result=orig.call(this,obj);
      try{const ok=name==='compileShader'?this.getShaderParameter(obj,this.COMPILE_STATUS):this.getProgramParameter(obj,this.LINK_STATUS);if(!ok)qaGraphicsErrors.push(String(name==='compileShader'?this.getShaderInfoLog(obj):this.getProgramInfoLog(obj)).slice(0,180));}catch{}return result;};}catch{}
    }
   }
  }return ctx;
 };
 window.requestAnimationFrame=function(callback){return qaNativeRAF(function(t){try{callback(t);}finally{qaFrameCount++;qaSample();}});};
}
function qaVisibleStart(){
 return [...document.querySelectorAll('button,[role=button],input[type=button],input[type=submit]')].find(b=>{
  const text=String(b.innerText||b.value||b.getAttribute('aria-label')||'').trim();
  const r=b.getBoundingClientRect(),style=getComputedStyle(b);
  return !b.disabled&&r.width>0&&r.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&/^(?:▶\s*)?(?:играть|начать(?: игру)?|старт(?: игры)?|play(?: game)?|start(?: game)?)!?$/i.test(text);
 });
}
function qaVisualVerdict(){
 const results=[];
 for(const [canvas,samples] of qaSamples){
  const ctx=qaContexts.get(canvas);if(!ctx||!canvas.isConnected||samples.length<4)continue;
  const tail=samples.slice(-4),blank=s=>s.colors<=1||s.dominant>=.998;
  const strong=samples.some(s=>s.colors>=3&&s.dominant<.96);
  results.push({type:ctx.type,samples:samples.length,blank:tail.every(blank),lost:strong&&tail.every(s=>s.colors<=2||s.dominant>.99),changes:new Set(samples.map(s=>s.hash)).size,area:canvas.getBoundingClientRect().width*canvas.getBoundingClientRect().height});
 }
 const primary=results.sort((a,b)=>b.area-a.area)[0];
 const hasGL=[...qaContexts.values()].some(e=>e.type!=='2d'&&!e.ctx.isContextLost());
 if(qa3d&&!hasGL)return {error:'3D-игра не создала рабочий контекст WebGL'};
 if(qa3d&&qaGraphicsErrors.length&&!results.some(r=>r.type!=='2d'&&!r.blank&&!r.lost))return {error:'Ошибка компиляции WebGL: '+qaGraphicsErrors[0]};
 if(primary&&(primary.blank||primary.lost))return {error:'Игровая сцена исчезает или остаётся пустой после начала игры. Проверь рендер, камеру, матрицы, viewport и очистку кадров.'};
 if(qa3d&&!results.some(r=>r.type!=='2d'))return {error:'Не удалось подтвердить отрисовку WebGL после старта'};
 return {frames:qaFrameCount,canvasSamples:primary?.samples||0,visual:primary?'sampled':'not_measured',changes:primary?.changes||0};
}
`;
