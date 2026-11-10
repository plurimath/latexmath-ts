import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createParser } from '../dist/browser.js';
const paths={"artifact": "artifacts/latex.json", "bindings": "artifacts/latex.bindings.ts.json", "wrappers": "grammars/latex.wrappers.json"};
test('typed resource errors and actual VM traps preserve identity',async()=>{
 const bundle=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,path])=>[key,await readFile(new URL('../'+path,import.meta.url),'utf8')])));
 for(const name of ['CallDepthLimitExceeded','RecursionLimitExceeded','ShapeDepthLimitExceeded','RuntimeError']){
  const error=name==='RuntimeError'?new WebAssembly.RuntimeError('memory access out of bounds'):Object.assign(new Error('resource budget'),{name,category:'call_depth_limit',depth:1025,maxDepth:1024});
  let recoveryCalls=0;
  const parser=await createParser(bundle,()=>({parseShape(){throw error},parseShapeRecovering(){recoveryCalls++;throw new Error('diagnostic must not run')},applyBindingsArtifact(){throw new Error('unexpected binding call')}}));
  assert.throws(()=>parser.parseTree('x'),actual=>actual===error);
  assert.equal(recoveryCalls,0);
 }
});
