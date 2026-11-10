// Vendored contract from lutaml/lutaml-ts@1242c7b6314dcadc42e3453e85c9f2fc879cd7ef (BSD-2-Clause).
/**
 * Typed contract for LML v2 documents and bundles, mirroring the agreed
 * interface in lutaml/lutaml-model#1033 (01-DOCUMENT-CONTRACT).
 * Types only: nothing here evaluates schema-provided code.
 */

export const LML_DOCUMENT_VERSION = 2 as const;
export const LML_BUNDLE_VERSION = 1 as const;
export const MANIFEST_VERSION = 1 as const;
export const REPLAY_CORPUS_VERSION = 1 as const;

/** Model ID: `<qualified model name>@<register>`. */
export type ModelId = string;
export type ValueTypeId = string;

export type SchemaFormat = "json" | "yaml";
export type TargetName = "ruby" | "ts" | "rust" | "wasm";
export type Capability = "xml" | "json" | "yaml" | (string & {});

export type BuiltinTypeName = string;

export type TypeRef =
  | { readonly kind: "builtin"; readonly name: BuiltinTypeName }
  | { readonly kind: "model"; readonly id: ModelId }
  | { readonly kind: "value"; readonly id: ValueTypeId };

/** Neutral JSON-like value tree used for defaults and facets. */
export type NeutralValue =
  | null
  | boolean
  | number
  | string
  | readonly NeutralValue[]
  | { readonly [key: string]: NeutralValue };

export type DefaultSpec =
  | { readonly present: false }
  | { readonly present: true; readonly value: NeutralValue };

export interface CollectionSpec {
  readonly min: number;
  /** null means unbounded. */
  readonly max: number | null;
  readonly class?: string;
}

export interface Discriminator {
  readonly attribute: string;
  /** wire value -> model ID */
  readonly cases: { readonly [wireValue: string]: ModelId };
}

export interface AttributeSpec {
  readonly name: string;
  readonly type: TypeRef;
  readonly required: boolean;
  /** false means scalar. */
  readonly collection: false | CollectionSpec;
  readonly default: DefaultSpec;
  readonly initialize_empty: boolean;
  readonly discriminator?: Discriminator;
}

export type NamespaceSpec =
  | { readonly mode: "inherit" }
  | { readonly mode: "unqualified" }
  | { readonly mode: "uri"; readonly uri: string; readonly prefix?: string };

export interface RenderPolicy {
  readonly [policy: string]: NeutralValue;
}

export interface XmlRule {
  readonly kind: "attribute" | "element" | "content" | "any_attribute";
  /** Ordered aliases; absent for content rules. */
  readonly name?: readonly string[];
  readonly to: string;
  readonly namespace?: NamespaceSpec;
  readonly prefix?: string;
  readonly cdata?: boolean;
  readonly render?: RenderPolicy;
  readonly discriminator?: Discriminator;
}

export interface KeyValueRule {
  readonly key: readonly string[];
  readonly to: string;
  readonly render?: RenderPolicy;
}

export interface XmlMapping {
  readonly root: { readonly element: string } | null;
  readonly namespace?: NamespaceSpec;
  readonly rules: readonly XmlRule[];
}

export interface KeyValueMapping {
  readonly rules: readonly KeyValueRule[];
  readonly root_mappings?: NeutralValue;
  readonly child_mappings?: NeutralValue;
}

export interface Mappings {
  readonly xml?: XmlMapping;
  readonly json?: KeyValueMapping;
  readonly yaml?: KeyValueMapping;
}

export interface OrderedContentSpec {
  readonly member: "__lml_content";
  readonly version: 1;
}

export type OrderedContentToken =
  | { readonly kind: "element"; readonly attribute: string; readonly index: number }
  | {
      readonly kind: "text" | "cdata";
      readonly attribute: string;
      readonly index: number;
    }
  | { readonly kind: "text" | "cdata"; readonly literal: string };

export interface ModelDocument {
  readonly lml: typeof LML_DOCUMENT_VERSION;
  readonly model: string;
  readonly register: string;
  readonly attributes: readonly AttributeSpec[];
  readonly mappings: Mappings;
  readonly ordered_content?: OrderedContentSpec;
}

export interface ValueTypeSpec {
  readonly base: BuiltinTypeName;
  readonly facets: { readonly [facet: string]: NeutralValue };
}

export interface Bundle {
  readonly lml_bundle: typeof LML_BUNDLE_VERSION;
  readonly roots: readonly ModelId[];
  readonly models: { readonly [id: ModelId]: ModelDocument };
  readonly value_types: { readonly [id: ValueTypeId]: ValueTypeSpec };
  readonly capabilities: readonly Capability[];
  readonly provenance?: { readonly source_revision: string };
}

