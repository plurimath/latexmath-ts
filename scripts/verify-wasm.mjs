import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../wasm/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root)));
assert.match(manifest.revision, /^[0-9a-f]{40}$/);
assert.ok(Object.keys(manifest.files).length >= 5);
for (const [name, sha] of Object.entries(manifest.files)) {
  assert.ok(!name.includes('/') && !name.includes('..'));
  assert.equal(createHash('sha256').update(readFileSync(new URL(name, root))).digest('hex'), sha, name);
}
console.log(`Verified Rust WASM asset and glue at ${manifest.repository}@${manifest.revision}`);
