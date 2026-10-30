import mongoose from "mongoose";
import { ResourceReservation } from "../models/ResourceReservation.js";
import { ResourceInventory } from "../models/ResourceInventory.js";
import { DiagnosticDailyCapacity } from "../models/DiagnosticDailyCapacity.js";
import { DIAGNOSTIC_TESTS } from "../models/DiagnosticRequest.js";
import { InventoryObservation } from "../models/InventoryObservation.js";
import { AuditLog } from "../models/AuditLog.js";
import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { assertProviderPermission } from "./providerPermissions.js";

export const CAPACITY_HOLD_MS = 10 * 60 * 1000;
const FRESH_MS = 30 * 60 * 1000;
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const activeStates = ["held", "confirmed", "admitted"];
const validId = value => mongoose.isObjectIdOrHexString(value);
const validCount = value => Number.isSafeInteger(value) && value >= 0;
const transaction = session => {
  if (!session?.inTransaction()) throw fail(503, "CAPACITY_TRANSACTIONS_REQUIRED", "Capacity allocation requires a MongoDB replica set transaction");
};
const time = now => {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw fail(400, "INVALID_CAPACITY_TIME", "A valid capacity time is required");
  return now;
};
export function capacityLocalDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(time(now));
}
function validDate(date) {
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(new Date(`${date}T00:00:00Z`).getTime())
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}
function target(kind, organizationId, resourceKey) {
  if (!["hospital", "blood_bank", "diagnostic"].includes(kind) || !validId(organizationId)
    || (resourceKey !== undefined && (typeof resourceKey !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(resourceKey)))) {
    throw fail(400, "INVALID_CAPACITY_RESOURCE", "Invalid capacity resource");
  }
}
function requestIdentity(requestType, requestId) {
  if (!["hospital", "blood", "diagnostic"].includes(requestType) || !validId(requestId)) throw fail(400, "INVALID_CAPACITY_REQUEST", "Invalid capacity request");
}
async function organizationAvailable(kind, organizationId, session) {
  const Model = kind === "hospital" ? Hospital : ResourceProvider;
  const query = { _id: organizationId, archivedAt: null, archivePending: { $ne: true }, approvalStatus: "approved",
    ...(kind === "hospital" ? {} : { kind, active: true }) };
  const org = await Model.findOne(query).select("_id hospital demo").session(session || null).lean();
  if (!org || (org.hospital && !await Hospital.exists({ _id: org.hospital, archivedAt: null, archivePending: { $ne: true } }).session(session || null))) {
    throw fail(409, "CAPACITY_ORGANIZATION_UNAVAILABLE", "The provider is not approved and active for reservations");
  }
  return org;
}
function view(row) {
  return { id: String(row._id), resourceKey: row.resourceKey, quantity: row.quantity, state: row.state,
    expiresAt: row.expiresAt || null, urgency: row.urgency };
}
// A shared organisation write serialises allocation with archival. Child-provider
// allocations also guard their parent hospital, so archival cannot orphan holds.
async function adjustOrganizationReservations(kind, organizationId, delta, session) {
  const Model = kind === "hospital" ? Hospital : ResourceProvider;
  const filter = { _id: organizationId, ...(delta > 0 ? { archivedAt: null, archivePending: { $ne: true }, approvalStatus: "approved",
    ...(kind === "hospital" ? {} : { kind, active: true }) } : { capacityReservationCount: { $gte: -delta } }) };
  const org = await Model.findOneAndUpdate(filter, { $inc: { capacityReservationCount: delta } }, { session, new: true }).select("hospital").lean();
  if (!org) throw fail(409, "CAPACITY_ORGANIZATION_UNAVAILABLE", "Provider lifecycle or active allocation count changed");
  if (org.hospital) {
    const parent = await Hospital.updateOne({ _id: org.hospital, ...(delta > 0 ? { archivedAt: null, archivePending: { $ne: true } }
      : { capacityReservationCount: { $gte: -delta } }) }, { $inc: { capacityReservationCount: delta } }, { session });
    if (parent.modifiedCount !== 1) throw fail(409, "CAPACITY_ORGANIZATION_UNAVAILABLE", "The parent hospital cannot accept this allocation change");
  }
}
async function audit({ session, entityType, entityId, before, after, actorId }) {
  await AuditLog.create([{ action: "update", entityType, entityId, before, after, ...(validId(actorId) ? { user: actorId } : {}) }], { session });
}
async function inventoryHistory(record, actorId, session, now) {
  const actor = validId(actorId) ? actorId : record.updatedBy;
  if (!actor) throw fail(409, "CAPACITY_PROVENANCE_REQUIRED", "Verified inventory requires an accountable provider observer");
  const snapshot = Object.fromEntries(["capacity", "occupied", "blocked", "held", "available", "observedAt", "version", "classification", "reportingMethod", "unit"].map(key => [key, record[key] ?? null]));
  await InventoryObservation.create([{ inventory: record._id, kind: record.kind, organization: record.organization,
    resourceKey: record.resourceKey, version: record.version, snapshot, classification: record.classification,
    reportingMethod: record.reportingMethod, observedAt: record.observedAt, updatedBy: actor, recordedAt: now }], { session });
}

