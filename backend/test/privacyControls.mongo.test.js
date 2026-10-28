import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { ResourceInventory } from "../src/models/ResourceInventory.js";
import { DataExport } from "../src/models/DataExport.js";
import { createScopedExport, consumeScopedExport } from "../src/services/privacyControls.js";
let uri;
try { const parsed = new URL(process.env.MEDREACH_PRIVACY_TEST_MONGO_URI); if (["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) && /^\/medreach_privacy_test(?:_[a-z0-9]+)*$/.test(parsed.pathname)) { parsed.pathname = `/medreach_privacy_test_${randomUUID().replaceAll("-", "")}`; uri = parsed.toString(); } } catch {}
test("database-backed scoped single-use export and revocation", { skip: !uri, timeout: 30000 }, async (t) => {
  await mongoose.connect(uri); t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await DataExport.init();
  const [admin, other] = await User.create([{ email: "provider-a@example.test", name: "A", role: "provider_admin" }, { email: "provider-b@example.test", name: "B", role: "provider_admin" }]);
  // Insert only isolated fixtures; production Hospital validation is unrelated to export behavior.
  const hospital = new mongoose.Types.ObjectId(), otherHospital = new mongoose.Types.ObjectId();
  await Hospital.collection.insertMany([{ _id: hospital, name: "Synthetic export A", slug: "synthetic-export-a" }, { _id: otherHospital, name: "Synthetic export B", slug: "synthetic-export-b" }]);
  await ProviderMembership.create({ user: admin._id, organization: hospital, kind: "hospital", active: true, assignedBy: admin._id });
  await ProviderMembership.create({ user: other._id, organization: otherHospital, kind: "hospital", active: true, assignedBy: other._id });
  const actor = { id: String(admin._id), role: "provider_admin" };
  await ResourceInventory.create({ kind: "hospital", organization: hospital, resourceKey: "icu", unit: "beds", capacity: 15, available: 0,
    observedAt: new Date(), classification: "provider_confirmed", reportingMethod: "provider_report", version: 1 });
  await t.test("forged organisation rejected", async () => {
    await assert.rejects(createScopedExport({ actor, kind: "hospital", organizationId: otherHospital, dataset: "current_inventory" }), error => error.status === 403);
  });
  const created = await createScopedExport({ actor, kind: "hospital", organizationId: hospital, dataset: "current_inventory" });
  await t.test("raw export token is never stored and foreign requester denied", async () => {
    const saved = await DataExport.findById(created.id).select("+tokenHash").lean();
    assert.notEqual(saved.tokenHash, created.token); assert.equal(saved.tokenHash.length, 64);
    await assert.rejects(consumeScopedExport({ actor: { id: other._id }, id: created.id, token: created.token }), error => error.status === 404);
  });
  await t.test("eight concurrent downloads produce exactly one success", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => consumeScopedExport({ actor, id: created.id, token: created.token })));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const result = results.find(result => result.status === "fulfilled").value;
    assert.equal(result.rows[0].available, 0); assert.equal("updatedBy" in result.rows[0], false);
  });
  await t.test("expiry checked immediately even before TTL removal", async () => {
    const item = await createScopedExport({ actor, kind: "hospital", organizationId: hospital, dataset: "current_inventory" });
    await DataExport.updateOne({ _id: item.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(consumeScopedExport({ actor, id: item.id, token: item.token }), error => error.status === 404);
  });
  await t.test("membership removal invalidates pending export", async () => {
    const item = await createScopedExport({ actor, kind: "hospital", organizationId: hospital, dataset: "current_inventory" });
    await ProviderMembership.updateOne({ user: admin._id }, { $set: { active: false } });
    await assert.rejects(consumeScopedExport({ actor, id: item.id, token: item.token }), error => error.status === 403);
    assert.equal((await DataExport.findById(item.id).lean()).consumedAt, undefined);
  });
});
