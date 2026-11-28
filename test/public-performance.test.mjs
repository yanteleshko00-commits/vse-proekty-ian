import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {request} from 'node:http';
import {brotliDecompressSync,gunzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {sendPublicAsset} from '../nexora/public-performance.js';
test('public compression, validators and opt-out',async()=>{
 const body=await readFile('nexora/public/index.html');
 const server=createServer((req,res)=>sendPublicAsset(req,res,'lobby',body,{'Content-Type':'text/html; charset=utf-8'}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const get=(headers={},method='GET')=>new Promise((resolve,reject)=>{const req=request({host:'127.0.0.1',port:server.address().port,path:'/',headers,method},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end();});
 try{
 const br=await get({'Accept-Encoding':'gzip, br'}),gz=await get({'Accept-Encoding':'gzip'}),raw=await get({'Accept-Encoding':'br;q=0,gzip;q=0'});
 assert.equal(br.headers['content-encoding'],'br');assert.equal(gz.headers['content-encoding'],'gzip');assert.equal(raw.headers['content-encoding'],undefined);
 assert.deepEqual(brotliDecompressSync(br.body),body);assert.deepEqual(gunzipSync(gz.body),body);assert.deepEqual(raw.body,body);
 assert.ok(br.body.length<body.length/2);assert.ok(gz.body.length<body.length/2);
 assert.equal((await get({'Accept-Encoding':'br','If-None-Match':br.headers.etag})).status,304);
 assert.equal((await get({'Accept-Encoding':'gzip','If-None-Match':br.headers.etag})).status,200);
 assert.equal((await get({'Accept-Encoding':'br'},'HEAD')).body.length,0);
 console.log(JSON.stringify({raw:body.length,brotli:br.body.length,gzip:gz.body.length}));
 }finally{await new Promise(r=>server.close(r));}
});