export async function withCapacityTransaction(work) {
  // Opt-in operations must not rely on Mongoose creating production indexes.
  for (const Model of [ResourceReservation, DiagnosticDailyCapacity]) {
    const indexes = await Model.collection.indexes().catch(error => { if (error.code === 26) return []; throw error; });
    for (const [key] of Model.schema.indexes().filter(([, options]) => options.unique)) {
      if (!indexes.some(index => index.unique && JSON.stringify(index.key) === JSON.stringify(key) && !index.sparse && !index.partialFilterExpression)) {
        throw fail(503, "CAPACITY_MIGRATION_REQUIRED", "Capacity indexes are missing; apply the reviewed additive capacity migration first");
      }
    }
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); }, {
      readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, maxCommitTimeMS: 10000,
    });
    return result;
  } catch (error) {
    if (error.code === 20 || /Transaction numbers are only allowed|does not support retryable writes/.test(error.message || "")) {
      throw fail(503, "CAPACITY_TRANSACTIONS_REQUIRED", "Reservations require a MongoDB replica set; no capacity was deducted");
    }
    throw error;
  } finally { await session.endSession(); }
}

export async function inventoryReservationsEnabled({ kind, organizationId, resourceKey }) {
  target(kind, organizationId, resourceKey);
  return Boolean(await ResourceInventory.exists({ kind, organization: organizationId, resourceKey, reservationsEnabled: true }));
}
export async function diagnosticReservationsEnabled({ organizationId, tests, date }) {
  target("diagnostic", organizationId);
  if (!Array.isArray(tests) || tests.some(test => !DIAGNOSTIC_TESTS.includes(test)) || !validDate(date)) throw fail(400, "INVALID_DIAGNOSTIC_CAPACITY", "Invalid tests or date");
  return process.env.DIAGNOSTIC_CAPACITY_ENABLED === "true" || Boolean(await DiagnosticDailyCapacity.exists({ organization: organizationId, test: { $in: tests }, date, enabled: true }));
}
export const getDiagnosticCapacityMode = diagnosticReservationsEnabled;
export async function getRequestReservationMode({ requestType, requestId }) {
  requestIdentity(requestType, requestId);
  return Boolean(await ResourceReservation.exists({ requestType, requestId }));
}
export async function getRequestReservations({ requestType, requestId, session }) {
  requestIdentity(requestType, requestId);
  const rows = await ResourceReservation.find({ requestType, requestId }).session(session || null).sort({ resourceKey: 1 }).lean();
  return rows.map(view);
}

