// Match the pinned generation to its append-only testsuite ledger before
// parsing any rows. Snapshot, provenance and payload hashes are checked by
// replay-corpus.mjs; a generation cannot silently name a different ledger entry.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

export function verifyLedger(root, pin) {
  assert.match(pin.language, /^[a-z]+$/, "invalid pin language");
  assert.ok(Number.isSafeInteger(pin.generation) && pin.generation > 0, "invalid generation");
  const ledger = parse(readFileSync(resolve(root, "generations", `${pin.language}.yaml`), "utf8"));
  const entries = ledger.entries.filter((entry) => entry.generation === pin.generation);
  assert.equal(entries.length, 1, "ledger must contain exactly one pinned generation");
  assert.equal(entries[0].path, pin.path, "ledger path differs from pin");
  assert.equal(entries[0].snapshot_digest, pin.snapshot_digest, "ledger digest differs from pin");
}
