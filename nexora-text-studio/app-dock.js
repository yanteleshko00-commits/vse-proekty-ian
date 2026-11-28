(()=>{'use strict';
 const root=document.documentElement,mode=window.matchMedia('(display-mode: standalone)');
 const update=()=>root.toggleAttribute('data-nx-installed',window.top===window&&(mode.matches||navigator.standalone===true));
 update();if(mode.addEventListener)mode.addEventListener('change',update);else if(mode.addListener)mode.addListener(update);
 window.addEventListener('pageshow',update);
})();