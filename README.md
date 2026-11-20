# latexmath-ts

Shared PARG/WASM parser with generated LutaML models and JSON codecs.

```js
import {initialize} from '@plurimath/latexmath-ts';
const parser = await initialize();
const model = parser.parse('x^2');
```

`parseTree` supplies the legacy capture boundary; `parsePreparedTree` accepts
already-preprocessed input for consumers. Decimal markers are per call.
The browser entry accepts an initialized compatible runtime factory.
Ruby-interpreter fallback is unavailable in WASM.

Build with `npm install`, run focused checks with `npm test`, and verify source
artifacts with `npm run check:artifacts`. Model and generator source pins are in
`model/`. These are candidate APIs; full cross-runtime/platform acceptance and
publication remain separate gates.

The CI corpus replay checks the pinned generation against the testsuite's
append-only ledger, then verifies the snapshot, provenance, payload checksums
and executed row IDs. Typed-model rows compare the generated model with the
Ruby tagged model wire, preserving declared field and child order. Focused
`test/model-wire.test.mjs` examples record their source revision, payload hashes
and unchanged Ruby rows in `test/fixtures/model-wire.json`; the full corpus
runs in CI. `test/corpus-pin.test.mjs` checks ledger drift and duplicate entries.
