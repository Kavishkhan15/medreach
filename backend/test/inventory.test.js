import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInventoryInput, publicInventorySnapshot, INVENTORY_FRESHNESS_MS } from "../src/services/inventoryService.js";

const now = new Date("2026-10-25T12:00:00Z");
const valid = { expectedVersion: 0, capacity: 50, occupied: 20, blocked: 5, held: 0, observedAt: now.toISOString(), reportingMethod: "manual_inventory" };
test("inventory preserves unknown and confirmed zero", () => {
  assert.equal(normalizeInventoryInput(valid, now).available, 25);
  assert.equal(normalizeInventoryInput({ ...valid, occupied: 45 }, now).available, 0);
  assert.equal(normalizeInventoryInput({ ...valid, occupied: null }, now).available, null);
  const { occupied, ...missing } = valid;
  assert.equal(normalizeInventoryInput(missing, now).occupied, null);
  assert.equal(normalizeInventoryInput(missing, now).available, null);
});
test("inventory rejects invalid counts, implicit coercion, unsupported holds and inconsistent totals", () => {
  for (const bad of [-1, 0.5, "15", true, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => normalizeInventoryInput({ ...valid, capacity: bad }, now));
  assert.throws(() => normalizeInventoryInput({ ...valid, occupied: 51 }, now));
  assert.throws(() => normalizeInventoryInput({ ...valid, held: 1 }, now));
  assert.throws(() => normalizeInventoryInput({ ...valid, expectedVersion: undefined }, now));
  assert.throws(() => normalizeInventoryInput({ ...valid, observedAt: "invalid" }, now));
  assert.throws(() => normalizeInventoryInput({ ...valid, observedAt: new Date(now.getTime() + 60001).toISOString() }, now));
  assert.throws(() => normalizeInventoryInput({ ...valid, classification: "provider_confirmed" }, now));
  assert.throws(() => normalizeInventoryInput({ ...valid, available: 999 }, now));
});
test("public inventory withholds demo, stale, unknown and future counts without losing zero", () => {
  const record = { resourceKey: "icu_beds", unit: "beds", capacity: 15, occupied: 15, blocked: 0, held: 0, available: 0, classification: "provider_confirmed", observedAt: now, version: 1, updatedBy: "private", pendingEvents: [{ secret: true }] };
  assert.equal(publicInventorySnapshot(record, now).available, 0);
  assert.equal(publicInventorySnapshot(record, now).status, "unavailable");
  assert.equal(publicInventorySnapshot({ ...record, observedAt: new Date(now - INVENTORY_FRESHNESS_MS - 1) }, now).available, null);
  assert.equal(publicInventorySnapshot({ ...record, classification: "demo" }, now).available, null);
  assert.equal(publicInventorySnapshot({ ...record, observedAt: null }, now).available, null);
  assert.equal(publicInventorySnapshot({ ...record, observedAt: new Date(now.getTime() + 1) }, now).available, null);
  assert.equal("updatedBy" in publicInventorySnapshot(record, now), false);
  assert.equal("pendingEvents" in publicInventorySnapshot(record, now), false);
});
