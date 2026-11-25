// Read-only audit of installed dependencies; propose safe lockfile updates in isolation.
import {spawnSync} from 'node:child_process';
import {mkdtempSync,copyFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
function npm(args,cwd=process.cwd()){return spawnSync('npm',args,{cwd,encoding:'utf8',timeout:25000,maxBuffer:4*1024*1024,env:{...process.env,npm_config_ignore_scripts:'true',npm_config_fund:'false'}});}
function audit(cwd,label){
  const r=npm(['audit','--omit=dev','--json'],cwd);
  try{
    const data=JSON.parse(r.stdout);
    if(!data.metadata?.vulnerabilities)throw Error('No audit metadata');
    console.log('NEXORA_AUDIT_'+label,JSON.stringify(data.metadata.vulnerabilities));
    for(const [name,v] of Object.entries(data.vulnerabilities||{})){
      console.log('NEXORA_AUDIT_PACKAGE_'+label,JSON.stringify({name,severity:v.severity,range:v.range,fix:v.fixAvailable,via:(v.via||[]).map(x=>typeof x==='string'?x:{title:x.title,url:x.url,range:x.range})}));
    }
    return true;
  }catch{console.warn('NEXORA_AUDIT_UNAVAILABLE',label,r.status,r.error?.name||'');return false;}
}
if(audit(process.cwd(),'BEFORE')){
  const dir=mkdtempSync(join(tmpdir(),'nexora-audit-'));
  try{
    for(const name of ['package.json','package-lock.json'])copyFileSync(name,join(dir,name));
    const before=JSON.parse(readFileSync(join(dir,'package-lock.json'),'utf8'));
    const run=npm(['audit','fix','--package-lock-only','--ignore-scripts','--no-fund','--json'],dir);
    console.log('NEXORA_AUDIT_FIX_EXIT',run.status,run.error?.name||'');
    const after=JSON.parse(readFileSync(join(dir,'package-lock.json'),'utf8'));
    for(const [name,entry] of Object.entries(after.packages||{})){
      if(JSON.stringify(entry)!==JSON.stringify(before.packages?.[name]))console.log('NEXORA_LOCK_CHANGE',JSON.stringify({name,entry}));
    }
    for(const name of Object.keys(before.packages||{}))if(!(name in after.packages))console.log('NEXORA_LOCK_REMOVE',JSON.stringify(name));
    audit(dir,'AFTER');
  }catch(error){console.warn('NEXORA_AUDIT_PATCH_UNAVAILABLE',error.name);}
  finally{rmSync(dir,{recursive:true,force:true});}
}
