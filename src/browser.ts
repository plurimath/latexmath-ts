import { legacyTree, type Tree, type Wrappers } from './tree.js';
import { DIGESTS } from './pins.js';
import { CATALOG } from './catalog.js';
import { decodeLatexmathModelDocument } from './generated/json/codecs.js';
import type { LatexmathModelDocument } from './generated/models.js';
export * as Model from './generated/index.js';
export * as modelJson from './generated/json/index.js';
export { SOURCE_COMMIT } from './pins.js';

export type Decimal = '.' | ',' | '٫';
export interface Options { decimal?: Decimal; engine?: 'auto' | 'wasm' | 'native' | 'ruby' }
export interface Runtime {
  parseShape(input: string): unknown;
  applyBindingsArtifact(bindings: string, shape: unknown): Record<string, unknown>;
  parseShapeRecovering?(input: string): { ok: boolean; error?: { offset?: number; message?: string } };
}
export type RuntimeFactory = (artifact: string, entry: string) => Runtime | Promise<Runtime>;
export interface ArtifactBundle { artifact: string; bindings: string; wrappers: string }
export class ArtifactError extends Error { override name = 'ArtifactError'; }
export class EngineUnavailable extends Error { override name = 'EngineUnavailable'; }
export class NotInitializedError extends Error { override name = 'NotInitializedError'; }
export class ParseError extends Error {
  override name = 'ParseError';
  readonly category: string | null = null;
  readonly charOffset: number | null;
  constructor(message: string, readonly input: string, readonly byteOffset: number | null) {
    super(message);
    this.charOffset = byteOffset === null ? null : [...new TextDecoder('utf-8', { ignoreBOM: true }).decode(new TextEncoder().encode(input).subarray(0, byteOffset))].length;
  }
}
export class NestingTooDeep extends ParseError { override name = 'NestingTooDeep'; }

const entries = { '.': 'dot', ',': 'comma', '٫': 'arabic' } as const;
/** Initialized, synchronous WASM parser. No preprocessing or alternate parser. */

