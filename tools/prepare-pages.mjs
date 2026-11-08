import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../js/version.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, '_site');
const worker = await readFile(resolve(root, 'sw.js'), 'utf8');
const declaration = worker.match(/const APP_SHELL = \[([\s\S]*?)\];/);
if (!declaration) throw new Error('ไม่พบรายการทรัพยากรออฟไลน์');
const optional = worker.match(/const OPTIONAL_ASSETS = \[([\s\S]*?)\];/);
const files = new Set([...((declaration[1])+(optional?.[1]??'')).matchAll(/'([^']+)'/g)]
  .map(match => match[1] === './' ? 'index.html' : match[1].replace(/^\.\//, '')));
for (const file of ['sw.js', '.nojekyll', 'lib/d3-LICENSE.txt', 'lib/topojson-client-LICENSE.txt',
  'data/world-atlas-LICENSE.txt', 'data/cldr-LICENSE.txt', 'data/SOURCES.md', 'data/RESOURCE_SOURCES.md']) files.add(file);

// ตรวจให้ครบก่อนคัดลอก เพื่อไม่เผยแพร่ชุดไฟล์ที่ขาดหาย
for (const file of files) {
  const source = resolve(root, file);
  const local = relative(root, source);
  if (local.startsWith(`..${sep}`) || local === '..') throw new Error('เส้นทางอยู่นอกโปรเจกต์');
  await readFile(source);
}
for (const file of files) {
  const destination = resolve(output, file);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(root, file), destination);
}
await writeFile(resolve(output, 'release.json'), JSON.stringify({
  version: VERSION, commit: process.env.GITHUB_SHA ?? null, assets: [...files].sort(),
}, null, 2) + '\n');
console.log(`พร้อมเผยแพร่ World 2000 v${VERSION}: ${files.size} ไฟล์`);
