import {readFile,writeFile} from 'node:fs/promises';
const parts=await Promise.all(Array.from({length:11},(_,i)=>readFile('public/assets/project-style-'+(i+1)+'.css','utf8')));
const result=parts.map((part,i)=>'/* Cascade section '+(i+1)+' */\n'+part).join('\n\n');
if(process.argv.includes('--check')){
 if(await readFile('public/assets/project-core.css','utf8')!==result)throw Error('Project CSS bundle is out of date; run node scripts/build-project-css.mjs');
}else await writeFile('public/assets/project-core.css',result);
