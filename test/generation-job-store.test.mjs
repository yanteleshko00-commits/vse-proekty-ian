import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createGenerationJobStore} from '../generation-job-store.js';
test('project checkpoints and files survive a process-local store recreation; owner isolation and interruption preserved',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'nx-job-test-'));
 try{
  const first=createGenerationJobStore({directory}),id=randomUUID();
  const job={id,ownerId:'guest:owner-a',status:'running',stage:'rendering',progress:50,createdAt:Date.now(),updatedAt:Date.now(),checkpoint:{stage:'plan'},artifacts:[]};
  await first.queuePersistGenerationJob(job);
  const file={name:'demo.txt',mime:'text/plain',base64:Buffer.from('example file').toString('base64')};
  await first.persistGenerationArtifact(job,file);
  const second=createGenerationJobStore({directory});
  assert.equal(await second.loadPersistedGenerationJob(id,'guest:owner-b'),null);
  const recovered=await second.loadPersistedGenerationJob(id,job.ownerId);
  assert.equal(recovered.status,'interrupted');assert.equal(recovered.progress,50);assert.deepEqual(recovered.checkpoint,{stage:'plan'});
  assert.deepEqual(await second.readGenerationArtifacts(recovered),[file]);
  assert.equal((await stat(join(directory,id+'.json'))).mode&0o077,0);
  job.status='completed';job.result={project:{title:'demo'},files:[file],fileErrors:[]};await first.queuePersistGenerationJob(job);
  const completed=await createGenerationJobStore({directory}).loadPersistedGenerationJob(id,job.ownerId);
  assert.equal(completed.status,'completed');assert.deepEqual(completed.result.files,[file]);
  job.updatedAt=Date.now()-90000000;await first.queuePersistGenerationJob(job);await first.pruneGenerationJobs();
  assert.equal(await second.loadPersistedGenerationJob(id,job.ownerId),null);
 }finally{await rm(directory,{recursive:true,force:true});}
});
