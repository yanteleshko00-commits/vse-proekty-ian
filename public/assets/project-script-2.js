(function(){
  const root=document.documentElement;
  const isInstalledApp = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  if(isInstalledApp){
    root.setAttribute("data-app-mode","standalone");
  }else{
    root.setAttribute("data-app-mode","browser");
    const initialSplash=document.getElementById("appSplash");
    if(initialSplash)initialSplash.remove();
  }
  function setTheme(theme){
    const dark=theme==="dark";
    root.setAttribute("data-theme",dark?"dark":"light");
    try{localStorage.setItem("vseProektyTheme",dark?"dark":"light")}catch(e){}
    const icon=document.getElementById("themeIcon");
    const btn=document.getElementById("themeToggle");
    if(icon)icon.textContent=dark?"☀️":"🌙";
    if(btn){btn.setAttribute("aria-label",dark?"Включить светлую тему":"Включить тёмную тему");btn.setAttribute("title",dark?"Включить светлую тему":"Включить тёмную тему")}
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute("content",dark?"#10141b":"#f5f6f7");
  }
  let saved="light";
  try{saved=localStorage.getItem("vseProektyTheme")||"light"}catch(e){}
  setTheme(saved);
  document.addEventListener("DOMContentLoaded",function(){
    const btn=document.getElementById("themeToggle");
    if(btn)btn.addEventListener("click",function(){setTheme(root.getAttribute("data-theme")==="dark"?"light":"dark")});
    const splash=document.getElementById("appSplash");
    const switchButton=document.getElementById("lampSwitch");
    if(splash&&switchButton){
      const lampImage=splash.querySelector(".logo-lamp-image");
      const lampScene=splash.querySelector(".lamp-scene");
      const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
      const originalLampSrc=lampImage?lampImage.src:"";
      let lampLoaded=false;
      let lowResData="";
      let loadStarted=performance.now();
      function connectionIsSlow(){
        if(!connection)return false;
        const type=String(connection.effectiveType||"").toLowerCase();
        return !!connection.saveData||type==="slow-2g"||type==="2g"||type==="3g"||
          (Number(connection.downlink)>0&&Number(connection.downlink)<1.2);
      }
      function makeLampLowRes(){
        if(!lampImage||!lampLoaded||!lowResData)return;
        lampImage.src=lowResData;
        lampScene.classList.add("lamp-low-resolution");
      }
      function updateLampQuality(){
        if(connectionIsSlow())makeLampLowRes();
        else if(lampImage&&lampLoaded){
          lampScene.classList.remove("lamp-low-resolution");
          if(lampImage.src!==originalLampSrc)lampImage.src=originalLampSrc;
        }
      }
      if(lampImage){
        lampImage.style.opacity="0";
        const finishLampLoad=async function(){
          try{if(lampImage.decode)await lampImage.decode()}catch(e){}
          lampLoaded=true;
          try{
            const canvas=document.createElement("canvas");
            canvas.width=36;canvas.height=36;
            const ctx=canvas.getContext("2d");
            if(ctx){ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="low";ctx.drawImage(lampImage,0,0,36,36);lowResData=canvas.toDataURL("image/png")}
          }catch(e){}
          if(connectionIsSlow()||performance.now()-loadStarted>900)makeLampLowRes();
          lampImage.style.opacity="1";
          lampScene.classList.add("lamp-image-ready");
        };
        if(lampImage.complete&&lampImage.naturalWidth)finishLampLoad();
        else lampImage.addEventListener("load",finishLampLoad,{once:true});
        lampImage.addEventListener("error",function(){lampScene.classList.add("lamp-image-failed")},{once:true});
      }
      if(connection&&connection.addEventListener)connection.addEventListener("change",updateLampQuality);
      switchButton.addEventListener("click",function(){
        if(splash.classList.contains("is-lighting"))return;
        switchButton.disabled=true;
        splash.classList.add("is-lighting");
        window.setTimeout(function(){
          splash.classList.add("reveal-site");
          window.setTimeout(function(){splash.remove()},750);
        },1450);
      });
    }
  });
})();
