(()=>{'use strict';
 const root=document.documentElement,mode=window.matchMedia('(display-mode: standalone)'),reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
 const dock=document.querySelector('.nx-pwa-dock');
 if(!dock)return;
 const links=[...dock.querySelectorAll('a[data-tool]')],current=links.find(a=>a.hasAttribute('aria-current'))||links[3];
 let selected=current,gesture=null,navigating=false,suppressClickUntil=0,ready=false,animationFrame=0;
 const installed=()=>window.top===window&&(mode.matches||navigator.standalone===true);
 const set=(name,value)=>dock.style.setProperty('--nx-pill-'+name,value);
 function move(target,{stretch=1,scale=1}={}){
  if(!target||!installed())return;
  selected=target;
  for(const a of links)a.toggleAttribute('data-preview',a===target);
  set('x',target.offsetLeft+'px');set('y',target.offsetTop+'px');set('w',target.offsetWidth+'px');set('h',target.offsetHeight+'px');set('stretch',String(stretch));set('scale',String(scale));
 }
 function layout(){
  cancelAnimationFrame(animationFrame);
  if(!installed())return;
  animationFrame=requestAnimationFrame(()=>{move(selected);if(!ready){ready=true;dock.setAttribute('data-ready','');}});
 }
 function update(){
  root.toggleAttribute('data-nx-installed',installed());
  if(installed()){layout();}else{dock.removeAttribute('data-ready');ready=false;gesture=null;}
 }
 function reset(){gesture=null;dock.removeAttribute('data-dragging');for(const a of links)a.removeAttribute('data-pressed');move(current);}
 function closest(x){return links.reduce((best,a)=>{const b=a.getBoundingClientRect(),v=Math.abs(x-b.left-b.width/2);return !best||v<best.distance?{a,distance:v}:best;},null)?.a;}
 function go(target){
  if(!installed()||!target||navigating)return;
  dock.removeAttribute('data-dragging');for(const a of links)a.removeAttribute('data-pressed');move(target);
  if(target===current){move(current);return;}
  navigating=true;
  const finish=()=>{location.assign(target.href);};
  if(reduce.matches)finish();else setTimeout(finish,210);
 }
 dock.addEventListener('pointerdown',e=>{
  if(!installed()||navigating||e.button!==0||!e.isPrimary)return;
  const target=e.target.closest('a[data-tool]');if(!target)return;
  gesture={id:e.pointerId,x:e.clientX,y:e.clientY,start:target,drag:false};
  target.setAttribute('data-pressed','');move(target,{stretch:1.055,scale:1.04});
 });
 dock.addEventListener('pointermove',e=>{
  if(!gesture||e.pointerId!==gesture.id)return;
  const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
  if(!gesture.drag&&Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){reset();return;}
  if(!gesture.drag&&Math.abs(dx)>8){gesture.drag=true;dock.setAttribute('data-dragging','');try{dock.setPointerCapture(e.pointerId);}catch{}}
  if(gesture.drag){for(const a of links)a.removeAttribute('data-pressed');const target=closest(e.clientX);if(target){target.setAttribute('data-pressed','');move(target,{stretch:1.12,scale:1.065});}e.preventDefault();}
 });
 dock.addEventListener('pointerup',e=>{
  if(!gesture||e.pointerId!==gesture.id)return;
  const g=gesture;gesture=null;dock.removeAttribute('data-dragging');for(const a of links)a.removeAttribute('data-pressed');
  if(g.drag){suppressClickUntil=performance.now()+500;const target=closest(e.clientX);go(target);e.preventDefault();}
  else move(g.start);
 });
 dock.addEventListener('pointercancel',reset);
 dock.addEventListener('lostpointercapture',()=>{if(gesture)reset();});
 dock.addEventListener('pointerleave',()=>{if(gesture&&!gesture.drag)reset();});
 dock.addEventListener('click',e=>{
  const target=e.target.closest('a[data-tool]');if(!target||!installed()||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  e.preventDefault();if(performance.now()<suppressClickUntil||navigating)return;go(target);
 });
 if(mode.addEventListener)mode.addEventListener('change',update);else if(mode.addListener)mode.addListener(update);
 window.addEventListener('resize',layout,{passive:true});
 window.addEventListener('pageshow',()=>{navigating=false;reset();update();});
 if(typeof ResizeObserver==='function')new ResizeObserver(layout).observe(dock);
 update();
})();