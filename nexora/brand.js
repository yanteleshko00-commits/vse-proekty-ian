import {deflateSync} from 'node:zlib';
// NEXORA: single ribbon mark, flat indigo and lavender, no external assets.
export const brandSVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="NEXORA"><rect width="128" height="128" rx="28" fill="#17132d"/><path d="M39 88V40M89 40V88" fill="none" stroke="#7656cf" stroke-width="17" stroke-linecap="round"/><path d="M39 40L89 88" fill="none" stroke="#c4a7ff" stroke-width="17" stroke-linecap="round"/></svg>';
const adminShield=[[64,18],[103,33],[103,72],[92,93],[64,110],[36,93],[25,72],[25,33],[64,18]];
const adminLetter=[[44,81],[44,46],[84,81],[84,46]];
const adminPalette={bg:[7,48,35],shield:[50,179,124],letter:[167,255,205]};
export const adminBrandSVG='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="NEXORA Admin"><rect width="128" height="128" rx="28" fill="#073023"/><path d="M64 18L103 33V72L92 93L64 110L36 93L25 72V33Z" fill="none" stroke="#32b37c" stroke-width="5" stroke-linejoin="round"/><path d="M44 81V46L84 81V46" fill="none" stroke="#a7ffcd" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const cache=new Map();
function crc(buf){let c=0xffffffff;for(const v of buf){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(name,data){const type=Buffer.from(name),header=Buffer.alloc(4),tail=Buffer.alloc(4);header.writeUInt32BE(data.length);tail.writeUInt32BE(crc(Buffer.concat([type,data])));return Buffer.concat([header,type,data,tail]);}
function distance(x,y,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,t=Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-x1-t*dx,y-y1-t*dy);}
function pathDistance(x,y,points){let d=Infinity;for(let i=1;i<points.length;i++)d=Math.min(d,distance(x,y,...points[i-1],...points[i]));return d;}
function coverage(d,r,w){return Math.max(0,Math.min(1,(r+w/2-d)/w));}
export function brandPNG(size,admin=false){
 const cacheKey=admin?`admin-${size}`:size;
 if(cache.has(cacheKey))return cache.get(cacheKey);
 const data=Buffer.alloc((size*3+1)*size),ihdr=Buffer.alloc(13);
 ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=2;
 // Opaque, full bleed iOS tile. Same mark geometry as the SVG.
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const a=(x+.5)*128/size,b=(y+.5)*128/size,w=128/size;
  const p=Math.max(0,Math.min(1,(8.5+w/2-Math.min(distance(a,b,39,88,39,40),distance(a,b,89,40,89,88)))/w));
  const q=Math.max(0,Math.min(1,(8.5+w/2-distance(a,b,39,40,89,88))/w));
  const off=y*(size*3+1)+1+x*3;
  if(admin){
   const shield=coverage(pathDistance(a,b,adminShield),2.5,w),letter=coverage(pathDistance(a,b,adminLetter),5.5,w);
   for(let k=0;k<3;k++)data[off+k]=Math.round((adminPalette.bg[k]*(1-shield)+adminPalette.shield[k]*shield)*(1-letter)+adminPalette.letter[k]*letter);
  }else{
   const bg=[23,19,45],base=[118,86,207],top=[196,167,255];
   for(let k=0;k<3;k++)data[off+k]=Math.round((bg[k]*(1-p)+base[k]*p)*(1-q)+top[k]*q);
  }
 }
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(data)),chunk('IEND',Buffer.alloc(0))]);
 cache.set(cacheKey,png);return png;
}
export function serveBrand(req,res,pathname,name='NEXORA'){
 if(!['GET','HEAD'].includes(req.method))return false;
 let body,type;
 if(pathname==='/nexora-mark.svg'||pathname==='/favicon.ico'){body=brandSVG;type='image/svg+xml';}
 else if(pathname==='/nexora-admin-mark.svg'){body=adminBrandSVG;type='image/svg+xml';}
 else if(['/admin-icon-180.png','/admin-icon-192.png','/admin-icon-512.png'].includes(pathname)){body=brandPNG(pathname.includes('192')?192:pathname.includes('512')?512:180,true);type='image/png';}
 else if(['/apple-touch-icon.png','/icon-192.png','/icon-512.png'].includes(pathname)){body=brandPNG(pathname.includes('192')?192:pathname.includes('512')?512:180);type='image/png';}
 else if(pathname==='/nexora.webmanifest'||pathname==='/manifest.json'||pathname==='/nexora-admin.webmanifest'){
  const admin=pathname==='/nexora-admin.webmanifest';
  body=JSON.stringify({id:admin?'/developer':'/',name:admin?'NEXORA Developer Console':name,short_name:admin?'NEXORA Admin':name.split(' ').slice(0,2).join(' '),start_url:admin?'/developer':'/',scope:'/',display:'standalone',background_color:admin?'#073023':'#17132d',theme_color:admin?'#073023':'#17132d',icons:[{src:admin?'/admin-icon-192.png?v=4':'/icon-192.png?v=2',sizes:'192x192',type:'image/png',purpose:'any'},{src:admin?'/admin-icon-512.png?v=4':'/icon-512.png?v=2',sizes:'512x512',type:'image/png',purpose:'any'}]});type='application/manifest+json';
 }else return false;
 res.writeHead(200,{'Content-Type':type,'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'});
 res.end(req.method==='HEAD'?undefined:body);return true;
}