import { preprocess } from './preprocess.js';
import { SourceMap } from './source-map.js';
export class Parser {
  readonly capabilities = Object.freeze({ engine: 'wasm', rubyFallback: false });
  constructor(private readonly runtimes: ReadonlyMap<Decimal, Runtime>, private readonly bindings: string, private readonly wrappers: Wrappers) {}
  private run(input: string, options: Options = {}, prepared = false) {
    if (typeof input !== 'string') throw new TypeError('input must be a string');
    const encoder = new TextEncoder();
    if (new TextDecoder('utf-8', { ignoreBOM: true }).decode(encoder.encode(input)) !== input) throw new TypeError('input must contain valid Unicode scalar values');
    const decimal = options.decimal ?? '.';
    if (!Object.hasOwn(entries, decimal)) throw new RangeError('unsupported decimal marker');
    for (const key of Object.keys(options)) if (!['decimal', 'engine'].includes(key)) throw new RangeError(`unknown parse option ${key}`);
    if (options.engine === 'ruby') throw new EngineUnavailable('Ruby interpreter fallback is unavailable in WASM');
    if (options.engine !== undefined && !['auto','native','wasm'].includes(options.engine)) throw new RangeError('unknown engine');
    const processed = prepared ? {text:input,map:SourceMap.identity(input.length)} : preprocess(input);
    const empty = false;
    const text = prepared ? input : processed.text;
    const label = 'label' in processed ? processed.label : undefined;
    const map = prepared ? SourceMap.identity(input.length) : processed.map;
    if (!prepared && empty) return { input, text, label, decimal, shape: null, bound: {} as Record<string,unknown> };
    const runtime = this.runtimes.get(decimal)!;
    let shape: unknown;
    try { shape = runtime.parseShape(text); }
    catch (error) {
      if (typeof WebAssembly !== "undefined" && error instanceof WebAssembly.RuntimeError) throw error;
      if (error instanceof Error && ['CallDepthLimitExceeded', 'RecursionLimitExceeded', 'ShapeDepthLimitExceeded'].includes(error.name)) throw error;
      // Expected-token lists may include names such as substack or stackrel.
      // Only explicit resource failures identify an actual depth refusal.
      if ((error instanceof Error && error.name === 'NestingTooDeep') ||
          (error instanceof RangeError && /maximum call stack size exceeded/i.test(error.message)) ||
          (/^(?:NestingTooDeep:|recursion limit exceeded\b|maximum nesting depth exceeded\b|maximum call stack size exceeded\b|too much recursion\b|call stack exhausted\b|stack overflow\b|stack limit exceeded\b)/i.test(error instanceof Error ? error.message : String(error)))) {
        throw new NestingTooDeep(String(error), input, null);
      }
      let offset: number|null = null;
      try {
        const failure = runtime.parseShapeRecovering?.(text);
        if (failure && !failure.ok && Number.isInteger(failure.error?.offset)) {
          const units = new TextDecoder().decode(encoder.encode(text).subarray(0, failure.error!.offset!)).length;
          offset = encoder.encode(input.slice(0,map.toOriginal(units))).length;
        }
      } catch { /* Preserve the primary refusal if diagnostic recovery fails. */ }
      throw new ParseError(String(error), input, offset);
    }
    return { input, text, label, decimal, shape, bound: runtime.applyBindingsArtifact(this.bindings, shape) };
  }
  parseShape(input: string, options: Options = {}): unknown { return this.run(input, options).shape; }
  parseBindings(input: string, options: Options = {}) { const state=this.run(input,options); return { expression: state.bound.model ?? null, decimal: state.decimal }; }
  parseTree(input: string, options: Options = {}): Tree { return this.capture(this.run(input,options)); }
  parsePreparedTree(input: string, options: Options = {}): Tree { return this.capture(this.run(input,options,true)); }
  private capture(state: ReturnType<Parser['run']>): Tree {
    if (state.shape === null) return null;
    return legacyTree(state.bound.latex_tree, state.text, this.wrappers);
  }
  parse(input: string, options: Options = {}): LatexmathModelDocument {
    const document = this.parseBindings(input,options);
    const pending: unknown[]=[document];
    while(pending.length) {
      const value=pending.pop(); if(Array.isArray(value)){pending.push(...value);continue;}
      if(value===null || typeof value!=='object')continue;
      const object=value as Record<string,unknown>;
      if(typeof object.spelling==='string') {
        const spelling=object.spelling.replace(/^[\x00\t\n\v\f\r ]+|[\x00\t\n\v\f\r ]+$/g,'');
        const record=CATALOG[spelling]; object.value=record?.value ?? spelling; object.kind=record?.kind ?? 'symbol';
      }
      pending.push(...Object.values(object));
    }
    return decodeLatexmathModelDocument(document);
  }
}
function decodeReferences(text:string):string { return text.replace(/&#(?:x([0-9a-fA-F]{1,6})|([0-9]{1,7}));/g,(_,hex:string|undefined,decimal:string|undefined)=>String.fromCodePoint(Number.parseInt(hex ?? decimal!,hex===undefined?10:16))); }
/** Browser callers provide the initialized upstream WASM factory explicitly. */
export async function createParser(bundle: ArtifactBundle, factory: RuntimeFactory): Promise<Parser> {
  let wrappers: Wrappers;
  try {
    for (const key of Object.keys(DIGESTS) as (keyof ArtifactBundle)[]) {
      const bytes = new TextEncoder().encode(bundle[key]);
      const actual = [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
      if (actual !== DIGESTS[key]) throw new Error(`${key} differs from the pinned latexmath source`);
    }
    const artifact = JSON.parse(bundle.artifact) as Record<string, unknown>;
    const bindings = JSON.parse(bundle.bindings) as Record<string, unknown>;
    if (bindings.target !== 'ts' || bindings.artifact_kind !== 'parg-bindings') throw new Error('expected TS bindings');
    if (artifact.source_hash !== bindings.grammar_source_hash) throw new Error('grammar/bindings source hash mismatch');
    wrappers = JSON.parse(bundle.wrappers).wrappers as Wrappers;
    if (!wrappers || typeof wrappers !== 'object') throw new Error('missing wrapper declarations');
  } catch (error) { throw new ArtifactError(`invalid artifact bundle: ${String(error)}`); }
  const runtimes = new Map<Decimal, Runtime>();
  for (const decimal of Object.keys(entries) as Decimal[]) runtimes.set(decimal, await factory(bundle.artifact, entries[decimal]));
  return new Parser(runtimes, bundle.bindings, Object.freeze({ ...wrappers }));
}
export type { Tree, Slice } from './tree.js';
