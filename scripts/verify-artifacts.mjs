import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('artifacts/manifest.json', root), 'utf8'));
for (const [path, expected] of Object.entries(manifest.files)) {
  const bytes = await readFile(new URL(path, root));
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`checksum mismatch: ${path}`);
}
console.log(`${Object.keys(manifest.files).length} pinned source artifacts verified at ${manifest.commit}`);
