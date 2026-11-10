/**
 * LaTeX input preprocessing — `Latex::Parser#pre_processing`
 * (`lib/plurimath/latex/parser.rb:25-40`), ported together with the offset
 * bookkeeping the gem does not need.
 *
 * The gem:
 *
 * ```ruby
 * def pre_processing(text)
 *   text_functions = text.scan(TEXT_REGEX)
 *   text = @enti.encode(@enti.decode(text), :hexadecimal)
 *   text = gsub_space_and_unicodes(text)
 *   text.gsub(TEXT_REGEX) { |_str| text_functions.shift }
 * end
 *
 * def gsub_space_and_unicodes(text)
 *   text
 *     .gsub(/((?<!\\) )|\n+/, "")
 *     .gsub("\\\\ ", "\\\\\\\\")
 *     .gsub("&#x26;", "&")
 *     .gsub("&#x22;", "\"")
 *     .gsub(/(?<!\\\\)\\&#xa;/, "\\ ")
 *     .gsub("&#xa;", "")
 * end
 * ```
 *
 * It runs in `initialize` (`:12`), so `Latex::Parser#text` is already
 * normalised before `parse` is called — which is why the grammar's
 * `decimal_marker` matches an ENTITY-ENCODED marker (`grammar.ts`), and why the
 * corpus records a `preprocessed` field at all.
 *
 * ## What it does, in one line
 *
 * Decode every entity to its character, re-encode everything outside printable
 * ASCII (plus `<>'"&`) to a HEX entity, drop unescaped spaces, then undo five
 * specific encodings. Net effect: named and decimal entities are normalised to
 * hex, `&amp;`/`&quot;` come back as bare characters, newlines vanish, and
 * `\text{...}`/`\mbox{...}` bodies are exempted from all of it.
 *
 * ## The three Ruby traps this file exists to not fall into
 *
 * 1. **`gsub`'s replacement string processes backslashes.** `.gsub("\\\\ ",
 *    "\\\\\\\\")` is a 2-backslash-plus-space pattern and a FOUR-backslash
 *    replacement string, and Ruby turns each `\\` into one backslash — so the
 *    result is TWO backslashes, not four. A literal transcription into
 *    `String.prototype.replace` emits four and destroys the LaTeX linebreak
 *    token. Every pass here uses a function replacer, which has no such
 *    processing in either language, and the replacement text is written out
 *    directly.
 * 2. **`\` followed by a space is not an escape.** The replacement `"\\ "` at
 *    `parser.rb:38` is backslash-space and survives verbatim — the opposite
 *    direction of the same trap.
 * 3. **Ruby's `[^\u{20}-\u{7E}]` matches CODE POINTS.** An astral character is
 *    one match and encodes to one entity. The encoder here iterates by code
 *    point for the same reason.
 *
 * ## Offsets
 *
 * Almost every pass changes lengths, so an offset into the preprocessed text
 * does not index the caller's input. Every position that reaches a user —
 * `ParseError.index` above all — goes through the returned `SourceMap` first
 * (ARCHITECTURE.md §5, §7). Offsets are UTF-16 code units end to end, matching
 * pegkit's contract; spans are tracked per code unit, so a surrogate pair keeps
 * an exact mapping for both halves.
 */

import { htmlEntitySpans } from "./entities.js";
import { type PreprocessSegment, SourceMap } from "./source-map.js";

/** One match of `TEXT_REGEX`: where it starts and how many code units it spans. */
export interface TextFunctionSpan {
  readonly start: number;
  readonly length: number;
}

/**
 * Every match of `Latex::Parser::TEXT_REGEX` (`latex/parser.rb:8`),
 * `%r(\\(?:mbox|text)\{[^}]+\})`, as a global scan returns them: left to
 * right, non-overlapping, resuming after each match. `[^}]+` is greedy but
 * cannot cross a `}`, so the body is everything up to the first closing brace
 * and must be non-empty: an EMPTY body (`\text{}`) does not match at that
 * opening and is not exempted.
 *
 * Hand-written rather than a regex because a backtracking engine retries
 * `[^}]+` from every `\mbox{` and `\text{` opening, so a run of openings with
 * no `}` after them costs time quadratic in the input. Here the first `}` at or
 * after a body start is found once and reused: body starts only increase, so a
 * `}` found at or beyond the current body start is still the first one, and no
 * `}` at all means no later opening can match either. The whole scan is linear.
 * `test/formats/latex/text-function-scan.spec.ts` checks it against the regex
 * on seeded random input.
 */
