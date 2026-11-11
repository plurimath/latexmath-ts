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
