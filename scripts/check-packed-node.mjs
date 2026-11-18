// Run from a clean consumer with the packed tarball installed: loads the
// package through its specifier and parses through the public API.
import assert from 'node:assert/strict';
const latexmath = await import('@plurimath/latexmath-ts');
await latexmath.initialize();
const tree = latexmath.parseTree('\\frac{a}{b}');
assert.ok(tree && !(tree instanceof Promise), 'parseTree is synchronous');
assert.ok(latexmath.parse('a+b'), 'typed model parse');
assert.equal(latexmath.parse('1,5', { decimal: ',' }).decimal, ',');
const browser = await import('@plurimath/latexmath-ts/browser');
assert.ok(Object.keys(browser).length > 0, 'browser entry loads');
console.log(`packed-node: ok on ${process.version}`);
