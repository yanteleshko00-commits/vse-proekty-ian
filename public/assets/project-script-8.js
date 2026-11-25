(function(){
"use strict";
const settings=[["#projectResult","panel"]];
let activePanel=null,closePanel=null,savedOverflow="",savedHtmlOverflow="",gallery=null;
function lock(){savedOverflow=document.body.style.overflow;savedHtmlOverflow=document.documentElement.style.overflow;document.body.style.overflow="hidden";document.documentElement.style.overflow="hidden";}
function unlock(){document.body.style.overflow=savedOverflow;document.documentElement.style.overflow=savedHtmlOverflow;}
function button(label,cls,aria){const b=document.createElement("button");b.type="button";b.className=cls;b.textContent=label;if(aria)b.setAttribute("aria-label",aria);return b;}
function buildGallery(){
 const dialog=document.createElement("dialog");dialog.className="nx-gallery";dialog.setAttribute("aria-label","Просмотр изображения");
 const top=document.createElement("div");top.className="nx-gallery-top";
 const title=document.createElement("span");title.className="nx-gallery-title";title.textContent="Изображение";
 const close=button("×","","Закрыть изображение");top.append(title,close);
 const stage=document.createElement("div");stage.className="nx-gallery-stage";
 const photo=document.createElement("img");photo.className="nx-gallery-photo";photo.draggable=false;photo.alt="";stage.append(photo);
 const bottom=document.createElement("div");bottom.className="nx-gallery-bottom";
 const minus=button("−","","Уменьшить изображение"),reset=button("100%","nx-gallery-reset","Вернуть исходный размер"),plus=button("+","","Приблизить изображение");bottom.append(minus,reset,plus);dialog.append(top,stage,bottom);document.body.append(dialog);
 let scale=1,x=0,y=0,previous=null,lastTap=null,opener=null,hadMultiple=false,moved=false;
 const points=new Map();
 function clamp(v,min,max){return Math.min(max,Math.max(min,v));}
 function draw(){
  const maxX=Math.max(0,(photo.offsetWidth*scale-stage.clientWidth)/2),maxY=Math.max(0,(photo.offsetHeight*scale-stage.clientHeight)/2);
  x=clamp(x,-maxX,maxX);y=clamp(y,-maxY,maxY);
  photo.style.transform="translate("+x+"px,"+y+"px) scale("+scale+")";reset.textContent=Math.round(scale*100)+"%";minus.disabled=scale<=1;plus.disabled=scale>=5;
 }
 function zoom(value,cx=stage.clientWidth/2,cy=stage.clientHeight/2){const old=scale;scale=clamp(value,1,5);const ratio=scale/old;const px=cx-stage.clientWidth/2,py=cy-stage.clientHeight/2;x=px-(px-x)*ratio;y=py-(py-y)*ratio;draw();}
 function resetZoom(){scale=1;x=0;y=0;draw();}
 function metrics(){const p=[...points.values()];if(p.length>1)return {x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)};return p[0]?{x:p[0].x,y:p[0].y,d:0}:null;}
 function position(e){const r=stage.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 stage.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse"&&e.button!==0)return;if(!points.size){moved=false;hadMultiple=false;}points.set(e.pointerId,position(e));if(points.size>1)hadMultiple=true;previous=metrics();try{stage.setPointerCapture(e.pointerId);}catch{}});
 stage.addEventListener("pointermove",e=>{if(!points.has(e.pointerId))return;points.set(e.pointerId,position(e));const now=metrics();if(previous&&now){if(Math.hypot(now.x-previous.x,now.y-previous.y)>2)moved=true;if(now.d&&previous.d){zoom(scale*now.d/previous.d,previous.x,previous.y);x+=now.x-previous.x;y+=now.y-previous.y;draw();}else if(scale>1){x+=now.x-previous.x;y+=now.y-previous.y;draw();}}previous=now;});
 function end(e){if(!points.has(e.pointerId))return;const p=position(e);points.delete(e.pointerId);previous=metrics();if(e.type==="pointerup"&&!points.size&&!moved&&!hadMultiple){const now=Date.now();if(lastTap&&now-lastTap.t<320&&Math.hypot(p.x-lastTap.x,p.y-lastTap.y)<35){zoom(scale>1?1:2.5,p.x,p.y);lastTap=null;}else lastTap={...p,t:now};}}
 stage.addEventListener("pointerup",end);stage.addEventListener("pointercancel",end);stage.addEventListener("lostpointercapture",end);
 stage.addEventListener("wheel",e=>{e.preventDefault();const p=position(e);zoom(scale*Math.exp(-e.deltaY*.002),p.x,p.y);},{passive:false});
 plus.addEventListener("click",()=>zoom(scale*1.4));minus.addEventListener("click",()=>zoom(scale/1.4));reset.addEventListener("click",resetZoom);
 function dismiss(){if(typeof dialog.close==="function")dialog.close();else{dialog.removeAttribute("open");cleanup();}}
 function cleanup(){unlock();points.clear();previous=null;lastTap=null;photo.removeAttribute("src");if(opener?.isConnected)opener.focus({preventScroll:true});opener=null;}
 close.addEventListener("click",dismiss);dialog.addEventListener("close",cleanup);dialog.addEventListener("cancel",e=>{e.preventDefault();dismiss();});photo.addEventListener("load",draw);window.addEventListener("resize",()=>{if(dialog.open)draw();});
 return {open(img){if(dialog.open)return;opener=img;photo.alt=img.alt||"Изображение";photo.src=img.currentSrc||img.src;lock();if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");resetZoom();close.focus();},dismiss};
}
function showImage(img){if(!img.currentSrc&&!img.getAttribute("src"))return;if(activePanel&&closePanel)closePanel();if(!gallery)gallery=buildGallery();gallery.open(img);}
function install(){
 for(const [selector,mode] of settings){
  const target=document.querySelector(selector);if(!target)continue;
  if(mode==="image"){
   target.classList.add("nx-view-image");target.tabIndex=0;target.setAttribute("role","button");target.setAttribute("aria-label","Открыть изображение на весь экран");
   target.addEventListener("click",()=>showImage(target));target.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();showImage(target);}});continue;
  }
  const open=button("⛶ Развернуть","nx-view-open","Открыть результат на весь экран");
  const close=button("× Закрыть","nx-view-close","Закрыть полноэкранный результат");close.hidden=true;
  target.before(open,close);
  function visible(){open.hidden=!target.getClientRects().length||activePanel===target;}
  function collapse(){if(activePanel!==target)return;target.classList.remove("nx-view-expanded");close.hidden=true;activePanel=null;closePanel=null;unlock();visible();open.focus({preventScroll:true});}
  function expand(){if(activePanel===target)return;if(closePanel)closePanel();lock();activePanel=target;closePanel=collapse;target.classList.add("nx-view-expanded");close.hidden=false;visible();close.focus({preventScroll:true});}
  open.addEventListener("click",expand);close.addEventListener("click",collapse);
  if(mode==="panel"){
   target.classList.add("nx-view-clickable");
   target.addEventListener("click",e=>{const img=e.target.closest("img");if(img&&img.naturalWidth>0){e.preventDefault();showImage(img);return;}if(activePanel===target||e.target.closest("button,a,input,textarea,select,label,[contenteditable],summary")||String(window.getSelection()||"").trim())return;expand();});
  }
  // Game surfaces keep their original DOM and iframe; never intercept gameplay taps.
  if(typeof ResizeObserver!=="undefined"){const ro=new ResizeObserver(visible);ro.observe(target);}
  if(typeof MutationObserver!=="undefined"){const mo=new MutationObserver(visible);for(let el=target;el&&el!==document.body;el=el.parentElement)mo.observe(el,{attributes:true,attributeFilter:["hidden","class","style"]});}
  visible();
 }
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&closePanel)closePanel();});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
