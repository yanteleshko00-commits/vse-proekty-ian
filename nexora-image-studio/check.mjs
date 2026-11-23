import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import vm from 'node:vm';

const here=fileURLToPath(new URL('.',import.meta.url));
const html=await readFile(join(here,'public/index.html'),'utf8');
for(const id of ['prompt','generate','ratio','quality','nxquiz','nxq-question','nxq-preview','nxq-next','nxq-skip','nxq-back','nxq-options'])
 assert.ok(html.includes('id="'+id+'"'),'Missing Image Studio item: '+id);
assert.match(html,/role="dialog" aria-modal="true"/);
assert.match(html,/Шаг 1 из 3/);
assert.match(html,/nxqOpenImage\(\)/);
assert.match(html,/generate\.addEventListener\('click',nxqOpenImage\)/);
assert.match(html,/const content=\(prompt\.value\.trim\(\)\+"\. Визуальный стиль: "/);
assert.match(html,/void run\(content,null\)/);
assert.match(html,/composer \.settings\{display:none!important\}/);
const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(js);
new vm.Script(js);
const css=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
assert.ok(css);
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
console.log('Image Studio quiz checks passed: 3 stages, photo styles, ratios, detail, automatic generation and JS syntax.');
