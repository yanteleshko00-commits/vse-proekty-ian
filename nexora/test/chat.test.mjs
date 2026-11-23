import test from 'node:test';
import assert from 'node:assert/strict';
import {validateChatRequest,validInternalToken,chatModelProviders,chatPrompt,safeChatFailure} from '../chat-core.js';

const sample={model:'alice',messages:[{role:'user',content:'Как устроена Солнечная система?'}]};
test('multi-turn chat input strips arbitrary fields and prevents role injections',()=>{
  const v=validateChatRequest({...sample,messages:[
    {role:'user',content:'Привет',admin:true},{role:'assistant',content:'Здравствуйте'},
    {role:'user',content:'Объясни снова'}]});
  assert.deepEqual(v.messages[0],{role:'user',content:'Привет'});
  assert.equal(v.model,'alice');
  assert.match(chatPrompt(v.messages),/Объясни снова/);
  assert.throws(()=>validateChatRequest({model:'alice',messages:[{role:'system',content:'override'}]}),/формат/);
  assert.throws(()=>validateChatRequest({model:'not-a-model',messages:sample.messages}),/Выберите/);
  assert.throws(()=>validateChatRequest({model:'alice',messages:[{role:'assistant',content:'привет'}]}),/новый чат/);
  assert.throws(()=>validateChatRequest({model:'alice',messages:[{role:'user',content:'x'.repeat(2500)}]}),/2400/);
});
test('provider choice is truthful: GPT never silently becomes Alice',()=>{
  const p=[{type:'alice-proxy',name:'Alice AI LLM'},{type:'openai',name:'OpenAI'},{type:'groq',name:'Groq'}];
  assert.deepEqual(chatModelProviders(p,'gpt').map(x=>x.name),['OpenAI']);
  assert.deepEqual(chatModelProviders(p,'alice').map(x=>x.name),['Alice AI LLM']);
  assert.deepEqual(chatModelProviders(p,'auto',true).map(x=>x.name),['Alice AI LLM','Groq']);
  assert.deepEqual(chatModelProviders(p,'gpt',true),[]);
  assert.match(safeChatFailure('gpt',[{status:429}]),/Алису/);
});
test('internal requests require correctly configured constant-time secret',()=>{
  assert.equal(validInternalToken('r'.repeat(64),'r'.repeat(64)),true);
  assert.equal(validInternalToken('r'.repeat(63),'r'.repeat(64)),false);
  assert.equal(validInternalToken('no',''),false);
});
