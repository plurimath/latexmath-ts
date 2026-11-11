import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { initialize, Model, modelJson } from '../dist/index.js';
let parser;
before(async()=>{parser=await initialize()});
const samples=["x", "\\alpha", "\\frac{1}{2}", "\\sqrt{x}", "\\text{a b}"];
for(const input of samples)test('typed/raw shared-artifact parse: '+input,()=>{
 const value=parser.parse(input);assert(value instanceof Model.LatexmathModelDocument);
 assert.equal(value.decimal,'.');assert(value.expression!==null);
 const wire=modelJson.encodeLatexmathModelDocument(value);assert(wire && typeof wire==='object');
 assert(parser.parseTree(input)!==undefined);
});
test('decimal is a per-call option',()=>{assert.equal(parser.parse('1,5',{decimal:','}).decimal,',');assert.equal(parser.parse('1').decimal,'.')});
test('invalid options and Unicode fail explicitly',()=>{assert.throws(()=>parser.parse('x',{decimal:'?'}));assert.throws(()=>parser.parse('x',{engine:'ruby'}));assert.throws(()=>parser.parse('\ud800'))});

test('whitespace-only input: empty typed Document, raw boundary still refuses (stage latex-whitespace-only)', () => {
  const doc = parser.parse('   ');
  assert.equal(doc.decimal, '.');
  assert.ok(doc.expression == null || doc.expression === Model.ABSENT, 'no expression');
  assert.equal(parser.parse('', { decimal: ',' }).decimal, ',');
  assert.throws(() => parser.parseTree('   '), error => error.name === 'ParseError');
  assert.throws(() => parser.parse('   ', { decimal: 'bad' }), RangeError);
});
