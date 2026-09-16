// All-adapters parity test — each of the 4 hospital adapters runs offline via a
// mock fetch returning its fixture, and must produce a valid normalized record
// with capability facilities + availability=unknown + provenance. No network.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getSource } from "../src/registry/sources.js";
import { adapterFor, ADAPTERS, isCrawlable } from "../src/registry.js";
import { _clearCache } from "../src/robots/robotsChecker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => readFileSync(join(__dirname, "fixtures", `${n}.html`), "utf8");

function mockFor(html) {
  return async (url) => {
    if (url.endsWith("/robots.txt")) return { status: 200, text: async () => "User-agent: *\nAllow: /", headers: { get: () => "text/plain" } };
    return { status: 200, text: async () => html, headers: { get: () => "text/html; charset=utf-8" } };
  };
}

const CASES = [
  { id: "lilavati", name: /Lilavati/, pincode: "400050" },
  { id: "kokilaben", name: /Kokilaben/, pincode: "400053" },
  { id: "fortis", name: /Fortis/, pincode: "400078" },
  { id: "jaslok", name: /Jaslok/, pincode: null },
];

for (const c of CASES) {
  test(`${c.id}: adapter registered and standing respected`, () => {
    assert.ok(ADAPTERS[c.id], `${c.id} adapter registered`);
    assert.equal(isCrawlable(getSource(c.id)).ok, c.id !== "fortis");
  });

  test(`${c.id}: runs offline -> valid capability record (availability unknown)`, async () => {
    _clearCache();
    const source = getSource(c.id);
    const adapter = adapterFor(source, { fetchImpl: mockFor(fixture(c.id)) });
    const out = await adapter.run();
    assert.equal(out.ok, true, `${c.id} run ok`);
    assert.match(out.record.hospital.name, c.name);
    // Emergency capability detected on every fixture
    assert.equal(out.record.emergency.hasEmergencyDept, "yes");
    // ICU + Emergency Department capability present
    const facs = out.record.facilities.map((f) => f.facility);
    assert.ok(facs.includes("ICU"), `${c.id} has ICU capability`);
    assert.ok(facs.includes("Emergency Department"), `${c.id} has ED capability`);
    // Availability is ALWAYS unknown from static pages; no fabricated bed counts
    assert.ok(out.record.facilities.every((f) => f.availability === "unknown"));
    // Specialties collected (not invented)
    assert.ok(out.record.specialties.includes("Cardiology"));
    // Provenance present
    assert.equal(out.record.provenance.sourceId, c.id);
    assert.equal(out.record.provenance.collectionMethod, "crawler");
    assert.equal(out.record.provenance.parserVersion, `${c.id}-v1`);
  });
}

test("jaslok: emergency number + address from real observed data", async () => {
  _clearCache();
  const source = getSource("jaslok");
  const out = await adapterFor(source, { fetchImpl: mockFor(fixture("jaslok")) }).run();
  assert.ok(out.record.contacts.phones.includes("08062344444"));
  assert.ok(out.record.contacts.emails.includes("appointments@jaslokhospital.net"));
});