export function textFunctionSpans(text: string): TextFunctionSpan[] {
  const spans: TextFunctionSpan[] = [];
  // The first `}` at or after the last lookup; stale once it falls behind `body`.
  let close = -1;
  let at = text.indexOf("\\");
  while (at !== -1) {
    const name = text.slice(at + 1, at + 6);
    if (name === "mbox{" || name === "text{") {
      const body = at + 6;
      if (close < body) close = text.indexOf("}", body);
      // No `}` from here on: no later opening can match either.
      if (close === -1) break;
      if (close > body) {
        spans.push({ start: at, length: close + 1 - at });
        at = text.indexOf("\\", close + 1);
        continue;
      }
    }
    at = text.indexOf("\\", at + 1);
  }
  return spans;
}

/**
 * `HTMLEntities::Encoder`'s two passes for the `xhtml1` flavour with the
 * `:hexadecimal` instruction (`htmlentities-4.4.2/lib/htmlentities/encoder.rb`):
 *
 *   - `replace_basic` over `/[<>'"&]/` — note the apostrophe, which the
 *     `html4` flavour would not encode and the gem's default flavour does;
 *   - `replace_extended` over `/[^\u{20}-\u{7E}]/`.
 *
 * Both replace with `"&#x#{codepoint.to_s(16)};"` — lowercase, unpadded. They
 * are separate passes and in this order, which matters: `replace_basic` turns
 * `&` into `&#x26;`, and every character of that is printable ASCII, so
 * `replace_extended` leaves it alone.
 */