export async function holdInventory({ session, requestType, requestId, kind, organizationId, resourceKey, quantity = 1, actorId, now = new Date() }) {
  const startedAt = Date.now();
  transaction(session); requestIdentity(requestType, requestId); target(kind, organizationId, resourceKey); time(now);
  if ((requestType === "hospital" && kind !== "hospital") || (requestType === "blood" && kind !== "blood_bank") || requestType === "diagnostic"
    || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw fail(400, "INVALID_CAPACITY_QUANTITY", "Invalid reservation quantity or resource type");
  await organizationAvailable(kind, organizationId, session);
  const existing = await ResourceReservation.findOne({ requestType, requestId, resourceKey }).session(session).lean();
  if (existing) {
    if (existing.quantity !== quantity || String(existing.organization) !== String(organizationId)) throw fail(409, "CAPACITY_IDEMPOTENCY_CONFLICT", "Reservation payload changed");
    return { mode: existing.state, reservation: view(existing), expiresAt: existing.expiresAt };
  }
  const row = await ResourceInventory.findOne({ kind, organization: organizationId, resourceKey }).session(session).lean();
  if (!row?.reservationsEnabled) return { mode: "coordination", reason: "CAPACITY_NOT_CONFIGURED" };
  now = new Date(now.getTime() + Date.now() - startedAt);
  const counts = [row.capacity, row.occupied, row.blocked, row.held, row.available];
  if (row.classification !== "provider_confirmed" || !counts.every(validCount) || row.available !== row.capacity - row.occupied - row.blocked - row.held
    || !row.observedAt || now < row.observedAt || now - row.observedAt > FRESH_MS) return { mode: "coordination", reason: "AVAILABILITY_UNKNOWN" };
  if (kind === "blood_bank" && (!row.stockExpiresAt || row.stockExpiresAt <= now)) return { mode: "coordination", reason: "STOCK_EXPIRY_UNVERIFIED" };
  if (row.available < quantity) throw fail(409, "CAPACITY_FULL", "The requested resource has no remaining verified capacity");
  const expiresAt = new Date(Math.min(now.getTime() + CAPACITY_HOLD_MS, kind === "blood_bank" ? row.stockExpiresAt.getTime() : Infinity));
  const updated = await ResourceInventory.findOneAndUpdate({ _id: row._id, version: row.version, available: { $gte: quantity }, reservationsEnabled: true }, {
    $inc: { available: -quantity, held: quantity, version: 1 },
  }, { session, new: true }).lean();
  if (!updated) throw fail(409, "CAPACITY_CONFLICT", "Capacity changed; retry the request");
  const [reservation] = await ResourceReservation.create([{ requestType, requestId, kind, organization: organizationId, resourceKey,
    inventory: row._id, quantity, expiresAt, state: "held", history: [{ state: "held", at: now, actor: actorId }] }], { session });
  await adjustOrganizationReservations(kind, organizationId, 1, session);
  await inventoryHistory(updated, actorId, session, now);
  await audit({ session, entityType: "ResourceReservation", entityId: reservation._id, before: null, after: view(reservation), actorId });
  return { mode: "held", reservation: view(reservation), expiresAt };
}

export async function holdDiagnosticTests({ session, requestId, organizationId, tests, date, urgency = "routine", actorId, now = new Date() }) {
  transaction(session); requestIdentity("diagnostic", requestId); target("diagnostic", organizationId); time(now);
  if (!validDate(date) || date < capacityLocalDate(now) || !Array.isArray(tests) || !tests.length || tests.length > 4
    || new Set(tests).size !== tests.length || tests.some(test => !DIAGNOSTIC_TESTS.includes(test)) || !["routine", "urgent"].includes(urgency)) {
    throw fail(400, "INVALID_DIAGNOSTIC_CAPACITY", "Invalid appointment date, tests or urgency");
  }
  await organizationAvailable("diagnostic", organizationId, session);
  const existing = await ResourceReservation.find({ requestType: "diagnostic", requestId }).session(session).lean();
  if (existing.length) {
    if (existing.length !== tests.length || existing.some(row => !tests.includes(row.resourceKey) || String(row.organization) !== String(organizationId) || row.urgency !== urgency)) throw fail(409, "CAPACITY_IDEMPOTENCY_CONFLICT", "Reservation payload changed");
    return { mode: existing[0].state, reservations: existing.map(view), expiresAt: existing[0].expiresAt };
  }
  if (process.env.DIAGNOSTIC_CAPACITY_ENABLED === "true") {
    for (const test of tests) await DiagnosticDailyCapacity.updateOne({ organization: organizationId, test, date }, { $setOnInsert: {
      organization: organizationId, test, date, capacity: 30, urgentCapacity: 0, held: 0, occupied: 0,
      urgentHeld: 0, urgentOccupied: 0, enabled: true, classification: "platform_policy", verifiedAt: now, version: 1,
    } }, { upsert: true, session });
  }
  const rows = await DiagnosticDailyCapacity.find({ organization: organizationId, test: { $in: tests }, date }).session(session).lean();
  if (rows.length !== tests.length || rows.some(row => !row.enabled || !["provider_confirmed", "platform_policy"].includes(row.classification))) return { mode: "coordination", reservations: [], reason: "CAPACITY_NOT_CONFIGURED" };
  // Emergency selection requests review rather than silently overriding a full
  // day or stealing a routine patient's appointment. No partial holds are made.
  if (urgency === "urgent" && rows.some(row => row.urgentCapacity - row.urgentHeld - row.urgentOccupied < 1 || row.held + row.occupied >= row.capacity)) {
    return { mode: "coordination", reservations: [], reason: "EMERGENCY_CAPACITY_REVIEW_REQUIRED" };
  }
  const reservations = [];
  const expiresAt = new Date(now.getTime() + CAPACITY_HOLD_MS);
  for (const row of rows) {
    const totalUsed = row.held + row.occupied;
    const urgentUsed = row.urgentHeld + row.urgentOccupied;
    const remaining = urgency === "urgent" ? row.urgentCapacity - urgentUsed : row.capacity - row.urgentCapacity - (totalUsed - urgentUsed);
    if (![row.capacity, row.urgentCapacity, row.held, row.occupied, row.urgentHeld, row.urgentOccupied].every(validCount)
      || row.urgentCapacity > row.capacity || urgentUsed > totalUsed || totalUsed > row.capacity) throw fail(409, "CAPACITY_INCONSISTENT", "The provider must reconcile daily capacity");
    if (remaining < 1 || totalUsed >= row.capacity) throw fail(409, urgency === "urgent" ? "URGENT_CAPACITY_FULL" : "CAPACITY_FULL", `No ${urgency} appointments remain for ${row.test} on ${date}`);
    const updated = await DiagnosticDailyCapacity.updateOne({ _id: row._id, version: row.version, enabled: true }, {
      $inc: { held: 1, version: 1, ...(urgency === "urgent" ? { urgentHeld: 1 } : {}) },
    }, { session });
    if (updated.modifiedCount !== 1) throw fail(409, "CAPACITY_CONFLICT", "Appointment capacity changed; retry");
    const [reservation] = await ResourceReservation.create([{ requestType: "diagnostic", requestId, kind: "diagnostic", organization: organizationId,
      resourceKey: row.test, dailyCapacity: row._id, quantity: 1, urgency, expiresAt, state: "held", history: [{ state: "held", at: now, actor: actorId }] }], { session });
    await adjustOrganizationReservations("diagnostic", organizationId, 1, session);
    await audit({ session, entityType: "ResourceReservation", entityId: reservation._id, before: null, after: view(reservation), actorId });
    reservations.push(view(reservation));
  }
  return { mode: "held", reservations, expiresAt };
}

export async function transitionReservations({ session, requestType, requestId, action, actorId, now = new Date() }) {
  requestIdentity(requestType, requestId); time(now);
  const rules = { confirm: ["held", "confirmed"], release: ["held", "confirmed", "released"], expire: ["held", "expired"],
    admit: ["confirmed", "admitted"], discharge: ["admitted", "discharged"], issue: ["confirmed", "issued"], complete: ["confirmed", "completed"] };
  if (!rules[action]) throw fail(400, "INVALID_RESERVATION_ACTION", "Invalid reservation transition");
  const rows = await ResourceReservation.find({ requestType, requestId }).session(session || null).sort({ resourceKey: 1 }).lean();
  if (!rows.length) return { changed: 0, reservations: [] };
  transaction(session);
  const nextState = { confirm: "confirmed", release: "released", expire: "expired", admit: "admitted", discharge: "discharged", issue: "issued", complete: "completed" }[action];
  let changed = 0;
  const results = [];
  for (const row of rows) {
    if (row.state === nextState || (action === "release" && row.state === "expired")) { results.push(view(row)); continue; }
    if (!rules[action].includes(row.state)) throw fail(409, ["released", "expired"].includes(row.state) ? "HOLD_EXPIRED" : "INVALID_RESERVATION_STATE", "The reservation no longer permits this transition");
    if (action !== "release" && action !== "expire" && row.state === "held" && (!row.expiresAt || row.expiresAt <= now)) throw fail(409, "HOLD_EXPIRED", "The temporary hold expired; submit a new request");
    if ((action === "admit" || action === "discharge") && requestType !== "hospital"
      || action === "issue" && requestType !== "blood" || action === "complete" && requestType !== "diagnostic") throw fail(400, "INVALID_RESERVATION_ACTION", "This action is not supported for the resource");
    if (action === "confirm") await organizationAvailable(row.kind, row.organization, session);
    const release = action === "release" || action === "expire";
    const consume = ["admit", "issue", "complete"].includes(action);
    if (row.inventory && (release || consume || action === "discharge")) {
      const filter = { _id: row.inventory, ...(action === "discharge" ? { occupied: { $gte: row.quantity } } : { held: { $gte: row.quantity } }) };
      const inc = action === "discharge" ? { occupied: -row.quantity, available: row.quantity }
        : release ? { held: -row.quantity, available: row.quantity }
          : action === "issue" ? { held: -row.quantity, capacity: -row.quantity }
            : { held: -row.quantity, occupied: row.quantity };
      const inventory = await ResourceInventory.findOneAndUpdate(filter, { $inc: { ...inc, version: 1 } }, { session, new: true }).lean();
      if (!inventory) throw fail(409, "CAPACITY_INCONSISTENT", "Inventory requires reconciliation before releasing or consuming a reservation");
      await inventoryHistory(inventory, actorId, session, now);
    }
    if (row.dailyCapacity && (release || consume)) {
      const inc = { held: -row.quantity, ...(consume ? { occupied: row.quantity } : {}),
        ...(row.urgency === "urgent" ? { urgentHeld: -row.quantity, ...(consume ? { urgentOccupied: row.quantity } : {}) } : {}), version: 1 };
      const updated = await DiagnosticDailyCapacity.updateOne({ _id: row.dailyCapacity, held: { $gte: row.quantity },
        ...(row.urgency === "urgent" ? { urgentHeld: { $gte: row.quantity } } : {}) }, { $inc: inc }, { session });
      if (updated.modifiedCount !== 1) throw fail(409, "CAPACITY_INCONSISTENT", "Daily appointment capacity requires reconciliation");
    }
    const updated = await ResourceReservation.findOneAndUpdate({ _id: row._id, version: row.version, state: row.state }, {
      $set: { state: nextState, expiresAt: null }, $inc: { version: 1 }, $push: { history: { state: nextState, at: now, actor: actorId } },
    }, { session, new: true }).lean();
    if (!updated) throw fail(409, "CAPACITY_CONFLICT", "Reservation changed; retry");
    if (["released", "expired", "issued", "completed", "discharged"].includes(nextState)) await adjustOrganizationReservations(row.kind, row.organization, -1, session);
    await audit({ session, entityType: "ResourceReservation", entityId: row._id, before: view(row), after: view(updated), actorId });
    results.push(view(updated)); changed++;
  }
  return { changed, reservations: results, mode: nextState, expiresAt: null };
}

export async function expireReservations({ limit = 50, now = new Date(), onExpire } = {}) {
  time(now);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new TypeError("Expiry batch limit must be between 1 and 100");
  const rows = await ResourceReservation.find({ state: "held", expiresAt: { $lte: now } }).sort({ expiresAt: 1, _id: 1 }).limit(limit).select("requestType requestId").lean();
  const identities = new Map(rows.map(row => [`${row.requestType}:${row.requestId}`, row]));
  let expired = 0;
  for (const row of identities.values()) await withCapacityTransaction(async session => {
    const stillExpired = await ResourceReservation.exists({ requestType: row.requestType, requestId: row.requestId, state: "held", expiresAt: { $lte: now } }).session(session);
    if (!stillExpired) return;
    const result = await transitionReservations({ session, requestType: row.requestType, requestId: row.requestId, action: "expire", now });
    if (onExpire) await onExpire({ session, requestType: row.requestType, requestId: row.requestId, reservations: result.reservations, now });
    expired += result.changed;
  });
  return { expired, requests: identities.size };
}

export async function configureInventoryReservations({ kind, organizationId, resourceKey, input, actor }) {
  target(kind, organizationId, resourceKey);
  if (!["hospital", "blood_bank"].includes(kind) || typeof resourceKey !== "string" || !input || Object.keys(input).some(key => !["enabled", "expectedVersion", "stockExpiresAt"].includes(key))
    || typeof input.enabled !== "boolean" || !validCount(input.expectedVersion)) throw fail(400, "INVALID_CAPACITY_CONFIG", "Expected version and explicit enabled flag are required");
  await assertProviderPermission({ actor, kind, organizationId, permission: "inventory:write" });
  return withCapacityTransaction(async session => {
    await organizationAvailable(kind, organizationId, session);
    const row = await ResourceInventory.findOne({ kind, organization: organizationId, resourceKey }).session(session).lean();
    if (!row || row.version !== input.expectedVersion) throw fail(409, "INVENTORY_CONFLICT", "Refresh inventory before changing reservation configuration");
    if (await ResourceReservation.exists({ inventory: row._id, state: { $in: activeStates } }).session(session)) throw fail(409, "ACTIVE_RESERVATIONS", "Resolve active reservations before changing configuration");
    const now = new Date();
    const stockExpiresAt = input.stockExpiresAt === undefined ? row.stockExpiresAt : input.stockExpiresAt === null ? null : new Date(input.stockExpiresAt);
    if (stockExpiresAt && !Number.isFinite(stockExpiresAt.getTime())) throw fail(400, "INVALID_STOCK_EXPIRY", "Invalid stock expiry");
    if (input.enabled && (row.classification !== "provider_confirmed" || ![row.capacity, row.occupied, row.blocked, row.held, row.available].every(validCount)
      || row.held !== 0 || row.available !== row.capacity - row.occupied - row.blocked || !row.updatedBy
      || !row.observedAt || now < row.observedAt || now - row.observedAt > FRESH_MS)) throw fail(409, "VERIFIED_CAPACITY_REQUIRED", "Fresh provider-confirmed inventory is required before enabling reservations");
    if (input.enabled && kind === "blood_bank" && (!stockExpiresAt || stockExpiresAt <= now)) throw fail(400, "INVALID_STOCK_EXPIRY", "Blood inventory requires a verified future stock expiry");
    const updated = await ResourceInventory.findOneAndUpdate({ _id: row._id, version: input.expectedVersion }, {
      $set: { reservationsEnabled: input.enabled, stockExpiresAt }, $inc: { version: 1 },
    }, { session, new: true }).lean();
    if (!updated) throw fail(409, "INVENTORY_CONFLICT", "Inventory changed");
    await inventoryHistory(updated, actor.id, session, now);
    await audit({ session, entityType: "ResourceInventory", entityId: row._id, before: { reservationsEnabled: row.reservationsEnabled }, after: { reservationsEnabled: updated.reservationsEnabled, stockExpiresAt }, actorId: actor.id });
    return { inventory: updated };
  });
}

export async function configureDiagnosticCapacity({ organizationId, input, actor }) {
  target("diagnostic", organizationId);
  if (!input || Object.keys(input).some(key => !["test", "date", "capacity", "urgentCapacity", "expectedVersion", "enabled"].includes(key))
    || !DIAGNOSTIC_TESTS.includes(input.test) || !validDate(input.date) || input.date < capacityLocalDate() || input.date > capacityLocalDate(new Date(Date.now() + 180 * 86400000))
    || ![input.capacity, input.urgentCapacity, input.expectedVersion].every(validCount) || input.capacity > 30 || input.urgentCapacity > input.capacity
    || (input.enabled !== undefined && typeof input.enabled !== "boolean")) throw fail(400, "INVALID_DIAGNOSTIC_CAPACITY", "Valid test, date, capacity, urgent allocation and expected version are required");
  await assertProviderPermission({ actor, kind: "diagnostic", organizationId, permission: "inventory:write" });
  return withCapacityTransaction(async session => {
    const org = await organizationAvailable("diagnostic", organizationId, session);
    if (org.demo) throw fail(409, "DEMO_CAPACITY_ONLY", "Demo providers cannot publish verified appointment capacity");
    const key = { organization: organizationId, test: input.test, date: input.date };
    const before = await DiagnosticDailyCapacity.findOne(key).session(session).lean();
    if ((before?.version || 0) !== input.expectedVersion) throw fail(409, "CAPACITY_CONFLICT", "Daily capacity changed; refresh before saving");
    const used = (before?.held || 0) + (before?.occupied || 0), urgentUsed = (before?.urgentHeld || 0) + (before?.urgentOccupied || 0);
    if (used > input.capacity || urgentUsed > input.urgentCapacity || used - urgentUsed > input.capacity - input.urgentCapacity
      || (input.enabled === false && before && await ResourceReservation.exists({ dailyCapacity: before._id, state: { $in: activeStates } }).session(session))) throw fail(409, "ACTIVE_RESERVATIONS", "Capacity cannot invalidate existing appointments");
    const values = { capacity: input.capacity, urgentCapacity: input.urgentCapacity, enabled: input.enabled ?? true,
      classification: "provider_confirmed", verifiedAt: new Date(), updatedBy: actor.id, version: input.expectedVersion + 1 };
    let row;
    if (before) row = await DiagnosticDailyCapacity.findOneAndUpdate({ _id: before._id, version: input.expectedVersion }, { $set: values }, { session, new: true }).lean();
    else [row] = await DiagnosticDailyCapacity.create([{ ...key, ...values }], { session });
    if (!row) throw fail(409, "CAPACITY_CONFLICT", "Daily capacity changed");
    await audit({ session, entityType: "DiagnosticDailyCapacity", entityId: row._id, before, after: values, actorId: actor.id });
    return { capacity: row };
  });
}
