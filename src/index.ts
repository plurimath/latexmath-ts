import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PargRuntime } from 'parsanol';
import { createParser, Parser, NotInitializedError, ArtifactError, type Options, type Tree } from './browser.js';
import type { LatexmathModelDocument } from './generated/models.js';
export * from './browser.js';

let active: Parser | undefined;
let initializing: Promise<Parser> | undefined;
/** Load and verify pinned package artifacts once; subsequent parsing is synchronous. */
export function initialize(): Promise<Parser> {
  initializing ??= (async () => {
    const root = new URL('../', import.meta.url);
    const manifest = JSON.parse(await readFile(new URL('artifacts/manifest.json', root), 'utf8')) as { files: Record<string, string> };
    const files = new Map<string, string>();
    for (const [path, expected] of Object.entries(manifest.files)) {
      const bytes = await readFile(new URL(path, root));
      if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new ArtifactError(`checksum mismatch: ${path}`);
      files.set(path, bytes.toString('utf8'));
    }
    const parser = await createParser({ artifact: files.get('artifacts/latex.json')!, bindings: files.get('artifacts/latex.bindings.ts.json')!, wrappers: files.get('grammars/latex.wrappers.json')! }, (artifact, entry) => new PargRuntime(artifact, entry));
    active = parser;
    return parser;
  })();
  return initializing;
}
function ready(): Parser { if (!active) throw new NotInitializedError('await initialize() before parsing'); return active; }
export function parseTree(input: string, options?: Options): Tree { return ready().parseTree(input, options); }
export function parseShape(input: string, options?: Options): unknown { return ready().parseShape(input, options); }
export function parseBindings(input: string, options?: Options): ReturnType<Parser["parseBindings"]> { return ready().parseBindings(input, options); }
export function parse(input: string, options?: Options): LatexmathModelDocument { return ready().parse(input, options); }

export function parsePreparedTree(input: string, options?: Options): Tree { return ready().parsePreparedTree(input, options); }
