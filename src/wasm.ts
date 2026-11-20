/** Opt-in Rust backend. Importing this entry never instantiates or fetches WASM. */
import init, { StageParser } from '../wasm/latexmath.js';
import { decodeLatexmathModelDocument } from './generated/json/codecs.js';
import type { LatexmathModelDocument } from './generated/models.js';
import { WASM_ASSET } from './wasm-asset.js';
export { WASM_ASSET };

export interface WasmOptions { decimal?: '.' | ',' | '٫' }
export class RustWasmError extends Error { override name = 'RustWasmError'; }
function decimal(input: string, options: WasmOptions): string {
  if (typeof input !== 'string') throw new TypeError('input must be a string');
  // wasm-bindgen would replace unpaired surrogates during UTF-8 encoding.
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(input))
    throw new TypeError('input must contain valid Unicode');
  for (const key of Object.keys(options)) if (key !== 'decimal') throw new RangeError(`unknown WASM parse option ${key}`);
  const value = options.decimal ?? '.';
  if (!['.', ',', '٫'].includes(value)) throw new RangeError('unsupported decimal marker');
  return value;
}

/** Owns one Rust parser; dispose it with free() when finished. No TS fallback. */
export class RustWasmParser {
  #native: StageParser | undefined;
  /** @internal Use createWasmParser after verifying the pinned bytes. */
  constructor(native: StageParser) { this.#native = native; }
  #ready(): StageParser {
    if (!this.#native) throw new RustWasmError('WASM parser has been freed');
    return this.#native;
  }
  #call(operation: (parser: StageParser) => string): string {
    try { return operation(this.#ready()); }
    catch (error) {
      if (error instanceof RustWasmError) throw error;
      throw new RustWasmError(String(error), { cause: error });
    }
  }
  /** Native portable model JSON bytes, without rewriting or sorting fields. */
  parseJson(input: string, options: WasmOptions = {}): string {
    const marker = decimal(input, options);
    return this.#call(parser => parser.parse(input, marker));
  }
  /** Same generated Document class as the default TS entry. */
  parse(input: string, options: WasmOptions = {}): LatexmathModelDocument {
    return decodeLatexmathModelDocument(JSON.parse(this.parseJson(input, options)));
  }
  /** Native tagged raw-tree envelope, distinct from the legacy TS parseTree wire. */
  parseRaw(input: string, options: WasmOptions = {}): unknown {
    const marker = decimal(input, options);
    return JSON.parse(this.#call(parser => parser.parseRaw(input, marker)));
  }
  /** Validate and serialize a portable model with the Rust generated writer. */
  serialize(json: string): string {
    if (typeof json !== 'string') throw new TypeError('model JSON must be a string');
    return this.#call(parser => parser.serialize(json));
  }
  /** Idempotent; use after disposal fails explicitly. */
  free(): void { this.#native?.free(); this.#native = undefined; }
}

let initializing: Promise<unknown> | undefined;
/** Explicit initialization for browsers and Node: callers supply the pinned asset bytes. */
export async function createWasmParser(source: Uint8Array | ArrayBuffer): Promise<RustWasmParser> {
  if (!(source instanceof Uint8Array) && !(source instanceof ArrayBuffer)) throw new TypeError('pass WASM bytes');
  const bytes = source instanceof Uint8Array ? new Uint8Array(source) : new Uint8Array(source.slice(0));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  const sha = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (sha !== WASM_ASSET.sha256 || bytes.length !== WASM_ASSET.bytes) throw new RustWasmError('WASM checksum mismatch');
  if (!initializing) {
    initializing = init({ module_or_path: bytes }).catch(error => { initializing = undefined; throw error; });
  }
  await initializing;
  return new RustWasmParser(new StageParser());
}
