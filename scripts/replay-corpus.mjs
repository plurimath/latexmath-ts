// Replays a pinned plurimath-testsuite latex stage generation through this
// package.
//
//   node scripts/replay-corpus.mjs <testsuite-checkout> [--pin FILE]
//     [--limit N] [--group NAME[,NAME...]] [--boundary raw-tree|typed-model]
//     [--report FILE] [--executed FILE]
//
// --pin names a pin file in scripts/ (default corpus-pin.json). Before any row
// runs, the generation's files must hash to the pinned snapshot digest and
// provenance, and each payload to its recorded size and SHA-256.
//
// raw-tree rows go through Parser.parseTree and are compared as whole raw trees
// (or refusal offsets). typed-model rows go through Parser.parse and the
// generated model is compared field by field with the Ruby model wire the row
// records (or the refusal offset). Legacy-oracle payloads are counted and not
// run. A full run must execute exactly the pinned row IDs of each boundary, and
// any failing row fails the replay. LATEXMATH_TS_DIST replays an installed
// package's dist (for example an unpacked `npm pack` tarball) instead of the
// build tree.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { parse } from "yaml";
import { verifyLedger } from "./corpus-pin.mjs";
import { model, omitted } from "./model-wire.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    pin: { type: "string", default: "corpus-pin.json" },
    limit: { type: "string" },
    group: { type: "string" },
    boundary: { type: "string" },
    report: { type: "string" },
    executed: { type: "string" },
  },
});
const root = positionals[0];
if (!root) throw new Error("Pass the pinned plurimath-testsuite checkout path");
const limit = args.limit === undefined ? Infinity : Number(args.limit);
if (!(limit > 0)) throw new Error("--limit must be positive");
// Payload files are named raw-<group>.yaml and model-<group>.yaml.
const groups = args.group === undefined ? null : new Set(args.group.split(","));
if (args.boundary !== undefined) assert.ok(["raw-tree", "typed-model"].includes(args.boundary), "--boundary must be raw-tree or typed-model");
const partial = limit !== Infinity || groups !== null || args.boundary !== undefined;

const dist = resolve(process.env.LATEXMATH_TS_DIST ?? resolve(here, "../dist"));
const { initialize, ParseError } = await import(pathToFileURL(resolve(dist, "index.js")).href);

const pin = JSON.parse(readFileSync(resolve(here, args.pin), "utf8"));
verifyLedger(root, pin);
const generation = resolve(root, pin.path);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Same digest as the testsuite's validate-stages.rb: sha256 over
// "<sha256>  <path>\n" for every file of the generation, paths relative to the
// generation directory and ordered by their bytes. Every file counts, so an
// added, removed or changed file fails the pin.
function files(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return files(path, base);
    assert.ok(entry.isFile(), `unexpected entry ${path}`);
    return [relative(base, path).split("\\").join("/")];
  });
}
const listed = files(generation).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const digest = "sha256:" + sha(listed.map((path) => `${sha(readFileSync(resolve(generation, path)))}  ${path}\n`).join(""));
assert.equal(digest, pin.snapshot_digest, "pinned generation snapshot digest changed");

const provenanceBytes = readFileSync(resolve(generation, "provenance.yaml"));
assert.equal(sha(provenanceBytes), pin.provenance_sha256, "pinned corpus provenance changed");
const provenance = parse(provenanceBytes.toString("utf8"));
assert.equal(provenance.language, pin.language);
assert.equal(Number(provenance.generation), pin.generation);
assert.deepEqual(
  provenance.payloads.map((p) => p.path).concat("provenance.yaml").sort(),
  listed.slice().sort(),
  "generation files differ from the payloads provenance lists",
);

// Raw corpus atoms ({str}, {hash: [[k, v]]}, ...) to plain values.
function value(node) {
  if (node === null) return null;
  if (typeof node !== "object" || Array.isArray(node)) throw new Error("expected a tagged corpus atom");
  if ("str" in node) return node.str;
  if ("sym" in node) return node.sym;
  if ("slice" in node) return { text: node.slice, offset: node.byte_offset };
  if ("array" in node) return node.array.map(value);
  if ("hash" in node) {
    const entries = node.hash.map(([k, v]) => [value(k), value(v)]);
    assert.equal(new Set(entries.map(([k]) => k)).size, entries.length, "duplicate hash key");
    return Object.fromEntries(entries);
  }
  if ("nil" in node) return null;
  if ("bool" in node) return node.bool;
  if ("int" in node) return Number(node.int);
  throw new Error("unsupported raw corpus atom " + Object.keys(node).join(","));
}

