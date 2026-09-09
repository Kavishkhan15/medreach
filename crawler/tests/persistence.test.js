// Change detection + persistence tests — pure + in-memory repo (no DB, no network).
import test from "node:test";
import assert from "node:assert/strict";
import { detectChange, fieldCount } from "../src/changeDetection/compare.js";
import { PersistenceService } from "../src/persistence/persistenceService.js";
import { getSource } from "../src/registry/sources.js";

function rec(overrides = {}) {
  return {
    hospital: { name: "Lilavati Hospital", pincode: "400050", city: "Mumbai", phone: "+912226751000", locality: "Bandra", hospitalType: "Trust" },
    facilities: [
      { facility: "ICU", capability: "yes", availability: "unknown" },
      { facility: "Emergency Department", capability: "yes", availability: "unknown" },
      { facility: "Blood Bank", capability: "yes", availability: "unknown" },
    ],
    specialties: ["Cardiology", "Neurology"],
    emergency: { hasEmergencyDept: "yes", emergencyPhone: "+912226568000" },
    contacts: { phones: ["+912226751000"], emails: [] },
    provenance: { sourceId: "lilavati", sourcePageUrl: "https://www.lilavatihospital.com/", collectionMethod: "crawler", parserVersion: "lilavati-v1" },
    retrievedAt: new Date().toISOString(),
    ...overrides,
  };
}

test("change detection: NEW / NO_CHANGE / UPDATED", () => {
  assert.equal(detectChange(null, rec()).classification, "NEW");
  assert.equal(detectChange(rec(), rec()).classification, "NO_CHANGE");
  const changed = rec({ facilities: [{ facility: "ICU", capability: "yes" }, { facility: "Emergency Department", capability: "yes" }, { facility: "Blood Bank", capability: "yes" }, { facility: "MRI", capability: "yes" }] });
  const d = detectChange(rec(), changed);
  assert.equal(d.classification, "UPDATED");
  assert.ok(d.changedFields.includes("facility:+MRI"));
});

test("change detection: INVALID on null next", () => {
  assert.equal(detectChange(rec(), null).classification, "INVALID");
});

test("parser-anomaly: field collapse flagged, not a clean update", () => {
  const previous = rec(); // many fields
  const broken = { hospital: { name: "Lilavati Hospital" }, facilities: [], specialties: [], emergency: { hasEmergencyDept: "unknown" }, contacts: { phones: [] } };
  const d = detectChange(previous, broken);
  assert.equal(d.anomaly, true);
  assert.ok(fieldCount(previous) > fieldCount(broken));
});

// ---- in-memory repo ----
function makeRepo() {
  const store = { hospital: null, previous: null, facilities: [], observations: [], anomalies: [] };
  return {
    store,
    async findHospitalBySourceId() { return store.hospital; },
    async getPreviousRecord() { return store.previous; },
    async upsertHospital(record) { store.hospital = store.hospital || { _id: "h1", name: record.hospital.name }; return store.hospital; },
    async saveFacilityCapability(hid, facility, meta) { store.facilities.push({ hid, facility, ...meta }); },
    async addObservation(o) { store.observations.push(o); },
    async savePreviousRecord(hid, record) { store.previous = record; },
    async flagAnomaly(sid, info) { store.anomalies.push({ sid, ...info }); },
  };
}

test("persistence: NEW hospital creates capability + append-only observations", async () => {
  const repo = makeRepo();
  const svc = new PersistenceService(repo);
  const out = await svc.apply(rec(), { source: getSource("lilavati") });
  assert.equal(out.classification, "NEW");
  assert.equal(out.recordsCreated, 1);
  assert.equal(out.observationsAdded, 3);
  // Every observation availability is unknown (never inferred), no bed counts.
  assert.ok(repo.store.observations.every((o) => o.status === "unknown" && o.quantity === null));
  assert.ok(repo.store.observations.every((o) => o.sourceId === "lilavati" && o.confidence));
});

test("persistence: unchanged record is skipped (no writes)", async () => {
  const repo = makeRepo();
  const svc = new PersistenceService(repo);
  await svc.apply(rec(), { source: getSource("lilavati") }); // NEW
  const before = repo.store.observations.length;
  const out = await svc.apply(rec(), { source: getSource("lilavati") }); // same
  assert.equal(out.classification, "NO_CHANGE");
  assert.equal(out.recordsSkipped, 1);
  assert.equal(repo.store.observations.length, before); // no new writes
});

test("persistence: anomaly keeps previous data, flags admin, writes nothing", async () => {
  const repo = makeRepo();
  const svc = new PersistenceService(repo);
  await svc.apply(rec(), { source: getSource("lilavati") }); // NEW baseline
  const facBefore = repo.store.facilities.length;
  const broken = { hospital: { name: "Lilavati Hospital" }, facilities: [], specialties: [], emergency: { hasEmergencyDept: "unknown" }, contacts: { phones: [] }, provenance: { sourceId: "lilavati" }, retrievedAt: new Date().toISOString() };
  const out = await svc.apply(broken, { source: getSource("lilavati") });
  assert.equal(out.classification, "PARSING_ANOMALY");
  assert.equal(out.anomaly, true);
  assert.equal(out.recordsSkipped, 1);
  assert.equal(repo.store.facilities.length, facBefore); // did NOT overwrite
  assert.equal(repo.store.anomalies.length, 1);
});

test("persistence: dry-run writes nothing", async () => {
  const repo = makeRepo();
  const svc = new PersistenceService(repo);
  const out = await svc.apply(rec(), { source: getSource("lilavati"), dryRun: true });
  assert.equal(out.dryRun, true);
  assert.equal(out.recordsCreated, 1); // planned
  assert.equal(repo.store.observations.length, 0); // but nothing written
});

test("persistence: INVALID record rejected", async () => {
  const repo = makeRepo();
  const svc = new PersistenceService(repo);
  const out = await svc.apply({ hospital: {} }, { source: getSource("lilavati") });
  assert.equal(out.classification, "INVALID");
  assert.equal(out.recordsRejected, 1);
});
