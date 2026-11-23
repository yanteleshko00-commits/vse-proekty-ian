import test from 'node:test';
import assert from 'node:assert/strict';
import {
  internalAliceTokenValid, imageStudioAliceReady, forwardAliceText
} from './alice-text.js';

test('Image Studio proxy rejects missing or incorrect internal credentials', () => {
  assert.equal(internalAliceTokenValid('wrong','test'.repeat(12)), false);
  assert.equal(internalAliceTokenValid('secret',''), false);
  const secret='a'.repeat(60);
  assert.equal(internalAliceTokenValid(secret,secret),true);
  assert.equal(internalAliceTokenValid(secret.slice(1),secret),false);
});
test('shared Yandex image key can authenticate LLM requests without disclosure', async () => {
  const env={YANDEX_API_KEY:'existing-image-key',YANDEX_FOLDER_ID:'folder',ALICE_INTERNAL_TOKEN:'a'.repeat(60)};
  assert.equal(imageStudioAliceReady(env),true);
  let request;
  const fake=async (url, options)=>{
    request={url,options};
    return {ok:true,status:200,json:async()=>({choices:[{message:{content:'{"slides":[]}'}}]})};
  };
  const output=await forwardAliceText({instructions:'План презентации',input:'{"topic":"Космос"}',jsonMode:true},env,fake);
  assert.equal(output,'{"slides":[]}');
  assert.equal(request.url,'https://ai.api.cloud.yandex.net/v1/chat/completions');
  assert.equal(request.options.headers.Authorization,'Api-Key existing-image-key');
  assert.equal(request.options.headers['OpenAI-Project'],'folder');
  assert.equal(JSON.parse(request.options.body).model,'gpt://folder/aliceai-llm');
});
test('image-only key without text role returns a safe actionable error', async () => {
  const env={YANDEX_API_KEY:'image-key',YANDEX_FOLDER_ID:'folder'};
  await assert.rejects(
    forwardAliceText({instructions:'A',input:'B'},env,async()=>({
      ok:false,status:403,json:async()=>({error:{message:'sensitive image-key'}})
    })),
    error => error.status===403 && error.message.includes('ai.languageModels.user') && !error.message.includes('image-key')
  );
});
