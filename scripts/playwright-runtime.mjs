// Render builds do not always persist binaries downloaded to ~/.cache.
// Store Chromium inside node_modules, which is included in the deployment.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
const mode = process.argv[2];

if (mode === 'install') {
  const binary = join('node_modules', '.bin', process.platform === 'win32' ? 'playwright.cmd' : 'playwright');
  const result = spawnSync(binary, ['install', 'chromium'], {
    env: process.env, stdio: 'inherit', shell: process.platform === 'win32'
  });
  if (result.error || result.status !== 0) {
    console.error('Playwright Chromium install failed:', result.error?.message || result.status);
    process.exit(result.status || 1);
  }
} else if (mode === 'start') {
  // Dynamic import is necessary: Playwright reads BROWSERS_PATH at module load.
  const { chromium } = await import('playwright');
  const browserPath = chromium.executablePath();
  if (!existsSync(browserPath)) {
    console.error('[product-design] Chromium binary is missing:', browserPath);
  } else {
    console.info('[product-design] Chromium is present in bundled deployment.');
  }
  await import('../server.js');
} else {
  console.error('Usage: node scripts/playwright-runtime.mjs install|start');
  process.exit(2);
}
