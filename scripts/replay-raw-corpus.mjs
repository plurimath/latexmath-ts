import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { initialize, ParseError } from "../dist/index.js";
const here=dirname(fileURLToPath(import.meta.url));
const pin=JSON.parse(readFileSync(resolve(here,"corpus-pin.json"),"utf8"));
const root=process.argv[2];if(!root)throw new Error("Pass the pinned plurimath-testsuite checkout path");
const limit=process.argv[3]===undefined?Infinity:Number(process.argv[3]);
if(!(limit>0))throw new Error("limit must be positive");
const group=process.argv[4];
const generation=resolve(root,pin.path);
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const provenanceBytes=readFileSync(resolve(generation,"provenance.yaml"));
assert.equal(sha(provenanceBytes),pin.provenance_sha256,"pinned corpus provenance changed");
const provenance=parse(provenanceBytes.toString("utf8"));
assert.equal(provenance.language,pin.language);assert.equal(Number(provenance.generation),pin.generation);
function value(node){
 if(node===null)return null;
 if(typeof node!=="object"||Array.isArray(node))throw new Error("expected a tagged corpus atom");
 if("str"in node)return node.str;
 if("sym"in node)return node.sym;
 if("slice"in node)return {text:node.slice,offset:node.byte_offset};
 if("array"in node)return node.array.map(value);
 if("hash"in node){const entries=node.hash.map(([k,v])=>[value(k),value(v)]);assert.equal(new Set(entries.map(([k])=>k)).size,entries.length,"duplicate hash key");return Object.fromEntries(entries);}
 if("nil"in node)return null;
 if("bool"in node)return node.bool;
 if("int"in node)return Number(node.int);
 throw new Error("unsupported raw corpus atom "+Object.keys(node).join(","));
}
const stage=await initialize();const failures=[];let count=0;
for(const payload of provenance.payloads){
 if(!payload.path.split("/").pop().startsWith("raw-"))continue;
 if(group&&!payload.path.endsWith(group+".yaml"))continue;
 const path=resolve(generation,payload.path);const rel=relative(generation,path);assert.ok(!rel.startsWith("..")&&!isAbsolute(rel),"payload escapes generation");
 const bytes=readFileSync(path);assert.equal(bytes.length,payload.bytes);assert.equal(sha(bytes),payload.sha256,"payload checksum");
 const doc=parse(bytes.toString("utf8"));assert.equal(doc.boundary,"raw-tree");
 for(const row of doc.cases){
  if(count>=limit)break;count++;
  try{
   let actual,error;try{actual=stage.parseTree(row.input.str,row.options);}catch(e){error=e;}
   if(row.expected.refusal){assert.ok(error,"expected parse refusal");assert.equal(row.expected.refusal.category,"parse_error");assert.ok(error instanceof ParseError);assert.equal(error.byteOffset,row.expected.refusal.byte_offset);}
   else{if(error)throw error;assert.deepEqual(actual,value(row.expected.tree));}
  }catch(e){failures.push({id:row.id,input:row.input.str,error:String(e).slice(0,700)});}
 }
}
assert.ok(count>0,"no raw corpus cases");
console.log(JSON.stringify({language:pin.language,generation:pin.generation,checked:count,failed:failures.length,failures}));
process.exitCode=failures.length?1:0;
