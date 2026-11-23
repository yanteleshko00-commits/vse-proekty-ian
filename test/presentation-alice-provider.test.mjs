import test from 'node:test';
import assert from 'node:assert/strict';
import { aliceProviderFromEnv, requestAliceAIText } from '../alice-provider.js';

test('Alice AI LLM uses a separate text model and requires both credentials', () => {
  assert.equal(aliceProviderFromEnv({ YANDEX_API_KEY: 'test-key' }), null);
  assert.equal(aliceProviderFromEnv({ YANDEX_FOLDER_ID: 'folder' }), null);
  const provider = aliceProviderFromEnv({
    YANDEX_API_KEY: 'Api-Key test-key', YANDEX_FOLDER_ID: 'folder'
  });
  assert.equal(provider.model, 'gpt://folder/aliceai-llm');
  assert.equal(provider.type, 'alice');
  assert.equal(provider.key, 'test-key');
});

test('Alice text JSON requests use documented Chat Completions API', async () => {
  const provider = aliceProviderFromEnv({YANDEX_API_KEY:'secret-value',YANDEX_FOLDER_ID:'folder'});
  let request;
  const fetchMock = async (url, options) => {
    request = {url, options};
    return {ok:true, status:200, json:async()=>({choices:[{message:{content:'{"slides":[{"title":"Космос"}]}'}}]})};
  };
  const answer = await requestAliceAIText(provider,'Составь план','{"topic":"Космос"}',true,25000,fetchMock);
  assert.deepEqual(JSON.parse(answer),{slides:[{title:'Космос'}]});
  assert.equal(request.url,'https://ai.api.cloud.yandex.net/v1/chat/completions');
  assert.equal(request.options.headers.Authorization,'Api-Key secret-value');
  assert.equal(request.options.headers['OpenAI-Project'],'folder');
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.model,'gpt://folder/aliceai-llm');
  assert.match(payload.messages[0].content,/JSON/);
});

test('Alice provider HTTP failures do not reveal API keys', async () => {
  const provider=aliceProviderFromEnv({YANDEX_API_KEY:'secret-value',YANDEX_FOLDER_ID:'folder'});
  await assert.rejects(
    requestAliceAIText(provider,'i','p',true,20000,async()=>({
      ok:false,status:403,json:async()=>({error:{message:'invalid secret-value'}})
    })),
    error => error.message.includes('403') && !error.message.includes('secret-value')
  );
});
