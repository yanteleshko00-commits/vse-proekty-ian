(function(){
 "use strict";
 const host=document.querySelector(".nx-argosha-host");
 const greeting=document.getElementById("nx-argosha-greeting");
 const close=document.getElementById("nx-argosha-greeting-close");
 if(!host||!greeting||!close)return;
 const key="nexora-argosha-greeting-projects-v1";
 let seen=false;
 try{seen=sessionStorage.getItem(key)==="seen"}catch{}
 function dismiss(){
  greeting.hidden=true;
  try{sessionStorage.setItem(key,"seen")}catch{}
 }
 close.addEventListener("click",dismiss);
 host.addEventListener("toggle",()=>{if(host.open)dismiss()});
 if(!seen&&!host.open)greeting.hidden=false;
 // Avoid covering the page once users have seen the introduction.
 if(!seen)setTimeout(dismiss,11500);
})();
