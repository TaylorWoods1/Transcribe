#!/usr/bin/env node
/**
 * Stamp a unique deploy id into config, sw, and index.html before GitHub Pages publish.
 * CI sets GITHUB_SHA; local runs use `git rev-parse --short HEAD` or "dev".
 */
import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function resolveDeployId() {
  if (process.env.DEPLOY_ID) return process.env.DEPLOY_ID.slice(0, 12);
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}

const deployId = resolveDeployId();
const builtAt = new Date().toISOString();

async function stampFile(path, replacer) {
  const full = join(root, path);
  const before = await readFile(full, 'utf8');
  const after = replacer(before);
  if (after === before) {
    throw new Error(`stamp-deploy-version: no changes in ${path}`);
  }
  await writeFile(full, after);
  console.log(`Stamped ${path}`);
}

await stampFile('config.js', (src) =>
  src.replace(/deployId:\s*['"][^'"]*['"]/, `deployId: '${deployId}'`)
);

await stampFile('sw.js', (src) =>
  src.replace(/const DEPLOY_ID = ['"][^'"]*['"];/, `const DEPLOY_ID = '${deployId}';`)
);

await stampFile('index.html', (src) =>
  src.replaceAll('__DEPLOY_ID__', deployId)
);

const meta = { deployId, builtAt };
await writeFile(join(root, 'deploy-version.json'), `${JSON.stringify(meta, null, 2)}\n`);
console.log(`Wrote deploy-version.json (${deployId})`);
