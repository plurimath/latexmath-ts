import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
import { createWasmParser } from '../dist/wasm.js';
import { initialize, modelJson } from '../dist/index.js';
const { values, positionals } = parseArgs({ allowPositionals: true, options: { limit: { type: 'string' } } });
assert.equal(positionals.length, 1, 'pass the pinned testsuite checkout');
const limit = values.limit === undefined ? Infinity : Number(values.limit);
assert.ok(limit > 0 && (limit === Infinity || Number.isSafeInteger(limit)), 'invalid --limit');
const pin = JSON.parse(readFileSync(new URL('./corpus-pin.json', import.meta.url)));
const generation = resolve(positionals[0], pin.path);
const sha = value => createHash('sha256').update(value).digest('hex');
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    assert.ok(entry.isFile(), 'unexpected generation entry');
    return [relative(generation, path).split('\\').join('/')];
  });
}
const paths = files(generation).sort((a,b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
assert.equal('sha256:' + sha(paths.map(path => `${sha(readFileSync(resolve(generation, path)))}  ${path}\n`).join('')), pin.snapshot_digest);
const provenanceBytes = readFileSync(resolve(generation, 'provenance.yaml'));
assert.equal(sha(provenanceBytes), pin.provenance_sha256);
const provenance = parse(provenanceBytes.toString());
assert.equal(provenance.language, pin.language);
assert.equal(Number(provenance.generation), pin.generation);
assert.deepEqual(provenance.payloads.map(p => p.path).concat('provenance.yaml').sort(), paths.slice().sort());
const ts = await initialize();
const wasm = await createWasmParser(new Uint8Array(readFileSync(new URL('../wasm/latexmath_bg.wasm', import.meta.url))));
const ids = [], failures = [];
let accepted = 0, refused = 0;
try {
  for (const payload of provenance.payloads) {
    const path = resolve(generation, payload.path);
    const rel = relative(generation, path);
    assert.ok(!rel.startsWith('..') && !isAbsolute(rel));
    const bytes = readFileSync(path);
    assert.equal(bytes.length, payload.bytes);
    assert.equal(sha(bytes), payload.sha256);
    if (!payload.path.split('/').pop().startsWith('model-')) continue;
    const document = parse(bytes.toString(), { maxAliasCount: -1 });
    assert.equal(document.boundary, 'typed-model');
    for (const row of document.cases) {
      if (ids.length >= limit) break;
      ids.push(row.id);
      try {
        let native, portable, nativeError, tsError;
        try { native = JSON.parse(wasm.parseJson(row.input.str, row.options)); } catch (e) { nativeError = e; }
        try { portable = modelJson.encodeLatexmathModelDocument(ts.parse(row.input.str, row.options)); } catch (e) { tsError = e; }
        if (row.expected.refusal) {
          assert.ok(nativeError && tsError, 'both backends must refuse the recorded rejection');
          refused++;
        } else {
          if (nativeError) throw nativeError;
          if (tsError) throw tsError;
          assert.deepEqual(native, portable, 'Rust/TS portable model differs');
          assert.deepEqual(JSON.parse(wasm.serialize(JSON.stringify(portable))), portable, 'Rust writer differs');
          accepted++;
        }
      } catch (error) { failures.push({ id: row.id, error: String(error).slice(0, 700) }); }
    }
  }
} finally { wasm.free(); }
assert.ok(ids.length > 0, 'empty differential replay');
assert.equal(new Set(ids).size, ids.length, 'duplicate row IDs');
const complete = limit === Infinity;
if (complete) {
  const boundary = pin.boundaries['typed-model'];
  assert.equal(ids.length, boundary.rows, 'executed row count');
  assert.equal(sha(ids.join('\n')), boundary.ids_sha256, 'executed row IDs');
}
console.log(JSON.stringify({ language: pin.language, generation: pin.generation, complete, rows: ids.length, accepted, refused, failures }, null, 2));
assert.equal(failures.length, 0, 'differential replay failed');
