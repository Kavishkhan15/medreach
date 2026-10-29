import { assertProviderPermission } from "./providerPermissions.js";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { ResourceInventory, INVENTORY_JOURNAL_LIMIT, INVENTORY_RECOVERY_MAX_ATTEMPTS } from "../models/ResourceInventory.js";
import { InventoryObservation } from "../models/InventoryObservation.js";
import { AuditLog } from "../models/AuditLog.js";
import { User } from "../models/User.js";
import { PROVIDER_KINDS } from "../models/ProviderMembership.js";
import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";

export const INVENTORY_FRESHNESS_MS = 30 * 60 * 1000;
const counts = ["capacity", "occupied", "blocked", "held"];
const fields = ["unit", ...counts, "available", "observedAt", "updatedBy", "version", "reportingMethod", "classification"];
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const snapshot = (record) => Object.fromEntries(fields.map((key) => [key, record[key] ?? null]));

export function normalizeInventoryInput(input, now = new Date()) {
  const allowed = new Set(["expectedVersion", "capacity", "occupied", "blocked", "held", "observedAt", "reportingMethod", "unit"]);
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !allowed.has(key))) throw fail(400, "INVALID_INVENTORY", "Unexpected inventory fields");
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion >= Number.MAX_SAFE_INTEGER) throw fail(400, "INVALID_VERSION", "expectedVersion must be a non-negative integer");
  const normalized = { expectedVersion: input.expectedVersion };
  for (const key of counts) {
    const value = input[key] ?? null;
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw fail(400, "INVALID_INVENTORY", "Counts must be non-negative safe integers or null");
    normalized[key] = value;
  }
  if (normalized.held !== null && normalized.held !== 0) throw fail(400, "HOLDS_DISABLED", "Inventory reservations are not enabled");
  const knownUsed = [normalized.occupied, normalized.blocked, normalized.held].filter((v) => v !== null).reduce((sum, v) => sum + BigInt(v), 0n);
  if (normalized.capacity !== null && knownUsed > BigInt(normalized.capacity)) throw fail(400, "INVALID_INVENTORY", "Used and blocked counts exceed operational capacity");
  normalized.available = counts.every((key) => normalized[key] !== null) ? normalized.capacity - normalized.occupied - normalized.blocked - normalized.held : null;
  const observedAt = typeof input.observedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input.observedAt) ? new Date(input.observedAt) : null;
  if (!observedAt || !Number.isFinite(observedAt.getTime()) || observedAt > now || now - observedAt > INVENTORY_FRESHNESS_MS) throw fail(400, "INVALID_OBSERVATION_TIME", "Inventory must be observed within the last 30 minutes and cannot be future-dated");
  if (!["manual_inventory", "provider_report"].includes(input.reportingMethod)) throw fail(400, "INVALID_REPORTING_METHOD", "A supported reporting method is required");
  if (input.unit !== undefined && (typeof input.unit !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(input.unit))) throw fail(400, "INVALID_UNIT", "Invalid resource unit");
  return { ...normalized, observedAt, reportingMethod: input.reportingMethod, unit: input.unit };
}

export function publicInventorySnapshot(record, now = new Date()) {
  const timestamp = record.observedAt ? new Date(record.observedAt).getTime() : NaN;
  const observedAt = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : null;
  const validTime = observedAt !== null && Number.isFinite(now.getTime()) && now >= observedAt;
  const fresh = validTime && now - observedAt <= INVENTORY_FRESHNESS_MS;
  const publish = Boolean(fresh && record.classification === "provider_confirmed");
  // Reads must also fail safely for legacy/imported rows that bypassed write validation.
  const capacity = publish && Number.isSafeInteger(record.capacity) && record.capacity >= 0 ? record.capacity : null;
  const available = capacity !== null && Number.isSafeInteger(record.available) && record.available >= 0 && record.available <= capacity ? record.available : null;
  const expiresAt = observedAt ? new Date(timestamp + INVENTORY_FRESHNESS_MS) : null;
  return { resourceKey: record.resourceKey, unit: record.unit, capacity,
    available, observedAt, expiresAt: expiresAt && Number.isFinite(expiresAt.getTime()) ? expiresAt : null,
    version: record.version ?? 0, classification: record.classification ?? "unknown", reportingMethod: record.reportingMethod ?? null,
    freshness: fresh ? "recent" : validTime ? "outdated" : "unknown", status: available === null ? "unknown" : available === 0 ? "unavailable" : "available" };
}

