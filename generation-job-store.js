import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export function createGenerationJobStore({directory=process.env.GENERATION_JOBS_DIR||path.join(os.tmpdir(),'vse-proekty-ian-generation-jobs'),cleanText=(v,n)=>String(v??'').slice(0,n)}={}){
const generationJobs = new Map();
// Free Render mode uses its ephemeral filesystem. Checkpoints improve recovery while the instance
// remains available, but they cannot survive every deploy, instance recycle, or filesystem reset.
const generationJobStoreDir = directory;
const generationJobWrites = new Map();

function generationJobArtifactDir(id) {
  return path.join(generationJobStoreDir, id + '.artifacts');
}
function jobResultSnapshot(result, artifacts = []) {
  if (!result) return null;
  const storedNames = new Set(artifacts.map(item => item.name));
  return {
    project: result.project,
    files: (result.files || []).map(file => storedNames.has(file.name)
      ? { name: file.name, mime: file.mime, storedAsArtifact: true }
      : { name: file.name, mime: file.mime, base64: file.base64 }),
    fileErrors: result.fileErrors || []
  };
}
function queuePersistGenerationJob(job) {
  const snapshot = {
    id: job.id, ownerId: job.ownerId, status: job.status, stage: job.stage, progress: job.progress,
    message: job.message, createdAt: job.createdAt, updatedAt: job.updatedAt,
    checkpoint: job.checkpoint || null, artifacts: job.artifacts || [],
    result: jobResultSnapshot(job.result, job.artifacts || []), error: job.error
  };
  const previous = generationJobWrites.get(job.id) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    await fs.promises.mkdir(generationJobStoreDir, { recursive: true, mode: 0o700 });
    const target = path.join(generationJobStoreDir, job.id + '.json');
    const temporary = target + '.' + crypto.randomUUID() + '.tmp';
    await fs.promises.writeFile(temporary, JSON.stringify(snapshot), {encoding:'utf8',mode:0o600});
    await fs.promises.rename(temporary, target);
  }).catch(error => {
    console.warn('[generation-job-store] Не удалось сохранить задачу:', cleanText(error?.message || error, 220));
  });
  generationJobWrites.set(job.id, next);
  void next.finally(()=>{if(generationJobWrites.get(job.id)===next)generationJobWrites.delete(job.id);});
  return next;
}
async function persistGenerationArtifact(job, file, source = 'deliverable') {
  if (!file || typeof file.base64 !== 'string') return;
  await fs.promises.mkdir(generationJobArtifactDir(job.id), { recursive: true, mode: 0o700 });
  const storageKey = crypto.createHash('sha256').update(file.name).digest('hex').slice(0, 24) + '.bin';
  const target = path.join(generationJobArtifactDir(job.id), storageKey);
  const temporary = target + '.' + crypto.randomUUID() + '.tmp';
  const bytes = Buffer.from(file.base64, 'base64');
  await fs.promises.writeFile(temporary, bytes,{mode:0o600});
  await fs.promises.rename(temporary, target);
  const metadata = { storageKey, name: file.name, mime: file.mime, size: bytes.length, source, updatedAt: Date.now() };
  const existing = (job.artifacts || []).findIndex(item => item.name === file.name);
  if (!Array.isArray(job.artifacts)) job.artifacts = [];
  if (existing >= 0) job.artifacts[existing] = metadata;
  else job.artifacts.push(metadata);
  job.updatedAt = Date.now();
  await queuePersistGenerationJob(job);
}
async function readGenerationArtifacts(job) {
  const files = [];
  for (const item of job.artifacts || []) {
    if (!/^[a-f0-9]{24}\.bin$/i.test(item.storageKey || '')) continue;
    try {
      const buffer = await fs.promises.readFile(path.join(generationJobArtifactDir(job.id), item.storageKey));
      files.push({ name: item.name, mime: item.mime, base64: buffer.toString('base64') });
    } catch (error) {
      console.warn('[generation-job-store] Не удалось прочитать файл задачи:', cleanText(error?.message || error, 180));
    }
  }
  return files;
}
async function loadPersistedGenerationJob(id,ownerId) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const raw = await fs.promises.readFile(path.join(generationJobStoreDir, id + '.json'), 'utf8');
    const job = JSON.parse(raw);
    if (!job || job.id !== id || job.ownerId!==ownerId || Date.now()-Number(job.updatedAt)>86400000) return null;
    job.artifacts = Array.isArray(job.artifacts) ? job.artifacts : [];
    const availableArtifacts = await readGenerationArtifacts(job);
    const filesByName = new Map(availableArtifacts.map(file => [file.name, file]));
    if (job.result?.files) {
      job.result.files = job.result.files.map(file => file.storedAsArtifact
        ? filesByName.get(file.name)
        : file).filter(Boolean);
    }
    const wasRunning = job.status === 'running';
    if (wasRunning) {
      job.status = 'interrupted';
      job.stage = 'interrupted';
      job.message = 'Сервер перезапустился во время генерации. Доступны только сохранённые этапы и файлы; продолжи генерацию повторно.';
      job.error = job.message;
      job.updatedAt = Date.now();
    }
    if (wasRunning) await queuePersistGenerationJob(job);
    return job;
  } catch {
    return null;
  }
}
async function pruneGenerationJobs() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  try {
    await fs.promises.mkdir(generationJobStoreDir, { recursive: true, mode: 0o700 });
    const entries = await fs.promises.readdir(generationJobStoreDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const id = entry.name.slice(0, -5);
      if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
      const cached = generationJobs.get(id);
      if (cached?.status === 'running') continue;
      let updatedAt = 0;
      try {
        const saved = JSON.parse(await fs.promises.readFile(path.join(generationJobStoreDir, entry.name), 'utf8'));
        updatedAt = Number(saved.updatedAt) || 0;
      } catch {}
      if (!updatedAt) {
        const stat = await fs.promises.stat(path.join(generationJobStoreDir, entry.name));
        updatedAt = stat.mtimeMs;
      }
      if (updatedAt < cutoff) {
        generationJobs.delete(id);
        await fs.promises.rm(path.join(generationJobStoreDir, entry.name), { force: true });
        await fs.promises.rm(generationJobArtifactDir(id), { recursive: true, force: true });
      }
    }
  } catch (error) {
    console.warn('[generation-job-store] Не удалось очистить старые задачи:', cleanText(error?.message || error, 180));
  }
}

return {generationJobs,generationJobStoreDir,queuePersistGenerationJob,persistGenerationArtifact,readGenerationArtifacts,loadPersistedGenerationJob,pruneGenerationJobs};
}
