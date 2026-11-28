import { spawn } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm, writeFile, readFile } from 'node:fs/promises';

const certificateUrl = 'https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt';
const certificatePath = join(tmpdir(), 'nexora-russian-trusted-root-ca-' + process.pid + '.pem');

async function prepareCertificate() {
  if(process.env.NODE_EXTRA_CA_CERTS){
    // A provisioned bundle takes precedence. Node accepts one PEM path, not a list.
    await readFile(process.env.NODE_EXTRA_CA_CERTS);
    return null;
  }
  const response = await fetch(certificateUrl, {
    headers: { Accept: 'application/x-x509-ca-cert, application/pkix-cert, text/plain, */*' },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error('Certificate download returned HTTP ' + response.status);

  const pem = (await response.text()).trim() + '\n';
  if (!pem.includes('-----BEGIN CERTIFICATE-----') || !pem.includes('-----END CERTIFICATE-----')) {
    throw new Error('The certificate source did not return a PEM certificate');
  }

  const certificate = new X509Certificate(pem);
  if (!certificate.ca || !certificate.subject.includes('Russian Trusted Root CA')) {
    throw new Error('The downloaded certificate is not the expected Russian Trusted Root CA');
  }
  if (Date.parse(certificate.validTo) <= Date.now()) {
    throw new Error('The Russian Trusted Root CA certificate has expired');
  }

  await writeFile(certificatePath, pem, { encoding: 'utf8', mode: 0o600 });
  return certificate;
}

let caReady = false;
try {
  const certificate = await prepareCertificate();
  caReady = Boolean(certificate);
  if(certificate)console.info('NEXORA: official Russian Trusted Root CA loaded for GigaChat TLS validation:', certificate.validTo);
} catch (error) {
  console.warn('NEXORA: could not load the official GigaChat CA certificate; starting without the additional CA:', error.message);
}

const childEnv = { ...process.env };
if (caReady) {
  childEnv.NODE_EXTRA_CA_CERTS = certificatePath;
  childEnv.NODE_USE_SYSTEM_CA = '1';
}

const server = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: childEnv,
  stdio: 'inherit'
});

let shuttingDown = false;
function forwardSignal(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (server.exitCode === null && server.signalCode === null) server.kill(signal);
}
process.once('SIGTERM', () => forwardSignal('SIGTERM'));
process.once('SIGINT', () => forwardSignal('SIGINT'));

server.once('error', error => {
  console.error('NEXORA server process failed to start:', error.message);
  process.exitCode = 1;
});
server.once('exit', async (code, signal) => {
  try { await rm(certificatePath, { force: true }); } catch {}
  process.exitCode = code ?? (signal ? 1 : 0);
});
