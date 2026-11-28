import {readFile,writeFile} from 'node:fs/promises';
const names=['runtime-config.js','background-jobs.js','visitor-analytics.js','public-performance.js'];
for(const name of names){
 const canonical=await readFile('nexora/'+name);
 for(const dir of ['nexora-image-studio','nexora-math-studio','nexora-text-studio'])await writeFile(dir+'/'+name,canonical);
}
console.log('Standalone common modules synchronized.');
