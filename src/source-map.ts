/**
 * Maps offsets in a preprocessed string back to the original input.
 *
 * Preprocessing rewrites digraphs to single characters (AsciiMath: `{:` → `ℒ`,
 * `:)` → `ᑐ`), so a raw parser offset does not index what the caller passed in.
 * Every user-visible position — `ParseError.index`, diagnostics — is translated
 * through one of these first.
 */
export class SourceMap {
  private constructor(
    /** originOf[i] is the offset in the original input of preprocessed char i. */
    private readonly originOf: readonly number[],
    /** Length of the original input, so past-the-end offsets clamp correctly. */
    private readonly originalLength: number,
  ) {}

  /** Identity map, for formats that do not preprocess. */
  static identity(length: number): SourceMap {
    return new SourceMap(
      Array.from({ length }, (_, index) => index),
      length,
    );
  }

  static fromSegments(segments: readonly PreprocessSegment[]): SourceMap {
    const originOf: number[] = [];
    let originalLength = 0;
    for (const segment of segments) {
      // An unchanged (identity) segment has `output.length === originLength`,
      // so each output char advances one origin offset. A replaced segment
      // (e.g. an entity collapsed to fewer output chars) has fewer output
      // chars than origin chars, so every output char still points at the
      // segment's start — clamping keeps that case exactly as before.
      for (let index = 0; index < segment.output.length; index++) {
        originOf.push(segment.originStart + Math.min(index, segment.originLength - 1));
      }
      originalLength = segment.originStart + segment.originLength;
    }
    return new SourceMap(originOf, originalLength);
  }

  /** Translate a preprocessed offset to an offset in the original input. */
  toOriginal(offset: number): number {
    if (offset < this.originOf.length) return this.originOf[offset] as number;
    // Past the end — e.g. "unexpected end of input". Clamp to the end of the
    // original input. Deriving this from the last segment's start would land
    // mid-token whenever the input ends in a rewritten digraph: `"{:"` → `"ℒ"`
    // would report 1 rather than 2.
    return this.originalLength;
  }
}

export interface PreprocessSegment {
  /** Offset of this segment's first character in the original input. */
  readonly originStart: number;
  /** How many characters of the original input this segment consumed. */
  readonly originLength: number;
  /** What the segment became after preprocessing. */
  readonly output: string;
}