function differs(kind, a, e) {
  let i = 0;
  while (a[i] === e[i]) i++;
  return new Error(`${kind} differs at ${i}: actual …${a.slice(Math.max(0, i - 120), i + 200)} expected …${e.slice(Math.max(0, i - 120), i + 200)}`);
}
function sameModel(actual, expected) {
  const a = JSON.stringify(model(actual, expected));
  const e = JSON.stringify(expected);
  if (a !== e) throw differs("model", a, e);
}
function sameTree(actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) throw differs("tree", JSON.stringify(actual), JSON.stringify(expected));
}

// Refusals report byte offsets into the caller's input.
function row(boundary, r) {
  let actual, error;
  try {
    actual = boundary === "typed-model" ? stage.parse(r.input.str, r.options) : stage.parseTree(r.input.str, r.options);
  } catch (e) { error = e; }
  if (r.expected.refusal) {
    assert.ok(error, "expected parse refusal");
    assert.equal(r.expected.refusal.category, "parse_error");
    assert.ok(error instanceof ParseError, String(error));
    assert.equal(error.byteOffset, r.expected.refusal.byte_offset);
  } else {
    if (error) throw error;
    if (boundary === "typed-model") sameModel(actual, r.expected.tree);
    else sameTree(actual, value(r.expected.tree));
  }
}

const boundaries = pin.boundaries;
assert.ok(boundaries && Object.keys(boundaries).length > 0, "pin lists no boundaries");
const prefixes = { "raw-tree": "raw-", "typed-model": "model-" };
const stage = await initialize();
const failures = [];
const ids = {};
const omittedRows = [];
let count = 0;
let skippedPayloads = 0;
for (const payload of provenance.payloads) {
  const name = payload.path.split("/").pop();
  const boundary = Object.keys(boundaries).find((b) => name.startsWith(prefixes[b]));
  const path = resolve(generation, payload.path);
  const rel = relative(generation, path);
  assert.ok(!rel.startsWith("..") && !isAbsolute(rel), "payload escapes generation");
  const bytes = readFileSync(path);
  assert.equal(bytes.length, payload.bytes, `${payload.path}: size`);
  assert.equal(sha(bytes), payload.sha256, `${payload.path}: checksum`);
  if (!boundary) {
    skippedPayloads++;
    continue;
  }
  if (args.boundary && boundary !== args.boundary) continue;
  if (groups && !groups.has(name.slice(prefixes[boundary].length).replace(/\.yaml$/, ""))) continue;
  const doc = parse(bytes.toString("utf8"), { maxAliasCount: -1 });
  assert.equal(doc.boundary, boundary);
  for (const r of doc.cases) {
    if (count >= limit) break;
    count++;
    (ids[boundary] ??= []).push(r.id);
    omitted.clear();
    try {
      row(boundary, r);
      if (omitted.size) omittedRows.push({ id: r.id, omitted: [...omitted].sort() });
    } catch (e) {
      failures.push({ id: r.id, boundary, input: r.input.str, error: String(e).slice(0, 900) });
    }
  }
}
assert.ok(count > 0, "no corpus cases");
// A complete run must execute exactly the pinned row IDs of each boundary.
if (!partial) {
  for (const [boundary, expected] of Object.entries(boundaries)) {
    const executed = ids[boundary] ?? [];
    assert.equal(new Set(executed).size, executed.length, `${boundary}: duplicate row id`);
    assert.equal(executed.length, expected.rows, `${boundary}: executed row count`);
    assert.equal(sha(Buffer.from(executed.join("\n"), "utf8")), expected.ids_sha256, `${boundary}: executed row IDs`);
  }
}
const report = {
  language: pin.language,
  generation: pin.generation,
  revision: pin.revision,
  snapshot_digest: digest,
  dist,
  complete: !partial,
  checked: count,
  executed: Object.fromEntries(Object.entries(ids).map(([b, v]) => [b, v.length])),
  legacy_payloads_not_run: skippedPayloads,
  unrecorded_derived_attributes: [...new Set(omittedRows.flatMap((r) => r.omitted))].sort(),
  unrecorded_derived_rows: omittedRows.length,
  failed: failures.length,
  failed_ids: failures.map((f) => f.id),
  failures,
};
if (args.report) writeFileSync(args.report, JSON.stringify(report, null, 1));
if (args.executed) writeFileSync(args.executed, Object.values(ids).flat().join("\n") + "\n");
const brief = (list) => list.slice(0, 20).map((f) => ({ id: f.id, error: f.error.slice(0, 300) }));
console.log(JSON.stringify({ ...report, failures: brief(failures) }));
process.exitCode = failures.length ? 1 : 0;
