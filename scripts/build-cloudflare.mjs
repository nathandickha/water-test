import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'dist');

const excludedTopLevel = new Set([
  '.git',
  '.github',
  '.wrangler',
  'dist',
  'node_modules',
  'src',
  'scripts',
  'package.json',
  'package-lock.json',
  'bun.lock',
  'bun.lockb',
  'tsconfig.json',
  'wrangler.jsonc',
]);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (excludedTopLevel.has(entry.name)) continue;
  const source = path.join(root, entry.name);
  const destination = path.join(outDir, entry.name);
  await cp(source, destination, { recursive: true });
}

console.log('Cloudflare publish directory created at dist/');