function validateTarget(kind, organizationId, resourceKey) {
  if (!PROVIDER_KINDS.includes(kind) || !mongoose.isObjectIdOrHexString(organizationId)) throw fail(400, "INVALID_ORGANIZATION", "Invalid organisation");
  if (resourceKey !== undefined && (typeof resourceKey !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(resourceKey))) throw fail(400, "INVALID_RESOURCE", "Invalid resource key");
}
async function organization(kind, id, publicRead = false, historical = false) {
  const Model = kind === "hospital" ? Hospital : ResourceProvider;
  const query = { _id: id, ...(!historical ? { archivedAt: null } : {}),
    ...(kind === "hospital" ? {} : historical ? { kind } : { kind, active: true }) };
  if (publicRead) query.approvalStatus = { $nin: ["pending", "rejected"] };
  const org = await Model.findOne(query).select("_id approvalStatus hospital").lean();
  // Check lifecycle in the initial lookup rather than reading this organisation twice.
  // Child providers still require an existing, unarchived parent for current access.
  if (!org || (!historical && org.hospital && !await Hospital.exists({ _id: org.hospital, archivedAt: null }))) throw fail(404, "ORGANIZATION_NOT_FOUND", "Organisation not found");
  return org;
}
async function assertAccess(actor, kind, organizationId, write = false) {
  if (!actor?.id || !mongoose.isObjectIdOrHexString(actor.id)) throw fail(401, "AUTHENTICATION_REQUIRED", "Authentication required");
  const current = await User.findById(actor.id).select("role accountStatus").lean();
  if (!current || current.accountStatus !== "active") throw fail(403, "ACCOUNT_INACTIVE", "Active account required");
  if (!write && current.role === "system_admin") return;
  if (current.role !== "provider_admin") throw fail(403, "INSUFFICIENT_PERMISSIONS", "An assigned Provider Admin is required");
  await assertProviderPermission({ actor, kind, organizationId, permission: write ? "inventory:write" : "inventory:read" });
}
export async function getPublicInventory({ kind, organizationId, now }) {
  validateTarget(kind, organizationId);
  await organization(kind, organizationId, true);
  const rows = await ResourceInventory.find({ kind, organization: organizationId }).select("resourceKey unit capacity available observedAt version classification reportingMethod").sort({ resourceKey: 1 }).limit(100).lean();
  // Evaluate after all database I/O so a slow read cannot extend availability.
  // Explicit times are reserved for deterministic service tests/replays, not route input.
  const evaluatedAt = now ?? new Date();
  const data = rows.map((row) => publicInventorySnapshot(row, evaluatedAt));
  if (kind === "hospital") for (const resourceKey of ["general_beds", "icu_beds"]) if (!data.some((row) => row.resourceKey === resourceKey)) data.push(publicInventorySnapshot({ resourceKey, unit: "beds", classification: "unknown" }, evaluatedAt));
  return { data };
}

