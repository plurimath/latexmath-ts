/* tslint:disable */
/* eslint-disable */

/**
 * A reusable parser using the crate's verified PARG artifacts and Rust bindings.
 */
export class StageParser {
    free(): void;
    [Symbol.dispose](): void;
    constructor();
    /**
     * Return preprocessed text and the canonical tagged raw tree as JSON.
     */
    parseRaw(input: string, decimal: string): string;
    /**
     * Parse to the generated model's portable JSON, using native strict policy.
     */
    parse(input: string, decimal: string): string;
    /**
     * Decode, validate and write portable model JSON through the generated codecs.
     * The existing writer may omit empty members; this is not a source-text writer.
     */
    serialize(json: string): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_stageparser_free: (a: number, b: number) => void;
    readonly stageparser_new: () => [number, number, number];
    readonly stageparser_parse: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly stageparser_parseRaw: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly stageparser_serialize: (a: number, b: number, c: number) => [number, number, number, number];
    readonly parsanol_c_last_error: () => number;
    readonly parsanol_c_parse: (a: bigint, b: number, c: number, d: number) => number;
    readonly parsanol_c_parse_len: (a: bigint, b: number, c: number, d: number, e: number) => number;
    readonly parsanol_c_register: (a: number) => bigint;
    readonly parsanol_c_release: (a: bigint) => void;
    readonly parsanol_grammar_atom_count: (a: number) => number;
    readonly parsanol_grammar_free: (a: number) => void;
    readonly parsanol_grammar_new: (a: number) => number;
    readonly parsanol_grammar_new_with_error: (a: number, b: number) => number;
    readonly parsanol_grammar_root: (a: number) => number;
    readonly parsanol_parg_error: (a: number, b: number) => number;
    readonly parsanol_parg_export: (a: number, b: number, c: number) => number;
    readonly parsanol_parg_free: (a: number) => void;
    readonly parsanol_parg_generate: (a: number, b: number, c: number) => number;
    readonly parsanol_parg_parse: (a: number, b: number) => number;
    readonly parsanol_parg_parse_recovering: (a: number, b: number, c: number) => number;
    readonly parsanol_parg_parse_with_compatibility: (a: number, b: number, c: number, d: number) => number;
    readonly parsanol_parg_parse_with_reporter: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly parsanol_parse: (a: number, b: number, c: number) => number;
    readonly parsanol_parse_end_pos: (a: number, b: number) => number;
    readonly parsanol_parse_simple: (a: number, b: number) => number;
    readonly parsanol_result_ast_json: (a: number) => number;
    readonly parsanol_result_end_pos: (a: number) => number;
    readonly parsanol_result_error: (a: number) => number;
    readonly parsanol_result_free: (a: number) => void;
    readonly parsanol_result_success: (a: number) => number;
    readonly parsanol_version: () => number;
    readonly parsanol_string_free: (a: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
