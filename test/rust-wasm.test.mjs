import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { before, test } from 'node:test';
import { initialize, modelJson, Model } from '../dist/index.js';
import { createWasmParser, RustWasmError, WASM_ASSET } from '../dist/wasm.js';
const bytes = new Uint8Array(await readFile(new URL('../wasm/latexmath_bg.wasm', import.meta.url)));
let ts;
before(async () => { ts = await initialize(); });
test('Rust and TS portable models agree on focused accepted inputs', async () => {
  const parser = await createWasmParser(bytes);
  try {
    for (const input of ["x", "1", "", "\\frac{1}{2}", "\\sqrt{x}"]) {
      const document = parser.parse(input);
      assert.ok(document instanceof Model.LatexmathModelDocument);
      const expected = modelJson.encodeLatexmathModelDocument(ts.parse(input));
      assert.deepEqual(JSON.parse(parser.parseJson(input)), expected, input);
      assert.deepEqual(modelJson.encodeLatexmathModelDocument(document), expected);
      assert.deepEqual(JSON.parse(parser.serialize(parser.parseJson(input))), expected);
    }
    for (const marker of ['.', ',', '٫']) assert.equal(parser.parse('x', { decimal: marker }).decimal, marker);
    assert.ok(parser.parseRaw('x'));
  } finally { parser.free(); }
});
test('digest, option, Unicode, model refusals and parser disposal fail explicitly', async () => {
  await assert.rejects(createWasmParser(new Uint8Array([0,1,2])), /checksum/);
  const parser = await createWasmParser(bytes.subarray(0));
  const other = await createWasmParser(bytes.buffer);
  try {
    assert.throws(() => parser.parse('x', { engine: 'ruby' }), /unknown WASM parse option/);
    assert.throws(() => parser.parse('x', { decimal: 'bad' }), /unsupported decimal/);
    assert.throws(() => parser.parse('\ud800'), /valid Unicode/);
    assert.throws(() => parser.parse(null), /must be a string/);
    assert.throws(() => parser.serialize('{'), RustWasmError);
    assert.throws(() => parser.serialize('null'), RustWasmError);
    assert.throws(() => parser.parseRaw(''), RustWasmError);
    assert.equal(parser.parse('x').decimal, '.');
    parser.free(); parser.free();
    assert.throws(() => parser.parse('x'), /freed/);
    assert.equal(other.parse('x').decimal, '.');
    await assert.rejects(createWasmParser(new Uint8Array([0])), /checksum/);
    assert.match(WASM_ASSET.revision, /^[0-9a-f]{40}$/);
  } finally { parser.free(); other.free(); }
});