async function materializeEvent(record, event, recoveryLeaseToken) {
  const observation = { inventory: record._id, kind: record.kind, organization: record.organization, resourceKey: record.resourceKey,
    version: event.version, snapshot: event.after, classification: event.after.classification, reportingMethod: event.after.reportingMethod,
    observedAt: event.after.observedAt, updatedBy: event.actor, recordedAt: event.occurredAt };
  for (const [Model, value] of [[InventoryObservation, observation], [AuditLog, { user: event.actor, action: "update", entityType: "ResourceInventory", entityId: record._id,
    before: event.before, after: event.after, ipHash: event.ipHash, requestId: event.requestId, createdAt: event.occurredAt, updatedAt: event.occurredAt }]]) {
    try { await Model.updateOne({ _id: event._id }, { $setOnInsert: value }, { upsert: true, timestamps: false }); }
    catch (error) { if (error.code !== 11000 || !await Model.exists({ _id: event._id })) throw error; }
  }
  const result = await ResourceInventory.updateOne({ _id: record._id,
    ...(recoveryLeaseToken ? { pendingEvents: { $elemMatch: { _id: event._id, recoveryLeaseToken, recoveryLeaseUntil: { $gt: new Date() } } } } : {}),
  }, { $pull: { pendingEvents: { _id: event._id,
    ...(recoveryLeaseToken ? { recoveryLeaseToken } : {}) } } }, { timestamps: false });
  if (recoveryLeaseToken && result.modifiedCount !== 1) throw fail(409, "INVENTORY_RECOVERY_LEASE_LOST", "Inventory recovery lease lost");
}
export async function reconcileInventoryJournal({ limit = 25, now = new Date(), recoverExhausted = false, actor } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError("A valid recovery time is required");
  const startedAt = Date.now();
  const recoveryTime = () => new Date(now.getTime() + Date.now() - startedAt);
  // No public route exposes this override. A future operational recovery action
  // must explicitly opt in and supply a currently active System Admin.
  if (recoverExhausted) {
    if (!actor?.id || !mongoose.isObjectIdOrHexString(actor.id)
      || !await User.exists({ _id: actor.id, role: "system_admin", accountStatus: "active" })) {
      throw fail(403, "RECOVERY_FORBIDDEN", "An active System Admin is required for exhausted inventory recovery");
    }
  }
  const bounded = Math.max(1, Math.min(100, Number.isSafeInteger(limit) ? limit : 25));
  const leaseAvailableAt = (at) => ({ $or: [{ recoveryLeaseUntil: null }, { recoveryLeaseUntil: { $lte: at } }] });
  // The final worker may die before recording its failure. Its persisted claim
  // still consumes the last attempt and becomes terminal when the lease expires.
  const crashed = { recoveryAttempts: { $gte: INVENTORY_RECOVERY_MAX_ATTEMPTS }, exhaustedAt: null, ...leaseAvailableAt(now) };
  await ResourceInventory.updateMany({ pendingEvents: { $elemMatch: crashed } }, {
    $set: { "pendingEvents.$[event].exhaustedAt": now, "pendingEvents.$[event].errorCode": "INVENTORY_RECOVERY_LEASE_EXPIRED" },
    $unset: { "pendingEvents.$[event].recoveryLeaseToken": 1, "pendingEvents.$[event].recoveryLeaseUntil": 1 },
  }, { timestamps: false, arrayFilters: [{ $and: [
    { "event.recoveryAttempts": { $gte: INVENTORY_RECOVERY_MAX_ATTEMPTS } }, { "event.exhaustedAt": null },
    { $or: [{ "event.recoveryLeaseUntil": null }, { "event.recoveryLeaseUntil": { $lte: now } }] },
  ] }] });
  const eligibleAt = (at) => ({ ...leaseAvailableAt(at), $and: [
    { $or: [{ retryAt: null }, { retryAt: { $lte: at } }] },
    { $or: [{ exhaustedAt: null, $or: [{ recoveryAttempts: { $exists: false } }, { recoveryAttempts: { $lt: INVENTORY_RECOVERY_MAX_ATTEMPTS } }] },
      ...(recoverExhausted ? [{ exhaustedAt: { $ne: null } }] : [])] },
  ] });
  const rows = await ResourceInventory.find({ pendingEvents: { $elemMatch: eligibleAt(recoveryTime()) } }).select("+pendingEvents").sort({ updatedAt: 1 }).limit(bounded).lean();
  let recovered = 0, failed = 0;
  for (const row of rows) for (const candidate of row.pendingEvents) {
    const recoveryLeaseToken = randomUUID();
    const attemptedAt = recoveryTime();
    const claimed = await ResourceInventory.findOneAndUpdate({ _id: row._id, pendingEvents: { $elemMatch: {
      _id: candidate._id, ...eligibleAt(attemptedAt), exhaustedAt: candidate.exhaustedAt ? { $ne: null } : null,
    } } }, {
      $set: { "pendingEvents.$.recoveryLeaseToken": recoveryLeaseToken,
        "pendingEvents.$.recoveryLeaseUntil": new Date(attemptedAt.getTime() + 60000), "pendingEvents.$.recoveryLastAttemptAt": attemptedAt },
      // Explicit recovery keeps the exhausted automatic budget intact.
      ...(!candidate.exhaustedAt ? { $inc: { "pendingEvents.$.recoveryAttempts": 1 } } : {}),
    }, { new: true, timestamps: false }).select("+pendingEvents").lean();
    if (!claimed) continue;
    const event = claimed.pendingEvents.find(entry => entry.recoveryLeaseToken === recoveryLeaseToken);
    try { await materializeEvent(claimed, event, recoveryLeaseToken); recovered += 1; }
    catch (error) {
      failed += 1;
      const exhausted = event.recoveryAttempts >= INVENTORY_RECOVERY_MAX_ATTEMPTS || Boolean(event.exhaustedAt);
      const errorCode = /^[A-Z0-9_]{1,80}$/.test(error?.code || "") ? error.code : "INVENTORY_RECOVERY_FAILED";
      const failedAt = recoveryTime();
      await ResourceInventory.updateOne({ _id: row._id, pendingEvents: { $elemMatch: { _id: event._id, recoveryLeaseToken } } }, {
        $set: { "pendingEvents.$.errorCode": errorCode,
          "pendingEvents.$.retryAt": new Date(failedAt.getTime() + Math.min(60000, 1000 * 2 ** Math.max(0, event.recoveryAttempts - 1))),
          ...(exhausted ? { "pendingEvents.$.exhaustedAt": event.exhaustedAt || failedAt } : {}) },
        $unset: { "pendingEvents.$.recoveryLeaseToken": 1, "pendingEvents.$.recoveryLeaseUntil": 1 },
      }, { timestamps: false });
    }
  }
  const [terminal] = await ResourceInventory.aggregate([
    { $match: { "pendingEvents.exhaustedAt": { $type: "date" } } }, { $unwind: "$pendingEvents" },
    { $match: { "pendingEvents.exhaustedAt": { $type: "date" } } }, { $count: "count" },
  ]);
  return { recovered, failed, exhausted: terminal?.count || 0, inventories: rows.length };
}
export async function updateInventory({ kind, organizationId, resourceKey, input, actor, requestId, ipHash }) {
  validateTarget(kind, organizationId, resourceKey);
  const normalized = normalizeInventoryInput(input);
  await assertAccess(actor, kind, organizationId, true);
  const org = await organization(kind, organizationId);
  if (["pending", "rejected"].includes(org.approvalStatus)) throw fail(409, "ORGANIZATION_NOT_APPROVED", "Organisation approval is required");
  const key = { kind, organization: organizationId, resourceKey };
  const before = await ResourceInventory.findOne(key).select("+pendingEvents").lean();
  if ((before?.version ?? 0) !== normalized.expectedVersion) throw fail(409, "INVENTORY_CONFLICT", "Inventory changed; refresh before submitting again");
  if (before?.observedAt && normalized.observedAt < new Date(before.observedAt)) throw fail(409, "STALE_OBSERVATION", "A newer observation already exists");
  if ((before?.pendingEvents?.length ?? 0) >= INVENTORY_JOURNAL_LIMIT) throw fail(503, "INVENTORY_RECOVERY_BACKLOG", "Inventory history recovery is required before further updates");
  const unit = normalized.unit ?? before?.unit ?? (kind === "hospital" && resourceKey.endsWith("_beds") ? "beds" : null);
  if (!unit || (before && unit !== before.unit)) throw fail(400, "INVALID_UNIT", "A stable resource unit is required");
  const { expectedVersion, unit: ignoredUnit, ...values } = normalized;
  const next = { ...values, unit, updatedBy: new mongoose.Types.ObjectId(actor.id), version: expectedVersion + 1, classification: before?.classification === "demo" ? "demo" : "provider_confirmed" };
  const event = { _id: new mongoose.Types.ObjectId(), actor: next.updatedBy, version: next.version, occurredAt: new Date(), before: before ? snapshot(before) : null, after: snapshot(next),
    ...(requestId ? { requestId: String(requestId).slice(0, 128) } : {}), ...(ipHash ? { ipHash: String(ipHash).slice(0, 64) } : {}) };
  // The snapshot and durable recovery event are one atomic document write, including on standalone MongoDB.
  let record;
  if (!before) {
    try { record = (await ResourceInventory.create({ ...key, ...next, pendingEvents: [event] })).toObject(); }
    catch (error) { if (error.code === 11000) throw fail(409, "INVENTORY_CONFLICT", "Inventory changed; refresh before submitting again"); throw error; }
  } else {
    record = await ResourceInventory.findOneAndUpdate({ _id: before._id, version: expectedVersion, "pendingEvents.99": { $exists: false },
      $or: [{ observedAt: null }, { observedAt: { $lte: normalized.observedAt } }] }, { $set: next, $push: { pendingEvents: event } }, { new: true, runValidators: true }).select("+pendingEvents").lean();
    if (!record) throw fail(409, "INVENTORY_CONFLICT", "Inventory changed; refresh before submitting again");
  }
  let historyPending = false;
  try { await materializeEvent(record, event); } catch { historyPending = true; }
  return { inventory: { _id: record._id, kind, organizationId, resourceKey, ...snapshot(record) }, historyPending };
}
export async function getInventoryHistory({ kind, organizationId, resourceKey, actor, limit = 20, before }) {
  validateTarget(kind, organizationId, resourceKey);
  await assertAccess(actor, kind, organizationId);
  await organization(kind, organizationId, false, true);
  if (!["string", "number"].includes(typeof limit) || (before !== undefined && !["string", "number"].includes(typeof before))) throw fail(400, "INVALID_PAGINATION", "Invalid inventory history pagination");
  const size = typeof limit === "number" ? limit : /^\d+$/.test(limit) ? Number(limit) : NaN;
  const cursor = before === undefined ? null : typeof before === "number" ? before : /^\d+$/.test(before) ? Number(before) : NaN;
  if (!Number.isSafeInteger(size) || size < 1 || size > 100 || (cursor !== null && (!Number.isSafeInteger(cursor) || cursor < 1))) throw fail(400, "INVALID_PAGINATION", "Invalid inventory history pagination");
  // Read the journal first: events materialized during the following read remain present in one or both sources.
  const record = await ResourceInventory.findOne({ kind, organization: organizationId, resourceKey }).select("+pendingEvents").lean();
  if (!record) return { data: [], nextCursor: null };
  const persisted = await InventoryObservation.find({ inventory: record._id, ...(cursor !== null ? { version: { $lt: cursor } } : {}) }).sort({ version: -1 }).limit(size + 1).lean();
  const union = new Map(persisted.map((row) => [String(row._id), row]));
  for (const event of record.pendingEvents) if (cursor === null || event.version < cursor) union.set(String(event._id), { _id: event._id, inventory: record._id, kind, organization: record.organization, resourceKey, version: event.version, snapshot: event.after, classification: event.after.classification, reportingMethod: event.after.reportingMethod, observedAt: event.after.observedAt, updatedBy: event.actor, recordedAt: event.occurredAt,
    historyPending: true, recoveryAttempts: event.recoveryAttempts || 0, exhaustedAt: event.exhaustedAt || null, errorCode: event.errorCode || null });
  const all = [...union.values()].sort((a, b) => b.version - a.version);
  return { data: all.slice(0, size), nextCursor: all.length > size ? all[size - 1].version : null };
}