/** `sha256:<lowercase-hex>` */
export type Checksum = `sha256:${string}`;

export type ErrorCode =
  | "unsupported_version"
  | "invalid_document"
  | "duplicate_id"
  | "dangling_reference"
  | "unknown_type"
  | "unsupported_type"
  | "missing_type_binding"
  | "unsupported_format"
  | "unsupported_mapping"
  | "non_serializable_default"
  | "lambda_default"
  | "custom_initialize"
  | "imperative_element_order"
  | "invalid_ordered_content"
  | "reserved_member"
  | "nonterminating_rational"
  | "unknown_discriminator"
  | "round_trip_mismatch"
  | "checksum_mismatch"
  | "capability_missing"
  | "not_serializable";

export const ERROR_CODES: readonly ErrorCode[] = [
  "unsupported_version",
  "invalid_document",
  "duplicate_id",
  "dangling_reference",
  "unknown_type",
  "unsupported_type",
  "missing_type_binding",
  "unsupported_format",
  "unsupported_mapping",
  "non_serializable_default",
  "lambda_default",
  "custom_initialize",
  "imperative_element_order",
  "invalid_ordered_content",
  "reserved_member",
  "nonterminating_rational",
  "unknown_discriminator",
  "round_trip_mismatch",
  "checksum_mismatch",
  "capability_missing",
  "not_serializable",
];

export interface ErrorDetail {
  readonly reason: ErrorCode;
  readonly model_id?: ModelId;
  readonly attribute?: string;
  readonly format?: string;
  readonly rule?: string;
  /** JSON pointer into the offending document. */
  readonly location?: string;
  readonly detail?: string;
}

export class LmlError extends Error {
  readonly info: ErrorDetail;
  constructor(info: ErrorDetail) {
    super(`${info.reason}${info.detail ? `: ${info.detail}` : ""}`);
    this.name = "LmlError";
    this.info = info;
  }
}

/** Path (relative, no traversal) -> UTF-8 source text. */
export type SourceMap = ReadonlyMap<string, string>;

/**
 * Trusted per-target bindings supplied separately from a document, by ID.
 * Never executed from a document.
 */
export interface TypeBinding {
  /** Module specifier the generated code imports from. */
  readonly module: string;
  /** Exported TypeScript name. */
  readonly export: string;
}

export interface Bindings {
  readonly types: { readonly [valueTypeId: string]: TypeBinding };
  readonly classes?: { readonly [className: string]: TypeBinding };
}

/** loadBundle(bytes, format): implemented by 06b. */
export type LoadBundle = (
  bytes: Uint8Array,
  format: SchemaFormat,
) => Bundle;

/** generateModels(bundle, bindings): implemented by 06c. */
export type GenerateModels = (bundle: Bundle, bindings: Bindings) => SourceMap;

/** generateJsonCodecs(bundle, bindings): implemented by 06e. */
export type GenerateJsonCodecs = (
  bundle: Bundle,
  bindings: Bindings,
) => SourceMap;

/** Fixed plugin interface for model-specific XML/JSON extension emitters. */
export interface Emitter {
  readonly name: string;
  emit(bundle: Bundle, bindings: Bindings): SourceMap;
}

/** Runtime codec for a generated model class. */
export interface Codec<T> {
  readonly modelId: ModelId;
  decode(input: unknown): T;
  encode(value: T): unknown;
}

/** First-class missing-versus-null state for TS values. */
export const ABSENT: unique symbol = Symbol("lutaml.absent");
export type Absent = typeof ABSENT;
export type Maybe<T> = T | null | Absent;

export interface Manifest {
  readonly manifest: typeof MANIFEST_VERSION;
  readonly lml_checksum: Checksum;
  readonly schema_version: typeof LML_DOCUMENT_VERSION;
  readonly generator_version: string;
  readonly target: TargetName;
  readonly capabilities: readonly Capability[];
  readonly corpora: readonly { readonly generation: string; readonly sha256: string }[];
  readonly files: readonly { readonly path: string; readonly sha256: string }[];
  readonly dependencies: readonly {
    readonly name: string;
    readonly revision: string;
    readonly sha256: string;
  }[];
}

export type ReplayComparison = "data" | "xml_tree" | "bytes";

export interface ReplayCase {
  readonly id: string;
  readonly model_id: ModelId;
  readonly lml_checksum: Checksum;
  readonly format: string;
  readonly input: string;
  readonly expected_data?: NeutralValue;
  readonly expected_output?: string;
  readonly comparison: ReplayComparison;
  readonly expected_error?: ErrorCode;
}

export interface ReplayIndex {
  readonly corpus: typeof REPLAY_CORPUS_VERSION;
  readonly generation: string;
  readonly source_revision: string;
  readonly cases: readonly ReplayCase[];
}
