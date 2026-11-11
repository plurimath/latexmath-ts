import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, relative, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(process.argv[2] ?? '');
const revision = '1242c7b6314dcadc42e3453e85c9f2fc879cd7ef';
if (execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== revision) throw new Error('unexpected lutaml-ts source revision');
if (execFileSync('git', ['-C', source, 'status', '--porcelain'], { encoding: 'utf8' }).trim()) throw new Error('lutaml-ts source must be clean');
const build = join(root, '.build/lutaml-ts');
await mkdir(build, { recursive: true });
await writeFile(join(build, 'package.json'), '{"type":"module"}\n');
const inputs = {};
async function transpile(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await transpile(path); continue; }
    if (!entry.name.endsWith('.ts')) continue;
    const text = await readFile(path, 'utf8');
    const rel = relative(join(source, 'src'), path);
    inputs[`src/${rel}`] = createHash('sha256').update(text).digest('hex');
    const output = join(build, rel.replace(/\.ts$/, '.js'));
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
  }
}
await transpile(join(source, 'src'));
const { generateModelsWith } = await import(pathToFileURL(join(build, 'generator/index.js')).href);
const { createKeyValueEmitter } = await import(pathToFileURL(join(build, 'codecs/index.js')).href);
const bundleText = await readFile(join(root, 'model/latex.bundle.json'), 'utf8');
const bundle = JSON.parse(bundleText);
const contractsModule = '../upstream/lutaml-contracts.js';
const files = generateModelsWith(bundle, { types: {} }, [createKeyValueEmitter('json', { contractsModule })], { contractsModule });
for (const [path, text] of files) {
  if (path.split('/').some(part => part === '..' || part === '.' || !part)) throw new Error('unsafe generator output path');
  const output = join(root, 'src/generated', path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, text);
}
await mkdir(join(root, 'src/upstream'), { recursive: true });
await writeFile(join(root, 'src/upstream/lutaml-contracts.ts'), `// Vendored contract from lutaml/lutaml-ts@${revision} (BSD-2-Clause).\n` + await readFile(join(source, 'src/contracts.ts'), 'utf8'));
await writeFile(join(root, 'model/codegen-provenance.json'), JSON.stringify({ repository: 'https://github.com/lutaml/lutaml-ts', revision, sourceFiles: inputs, bundleSha256: createHash('sha256').update(bundleText).digest('hex'), outputs: Object.fromEntries([...files].map(([path, text]) => [path, createHash('sha256').update(text).digest('hex')])) }, null, 2) + '\n');
console.log(`generated ${files.size} model/codec files from ${Object.keys(bundle.models).length} pinned LML declarations`);
