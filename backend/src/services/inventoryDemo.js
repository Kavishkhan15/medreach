import { createHash } from "node:crypto";
import mongoose from "mongoose";

const { ObjectId } = mongoose.mongo;
const fixtureNamespace = "medreach_inventory_demo_v1";
const scenarios = ["fully_available", "partially_occupied", "icu_nearly_full", "general_full", "blocked_beds", "stale_unknown"];
const fixtureId = (name) => new ObjectId(createHash("sha256").update(`${fixtureNamespace}:${name}`).digest("hex").slice(0, 24));

export function assertInventoryDemoTarget(uri, config = process.env) {
  if (!["development", "test"].includes(config.NODE_ENV) || config.EMAIL_ENABLED !== "false") throw new Error("Inventory demo requires explicit development/test mode and EMAIL_ENABLED=false.");
  const target = typeof uri === "string" && uri.match(/^mongodb:\/\/(?:127\.0\.0\.1|localhost):[0-9]+\/(medreach_demo_inventory|medreach_inventory_demo_test)$/);
  if (!target || (target[1] === "medreach_inventory_demo_test" && config.NODE_ENV !== "test")) throw new Error("Inventory demo requires an explicitly named isolated loopback demo database.");
  return target[1];
}

export function inventoryDemoFixtures(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("A valid fixture time is required.");
  const states = {
    fully_available: [[0, 0, 0], [0, 0, 0]],
    partially_occupied: [[26, 2, 0], [8, 1, 0]],
    icu_nearly_full: [[20, 0, 0], [14, 0, 0]],
    general_full: [[50, 0, 0], [9, 0, 0]],
    blocked_beds: [[30, 10, 0], [8, 4, 0]],
    stale_unknown: [[22, 0, 0], [null, null, null]],
  };
  return scenarios.map((scenario) => {
    const organization = fixtureId(scenario);
    const hospital = { _id: organization, name: `DEMO Synthetic ${scenario.replaceAll("_", " ")}`, slug: `demo-inventory-${scenario.replaceAll("_", "-")}`,
      description: "Synthetic inventory demonstration. This is not a real healthcare organisation and must not be used for patient coordination.",
      demo: true, classification: "demo", demoFixtureKey: `${fixtureNamespace}:${scenario}`, approvalStatus: "approved", city: "Synthetic demo city", admins: [],
      emergencyDepartmentStatus: "unknown", ambulanceStatus: "unknown", bedsTotal: 65, bedsAvailable: null,
      createdAt: now, updatedAt: now };
    const inventories = ["general_beds", "icu_beds"].map((resourceKey, index) => {
      const capacity = index === 0 ? 50 : 15;
      const [occupied, blocked, held] = states[scenario][index];
      return { _id: fixtureId(`${scenario}:${resourceKey}`), kind: "hospital", organization, resourceKey, unit: "beds", capacity, occupied, blocked, held,
        available: [occupied, blocked, held].some((v) => v === null) ? null : capacity - occupied - blocked - held,
        observedAt: scenario === "stale_unknown" ? (index === 0 ? new Date(now.getTime() - 31 * 60000) : null) : now,
        updatedBy: null, version: 1, reportingMethod: "demo_fixture", classification: "demo", pendingEvents: [], createdAt: now, updatedAt: now };
    });
    // General bed inventory is represented by resourceKey, not an invented
    // legacy HospitalFacility enum. ICU is an existing capability type.
    const capabilities = ["ICU"].map((facility) => ({ _id: fixtureId(`${scenario}:capability:${facility}`), hospital: organization,
      facility, capability: "yes", status: "unknown", count: null, confidence: "UNKNOWN", demo: true, classification: "demo", createdAt: now, updatedAt: now }));
    return { scenario, hospital, inventories, capabilities };
  });
}

export async function createInventoryDemo(db, { uri, config = process.env, now = new Date() } = {}) {
  const database = assertInventoryDemoTarget(uri, config);
  if (db.databaseName !== database) throw new Error("Connected database does not match the approved demo target.");
  const fixtures = inventoryDemoFixtures(now);
  const fixtureIds = { hospitals: fixtures.map((f) => f.hospital._id), resourceinventories: fixtures.flatMap((f) => f.inventories.map((r) => r._id)), hospitalfacilities: fixtures.flatMap((f) => f.capabilities.map((r) => r._id)) };
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    const filter = fixtureIds[name] ? { _id: { $nin: fixtureIds[name] } } : {};
    if (await db.collection(name).countDocuments(filter, { limit: 1 })) throw new Error("Demo database contains unrelated records. Refusing fixture writes.");
  }
  // Deterministic identities allow safe recovery after interruption. Preflight all
  // colliding identities before the first write; existing values are never reset.
  for (const fixture of fixtures) {
    const existingHospital = await db.collection("hospitals").findOne({ $or: [{ _id: fixture.hospital._id }, { slug: fixture.hospital.slug }] }, { projection: { _id: 1, demo: 1, demoFixtureKey: 1 } });
    if (existingHospital && (String(existingHospital._id) !== String(fixture.hospital._id) || existingHospital.demo !== true || existingHospital.demoFixtureKey !== fixture.hospital.demoFixtureKey)) throw new Error("Demo identity collides with an existing organisation; no fixture writes were attempted.");
    for (const inventory of fixture.inventories) {
      const existing = await db.collection("resourceinventories").findOne({ $or: [{ _id: inventory._id }, { kind: inventory.kind, organization: inventory.organization, resourceKey: inventory.resourceKey }] }, { projection: { _id: 1, classification: 1, reportingMethod: 1 } });
      if (existing && (String(existing._id) !== String(inventory._id) || existing.classification !== "demo" || existing.reportingMethod !== "demo_fixture")) throw new Error("Demo inventory collides with existing data; no fixture writes were attempted.");
    }
    for (const capability of fixture.capabilities) {
      const existing = await db.collection("hospitalfacilities").findOne({ $or: [{ _id: capability._id }, { hospital: capability.hospital, facility: capability.facility }] }, { projection: { _id: 1, demo: 1 } });
      if (existing && (String(existing._id) !== String(capability._id) || existing.demo !== true)) throw new Error("Demo capability collides with existing data; no fixture writes were attempted.");
    }
  }
  const created = { hospitals: 0, inventories: 0, capabilities: 0 };
  const insertOnly = async (collection, document, countKey) => {
    try { const result = await db.collection(collection).updateOne({ _id: document._id }, { $setOnInsert: document }, { upsert: true }); created[countKey] += result.upsertedCount; }
    catch (error) { if (error.code !== 11000 || !await db.collection(collection).findOne({ _id: document._id }, { projection: { _id: 1 } })) throw error; }
  };
  for (const fixture of fixtures) {
    await insertOnly("hospitals", fixture.hospital, "hospitals");
    for (const inventory of fixture.inventories) await insertOnly("resourceinventories", inventory, "inventories");
    for (const capability of fixture.capabilities) await insertOnly("hospitalfacilities", capability, "capabilities");
  }
  return { database, demoOnly: true, created, accountsCreated: 0, emailsSent: 0, scenarios: fixtures.map((f) => ({ scenario: f.scenario, hospitalId: String(f.hospital._id), name: f.hospital.name })),
    warning: "Synthetic capacity and simulated observations only. Public inventory APIs must withhold demo counts. Existing fixture values are preserved on rerun; no accounts or provider memberships are created." };
}
