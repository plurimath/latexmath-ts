import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { verifyLedger } from "../scripts/corpus-pin.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/model-wire.json", import.meta.url), "utf8"));
function check(ledger, pin = fixture.pin) {
  const root = mkdtempSync(join(tmpdir(), "stage-ledger-"));
  try {
    mkdirSync(join(root, "generations"));
    writeFileSync(join(root, "generations", `${fixture.pin.language}.yaml`), JSON.stringify(ledger));
    verifyLedger(root, pin);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test("pinned Ruby generation matches its recorded append-only ledger", () => check(fixture.ledger));
for (const [name, change] of [
  ["missing generation", ledger => { ledger.entries = ledger.entries.filter(e => e.generation !== fixture.pin.generation); }],
  ["duplicate generation", ledger => { ledger.entries.push(ledger.entries.find(e => e.generation === fixture.pin.generation)); }],
  ["wrong path", ledger => { ledger.entries.find(e => e.generation === fixture.pin.generation).path += "-changed"; }],
  ["wrong digest", ledger => { ledger.entries.find(e => e.generation === fixture.pin.generation).snapshot_digest = "sha256:changed"; }],
]) test(`ledger rejects ${name} before replay`, () => {
  const ledger = structuredClone(fixture.ledger);
  change(ledger);
  assert.throws(() => check(ledger), assert.AssertionError);
});
