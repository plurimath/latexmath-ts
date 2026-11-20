# Optional Rust WASM backend

The default package and browser entries keep their existing PARG/TypeScript path.
Use the separate `@plurimath/latexmath-ts/wasm` entry to run the `latexmath-rs` parser
and generated model writer in WebAssembly. It never calls the TypeScript parser
or falls back after a refusal. The browser-safe entry does no implicit fetch or
filesystem access. Both entries return the same generated Document class.

```js
import { readFile } from 'node:fs/promises';
import { createWasmParser } from '@plurimath/latexmath-ts/wasm';
const bytes = await readFile(new URL(import.meta.resolve('@plurimath/latexmath-ts/wasm/latexmath_bg.wasm')));
const parser = await createWasmParser(bytes);
try {
  console.log(parser.parse('x', { decimal: '.' }));
  console.log(parser.parseJson('x')); // native portable model bytes
} finally { parser.free(); }
```

In a browser, fetch the exported `.wasm` asset with your bundler's asset URL
and pass `new Uint8Array(await response.arrayBuffer())` to `createWasmParser`.
SHA-256 and byte size are checked before initialization, including later calls.
Each call creates an independent parser; `free()` is idempotent and parsing
after disposal fails. Only the `decimal` option is supported (`.`, `,`, `٫`).
Native failures raise `RustWasmError` and carry the original cause; this entry
makes no claim to match the default parser's detailed error offsets.
`parseRaw` returns Rust's tagged raw-tree envelope, rather than the legacy
`parseTree` representation. `serialize` is a generated model writer, not a
source-text formatter. `parseJson` preserves its original byte order.

`wasm/manifest.json` pins the Rust revision, build provenance and SHA-256 for
the unmodified web glue, declarations, binary and license. The current asset
is built from merged Rust main with the recorded local toolchain and command;
no CI artifact identity is claimed. Run `npm run check:wasm` to verify those
files. To update, download
`stage-wasm-node-web` from a successful pinned Rust WASM run, copy `wasm-web`
files, and update the manifest and `src/wasm-asset.ts` hashes together.
The dedicated CI workflow checks the packaged entry and runs a differential
model gate against every typed-model row at `scripts/corpus-pin.json`. Model values
are compared through the generated TS encoder, without dropping fields;
array order is retained. Object key ordering is not a cross-runtime byte
contract. Refusals must occur in both paths. Full replay belongs in GHA;
`--limit N` is a focused local probe and is labelled incomplete.
