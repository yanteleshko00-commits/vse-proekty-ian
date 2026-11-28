import {mkdir,readdir,stat,unlink,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const digest=value=>createHash('sha256').update(value).digest('hex');
// Memory fallback is deliberate for free deployments. An explicitly configured
// private mounted directory supports restart recovery and atomic single use.
export function createStudioTicketStore({directory=process.env.NEXORA_SSO_TICKET_DIR||'',clock=Date.now,capacity=1000,ttl=60000}={}){
 const memory=new Map();
 const filename=id=>join(directory,digest(id)+'.json');
 async function issue({state,userId,sessionId}){
  if(!valid(state)||!userId||!sessionId)throw Error('Invalid ticket data');
  const now=clock(),ticket=randomBytes(32).toString('base64url');
  const data={state,userId,sessionId,expiresAt:now+ttl};
  if(!directory){
   for(const [id,t] of memory)if(t.expiresAt<=now)memory.delete(id);
   if(memory.size>=capacity)return null;
   memory.set(digest(ticket),data);return ticket;
  }
  await mkdir(directory,{recursive:true,mode:0o700});
  let count=0;
  for(const name of await readdir(directory)){
   if(!/^[a-f0-9]{64}\.json(?:\.claim-[a-f0-9]{16})?$/.test(name))continue;
   const file=join(directory,name);
   try{const info=await stat(file);if(info.mtimeMs+ttl<=now)await unlink(file);else if(name.endsWith('.json'))count++;}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  if(count>=capacity)return null;
  await writeFile(filename(ticket),JSON.stringify(data),{mode:0o600,flag:'wx'});return ticket;
 }
 async function consume(ticket,state){
  if(!valid(ticket)||!valid(state))return null;
  const now=clock(),matches=t=>t&&t.expiresAt>now&&t.state===state&&t.userId&&t.sessionId;
  if(!directory){const key=digest(ticket),data=memory.get(key);if(!matches(data))return null;memory.delete(key);return data;}
  const file=filename(ticket);
  let data;try{data=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
  if(!matches(data))return null;
  const claim=file+'.claim-'+randomBytes(8).toString('hex');
  try{await rename(file,claim);}catch(error){if(error.code==='ENOENT')return null;throw error;}
  try{return matches(data)&&data.expiresAt>clock()?data:null;}finally{await unlink(claim).catch(()=>{});}
 }
 return {issue,consume,mode:directory?'configured-directory':'memory'};
}