const ENCODE_BASIC = /[<>'"&]/g;
const ENCODE_EXTENDED = /[^ -~]/gu;

function hexEntity(character: string): string {
  const codepoint = character.codePointAt(0);
  if (codepoint === undefined) {
    // Unreachable: a regex match is never the empty string here.
    throw new Error("latex preprocess: empty match while encoding");
  }
  return `&#x${codepoint.toString(16)};`;
}

export interface PreprocessedLatex {
  /** The rewritten text the grammar parses — the corpus's `preprocessed`. */
  readonly text: string;
  /** Translates an offset in `text` back to an offset in the caller's input. */
  readonly map: SourceMap;
}

/**
 * The half-open span of ORIGINAL code units each unit of the working text came
 * from. Two flat arrays rather than an array of pairs: rebuilt once per pass
 * and discarded as soon as the segments are cut.
 */
interface OriginSpans {
  readonly start: number[];
  /** Exclusive. */
  readonly end: number[];
}

interface Working {
  readonly text: string;
  readonly spans: OriginSpans;
}

/** One replacement a pass makes: where it starts, what it eats, what it writes. */
interface Rewrite {
  readonly start: number;
  readonly length: number;
  readonly text: string;
}

/**
 * Apply one pass's rewrites, carrying spans.
 *
 * The rewrites must be non-overlapping and in ascending order — which is what
 * a single left-to-right `gsub` produces, and the only shape Ruby's `gsub`
 * can produce, since it never rescans its own output.
 *
 * Every code unit of a replacement points at the WHOLE span the match covered,
 * so a failure inside a rewritten region reports the start of what was
 * rewritten rather than a position inside a string the caller never wrote.
 */
function applyRewrites(working: Working, rewrites: readonly Rewrite[]): Working {
  if (rewrites.length === 0) return working;
  const { text, spans } = working;
  const pieces: string[] = [];
  const start: number[] = [];
  const end: number[] = [];
  let cursor = 0;

  const copyUnits = (from: number, to: number): void => {
    for (let unit = from; unit < to; unit++) {
      pieces.push(text.slice(unit, unit + 1));
      start.push(spans.start[unit] as number);
      end.push(spans.end[unit] as number);
    }
  };

  for (const rewrite of rewrites) {
    copyUnits(cursor, rewrite.start);
    if (rewrite.length > 0) {
      const spanStart = spans.start[rewrite.start] as number;
      const spanEnd = spans.end[rewrite.start + rewrite.length - 1] as number;
      for (let unit = 0; unit < rewrite.text.length; unit++) {
        pieces.push(rewrite.text.slice(unit, unit + 1));
        start.push(spanStart);
        end.push(spanEnd);
      }
    }
    cursor = rewrite.start + rewrite.length;
  }
  copyUnits(cursor, text.length);
  return { text: pieces.join(""), spans: { start, end } };
}

/** One `gsub(regexp) { ... }`: every non-overlapping match, left to right. */
function regexPass(
  working: Working,
  pattern: RegExp,
  replacement: (match: RegExpExecArray) => string,
): Working {
  const fresh = new RegExp(pattern.source, pattern.flags);
  const rewrites: Rewrite[] = [];
  for (const match of working.text.matchAll(fresh)) {
    // A zero-length match would loop forever in `matchAll` if the pattern were
    // able to produce one; none of the patterns here can, and a zero-length
    // rewrite has no span to attribute, so it is refused rather than skipped.
    if (match[0].length === 0) {
      throw new Error(`latex preprocess: empty match from ${String(pattern)}`);
    }
    rewrites.push({
      start: match.index,
      length: match[0].length,
      text: replacement(match as RegExpExecArray),
    });
  }
  return applyRewrites(working, rewrites);
}

/** One `gsub("literal", "replacement")`: Ruby's String pattern form. */
function literalPass(working: Working, from: string, to: string): Working {
  const rewrites: Rewrite[] = [];
  let cursor = 0;
  for (;;) {
    const found = working.text.indexOf(from, cursor);
    if (found === -1) break;
    rewrites.push({ start: found, length: from.length, text: to });
    cursor = found + from.length;
  }
  return applyRewrites(working, rewrites);
}

function identity(input: string): Working {
  return {
    text: input,
    spans: {
      start: Array.from({ length: input.length }, (_, index) => index),
      end: Array.from({ length: input.length }, (_, index) => index + 1),
    },
  };
}

/**
 * Preprocess LaTeX input as `Latex::Parser#initialize` does, and return the map
 * that takes offsets in the result back to the caller's input.
 *
 * A non-string is rejected here for the reason `asciimath/preprocess.ts` gives:
 * `String(null)` would silently preprocess the text `"null"`, and nil is not a
 * supported input in the gem either.
 */
export function preprocess(input: string): PreprocessedLatex {
  const received: unknown = input;
  if (typeof received !== "string") {
    const kind = received === null ? "null" : typeof received;
    throw new TypeError(`LaTeX input must be a string, received ${kind}`);
  }

  // `text.scan(TEXT_REGEX)` on the RAW input: the bodies are saved before any
  // encoding and restored verbatim afterwards, which is what exempts
  // `\text{...}` from entity normalisation and space stripping.
  const textFunctions = textFunctionSpans(input).map((span) =>
    input.slice(span.start, span.start + span.length),
  );

  let working = identity(input);

  // `@enti.decode(text)` — every entity the gem's own decoder recognises.
  //
  // This is the FIRST pass, over `identity(input)` above, so an
  // `UndecodableEntityError` thrown out of here carries an offset into the
  // CALLER's input already and must not be mapped again. Any pass inserted
  // before this one would have to map it.
  working = applyRewrites(
    working,
    htmlEntitySpans(working.text).map((span) => ({
      start: span.start,
      length: span.length,
      text: span.text,
    })),
  );

  // `@enti.encode(..., :hexadecimal)` — the encoder's two passes, in order.
  working = regexPass(working, ENCODE_BASIC, (match) => hexEntity(match[0]));
  working = regexPass(working, ENCODE_EXTENDED, (match) => hexEntity(match[0]));

  // `gsub_space_and_unicodes`, pass by pass.
  //
  // `\n+` can no longer match anything: the encoder has already turned every
  // newline into `&#xa;`. It is transcribed rather than dropped because that
  // is a fact about the composition, not about this regex, and the last pass
  // below is what actually removes those newlines.
  working = regexPass(working, /((?<!\\) )|\n+/g, () => "");
  // Two backslashes and a space become two backslashes — NOT four. See trap 1.
  working = literalPass(working, "\\\\ ", "\\\\");
  working = literalPass(working, "&#x26;", "&");
  working = literalPass(working, "&#x22;", '"');
  // `\&#xa;` not preceded by two backslashes becomes backslash-space. See trap 2.
  working = regexPass(working, /(?<!\\\\)\\&#xa;/g, () => "\\ ");
  working = literalPass(working, "&#xa;", "");

  // `text.gsub(TEXT_REGEX) { |_str| text_functions.shift }` — restore the saved
  // bodies in order. Ruby's BLOCK form does not process backslashes in the
  // returned string, which is what makes the restore verbatim; a function
  // replacer has the same property.
  //
  // The counts differ whenever a pass above creates or destroys a match, which
  // several of them do. `\text {x}` loses its space and BECOMES a match the raw
  // scan never saw; `\text&#x7b;x&#x7d;` gains its braces from the decode and
  // does the same; `\text{ }` loses its body and stops being one.
  //
  // Ruby does not guard that. `Array#shift` on an exhausted array returns nil,
  // and `String#gsub`'s block form stringifies whatever the block returns —
  // `nil.to_s` is `""` — so a surplus match is DELETED. Measured on the gem at
  // `00c52783`: `"x\\text {y}"` preprocesses to `"x"` and renders as AsciiMath
  // `"x"`, `"\\text&#x7b;x&#x7d;+1"` to `"+1"` and `"+ 1"`, and `"\\text {x}"`
  // to `""`, which the grammar then refuses — a `ParseError` from the empty
  // string, not from this pass. Surplus SAVED entries are simply never used:
  // `"\\text{ }"` saves one and restores none, and keeps the `\text{}` the
  // space-stripping pass left. Both directions are covered in
  // `test/formats/latex/preprocess.spec.ts`, expectations taken from the gem.
  working = applyRewrites(
    working,
    textFunctionSpans(working.text).map((span, restored) => ({
      start: span.start,
      length: span.length,
      // `?? ""` is `nil.to_s`, not a fallback chosen here.
      text: textFunctions[restored] ?? "",
    })),
  );

  return { text: working.text, map: SourceMap.fromSegments(toSegments(working, input.length)) };
}

/**
 * Cut the working text into `PreprocessSegment`s: adjacent units sharing a span
 * came from one rewrite and stay together, everything else becomes its own
 * one-unit segment. `SourceMap.fromSegments` points every unit of a segment at
 * that segment's start, so an untouched character must not be merged with its
 * neighbours.
 *
 * Unlike AsciiMath's, this preprocessor DELETES text — spaces, newlines,
 * `&#xa;` — so the last surviving segment need not reach the end of the input,
 * and a trailing deletion would leave `SourceMap`'s past-the-end clamp short.
 * The tail is therefore closed explicitly with a zero-output segment covering
 * whatever was dropped after the last surviving character.
 */
function toSegments(working: Working, inputLength: number): PreprocessSegment[] {
  const { text, spans } = working;
  const segments: PreprocessSegment[] = [];
  let unit = 0;

  while (unit < text.length) {
    const spanStart = spans.start[unit] as number;
    const spanEnd = spans.end[unit] as number;
    let after = unit + 1;
    while (
      after < text.length &&
      spans.start[after] === spanStart &&
      spans.end[after] === spanEnd
    ) {
      after += 1;
    }
    segments.push({
      originStart: spanStart,
      originLength: spanEnd - spanStart,
      output: text.slice(unit, after),
    });
    unit = after;
  }

  const covered = text.length === 0 ? 0 : (spans.end[text.length - 1] as number);
  if (covered < inputLength) {
    segments.push({ originStart: covered, originLength: inputLength - covered, output: "" });
  }
  return segments;
}
