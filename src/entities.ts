// Copied from pinned Plurimath consumer entity semantics; provenance in model/source-provenance.json.
import { XHTML1_ENTITY_CODEPOINTS } from "./html-entities.js";


/**
 * `HTMLEntities::Decoder`'s own regular expression, transcribed.
 *
 * Ruby's is `/&(?:([a-z][a-z0-9]{1,7})|#([0-9]{1,7})|#x([0-9a-f]{1,6}))(;|(?=\n|<))/i`,
 * where `{1,7}` comes from the shortest and longest key in the flavour's table
 * (2 and 8 for `xhtml1`). Three details are load-bearing and all three were
 * measured against the gem rather than read off it:
 *
 * - the terminator is `;` **or** a lookahead at a newline or `<`, so `"&pi<"`
 *   decodes to `"π<"` and `"&pi"` alone does not decode at all;
 * - the name is matched case-insensitively but looked up **verbatim**, so
 *   `&Pi;` decodes and `&PI;` does not;
 * - the digit counts are capped, so `&#00000960;` (8 digits) stays as written.
 *
 * The name length bounds are dropped here, which cannot change an answer: the
 * alnum run after `&` ends at the first character that could be a terminator,
 * so there is exactly one candidate name at each position, and a name outside
 * Ruby's length range is never a key — both implementations therefore leave
 * the same text, and consume the same span, in every case.
 */
const ENTITY_PATTERN =
  /&(?:([a-zA-Z][a-zA-Z0-9]*)|#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6}))(;|(?=\n|<))/g;


/**
 * `String.fromCodePoint`, with the one case where JavaScript is more permissive
 * than Ruby closed.
 *
 * Ruby's `codepoint.chr(Encoding::UTF_8)` raises `RangeError` twice over, and
 * the gem propagates it out of `==` (run at plurimath-oracle `00c52783`):
 *
 * ```text
 * Symbol.new("&#xD800;")   == itself  => RangeError: invalid codepoint 0xD800 in UTF-8
 * Symbol.new("&#1234567;") == itself  => RangeError: 1234567 out of char range
 * ```
 *
 * `String.fromCodePoint` raises `RangeError` for the second — the gem's oracle
 * behaviour, reached natively — but **not** for the first: measured, it returns
 * the lone surrogate `"\ud800"` instead of raising. Ruby has no lone-surrogate
 * string, so parity there needs the explicit throw below. It is still
 * JavaScript's own `RangeError`, not a `PlurimathError`: the package error
 * codes describe package operations, and this is the language's failure.
 *
 * Nothing else in the decoder can be undecodable. The pattern caps a decimal
 * reference at 7 digits and a hex one at 6, so the widest values it can offer
 * are 9,999,999 and 0xFFFFFF — both above U+10FFFF, both raising in the gem
 * too (measured), and a named entity resolves through the gem's own table.
 */
function codepointToString(code: number): string {
  if (code >= 0xd800 && code <= 0xdfff) {
    // Ruby: `RangeError: invalid codepoint 0xD800 in UTF-8`.
    throw new RangeError(`invalid codepoint 0x${code.toString(16).toUpperCase()} in UTF-8`);
  }
  return String.fromCodePoint(code);
}


/**
 * A character reference `codepointToString` refuses, carrying WHERE it was.
 *
 * A `RangeError` subclass, deliberately: the decoder's failure is the
 * language's, not a package operation (see `codepointToString` above), and
 * several call sites already branch on `error instanceof RangeError` — the
 * OMML renderer's own decode guard (`decodeEntities` in `omml/render-shared.ts`) and the
 * stack-depth branding at the AsciiMath, LaTeX, HTML and UnicodeMath renderer
 * entries. Subclassing keeps every one of them matching.
 *
 * `index` exists because the gem has nothing to copy here. Measured at oracle
 * `00c52783`: `Plurimath::Math.parse("x+&#x110000;", :latex)` raises
 * `Math::ParseError` whose instance variables are exactly `@text` and `@type`
 * (`errors/parse_error.rb:6-10`) — no position at all. `ParseError.index` is
 * this package's own contract (ARCHITECTURE.md §5, "UTF-16 code-unit offset
 * into the ORIGINAL input"), so a caller turning this into a `ParseError` needs
 * a real offset; 0 would be a position the port invented.
 */
export class UndecodableEntityError extends RangeError {
  constructor(
    message: string,
    /** UTF-16 offset of the `&`, in the string handed to the decoder. */
    readonly index: number,
  ) {
    super(message);
    this.name = "UndecodableEntityError";
  }
}


/** One entity `htmlEntityToUnicode` rewrites, and the span it occupies. */
export interface HtmlEntitySpan {
  /** Offset of the `&`, in UTF-16 code units. */
  readonly start: number;
  /** How many code units the match consumed — the `(?=\n|<)` arm consumes none. */
  readonly length: number;
  /** What the match decodes to. */
  readonly text: string;
}


/**
 * Every entity `htmlEntityToUnicode` would rewrite, with its position.
 *
 * The LaTeX preprocessor (`formats/latex/preprocess.ts`) needs the same decode
 * the equality projection needs, but has to carry offsets through it:
 * `Latex::Parser#pre_processing` decodes and re-encodes before Parslet ever
 * runs, so a parse-failure index has to be mapped back to the caller's input
 * (ARCHITECTURE.md §5). Exposing the spans rather than letting that module
 * carry a second copy of `ENTITY_PATTERN` keeps ONE decoder: `decodeEntities`
 * below is built on this, so the two cannot drift.
 *
 * A match the table does not know (`&nosuchentity;`) is not returned at all —
 * the gem leaves it as written, and a caller that rebuilds the string from
 * these spans reproduces that by copying the untouched text.
 *
 * Exported from this internal module rather than the core barrel, like
 * `htmlEntityToUnicode` above: port vocabulary, not public API.
 */
export function htmlEntitySpans(text: string): readonly HtmlEntitySpan[] {
  // `return string unless string&.include?("&")` — the gem's own fast path.
  if (!text.includes("&")) return [];
  const spans: HtmlEntitySpan[] = [];
  // A fresh regex per call: `ENTITY_PATTERN` is global, so `lastIndex` is
  // shared state and a reentrant caller would resume mid-string.
  const pattern = new RegExp(ENTITY_PATTERN.source, ENTITY_PATTERN.flags);
  for (const match of text.matchAll(pattern)) {
    let decoded: string;
    try {
      decoded = decodeEntityMatch(match[0], match[1], match[2], match[3]);
    } catch (error) {
      // `codepointToString` knows the code point and nothing else; this loop is
      // the only place that knows where the reference started. Rethrow with
      // that offset so a caller reporting a position has one to report.
      if (!(error instanceof RangeError)) throw error;
      throw new UndecodableEntityError(error.message, match.index);
    }
    if (decoded === match[0]) continue;
    spans.push({ start: match.index, length: match[0].length, text: decoded });
  }
  return spans;
}


function decodeEntityMatch(match: string, named?: string, decimal?: string, hex?: string): string {
  if (named !== undefined) {
    const codepoint = XHTML1_ENTITY_CODEPOINTS.get(named);
    return codepoint === undefined ? match : codepointToString(codepoint);
  }
  const digits = decimal ?? hex;
  if (digits === undefined) return match;
  const code = Number.parseInt(digits, decimal === undefined ? 16 : 10);
  // Raises for a codepoint the gem cannot encode, exactly where the gem
  // raises. The equality projection is the gem's, including its failures.
  return codepointToString(code);
}