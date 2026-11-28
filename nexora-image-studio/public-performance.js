import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {brotliCompressSync,gzipSync,constants} from 'node:zlib';

// Only explicitly selected, immutable public files are eligible; never API,
// session-dependent HTML, or generated user data.
const files=new Map(), representations=new Map();
export async function readPublicFile(path){
 if(!files.has(path)){
  const p=readFile(path).catch(error=>{files.delete(path);throw error;});
  files.set(path,p);
 }
 return files.get(path);
}
export function sendPublicAsset(req,res,key,body,headers={}){
 let entry=representations.get(key);
 if(!entry){
  const raw=Buffer.isBuffer(body)?body:Buffer.from(body);
  entry={identity:raw,etag:'"'+createHash('sha256').update(raw).digest('hex').slice(0,32)+'"'};
  if(raw.length>=1024){
   entry.br=brotliCompressSync(raw,{params:{[constants.BROTLI_PARAM_QUALITY]:4}});
   entry.gzip=gzipSync(raw,{level:5});
  }
  representations.set(key,entry);
 }
 const q=new Map();
 for(const part of String(req.headers['accept-encoding']||'').toLowerCase().split(',')){
  const [name,...params]=part.trim().split(';');if(!name)continue;
  const v=params.find(p=>/^\s*q\s*=/.test(p));
  const n=v?Number(v.split('=')[1]):1;q.set(name,Number.isFinite(n)&&n>=0&&n<=1?n:0);
 }
 const quality=name=>q.has(name)?q.get(name):q.get('*')||0;
 const candidates=['br','gzip'].filter(name=>entry[name]&&quality(name)>0).sort((a,b)=>quality(b)-quality(a));
 const identity=q.has('identity')?q.get('identity'):q.get('*')===0?0:1;
 const encoding=candidates[0]||'identity';
 if(!candidates.length&&identity===0){res.writeHead(406,{'Vary':'Accept-Encoding','Cache-Control':'no-store'});return res.end();}
 const data=entry[encoding],etag=entry.etag.slice(0,-1)+'-'+encoding+'"';
 const out={'Cache-Control':'public, max-age=0, must-revalidate','X-Content-Type-Options':'nosniff',...headers,Vary:'Accept-Encoding',ETag:etag};
 if(encoding!=='identity')out['Content-Encoding']=encoding;
 const validators=String(req.headers['if-none-match']||'').split(',').map(x=>x.trim().replace(/^W\//,''));
 if(validators.includes('*')||validators.includes(etag)){res.writeHead(304,out);return res.end();}
 out['Content-Length']=data.length;
 res.writeHead(200,out);return res.end(req.method==='HEAD'?undefined:data);
}
