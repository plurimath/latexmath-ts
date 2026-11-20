import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWasmParser, WASM_ASSET } from '@plurimath/latexmath-ts/wasm';
const path = new URL(import.meta.resolve('@plurimath/latexmath-ts/wasm/latexmath_bg.wasm'));
const bytes = await readFile(path);
const parser = await createWasmParser(bytes);
try { assert.equal(parser.parse('x').decimal, '.'); assert.ok(parser.parseRaw('x')); }
finally { parser.free(); }
assert.equal(bytes.length, WASM_ASSET.bytes);
console.log('packed Rust WASM entry and asset passed');
