import { assertProviderPermission } from "./providerPermissions.js";
import { consumeOrganizationQuota } from "./organizationQuota.js";
import { organizationIsAvailable } from "./providerLifecycle.js";
import mongoose from "mongoose";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { normalizeInventoryInput, updateInventory } from "./inventoryService.js";
import { InventoryImport } from "../models/InventoryImport.js";
import { ResourceInventory } from "../models/ResourceInventory.js";
import { ProviderMembership } from "../models/ProviderMembership.js";
import { User } from "../models/User.js";
import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { AuditLog } from "../models/AuditLog.js";

const resources = (keys, unit) => keys.map(key => ({ key, unit }));
export const RESOURCE_CATALOGUE = Object.freeze({
  hospital: resources(["general_beds", "icu_beds", "nicu_beds", "picu_beds"], "beds"),
  blood_bank: resources(["o_positive_red_cells", "o_negative_red_cells", "a_positive_red_cells", "a_negative_red_cells", "b_positive_red_cells", "b_negative_red_cells", "ab_positive_red_cells", "ab_negative_red_cells"], "units"),
  diagnostic: resources(["daily_appointments"], "slots"), ambulance: resources(["operational_ambulances"], "vehicles"),
});
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const HEADER = ["resourceKey", "unit", "capacity", "occupied", "blocked", "held", "observedAt", "expectedVersion"];
function csvRecords(csv) {
  const rows = []; let row = [], field = "", quoted = false, closed = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"' && field === "" && !closed) quoted = true;
    else if (char === "," || char === "\n") {
      row.push(field.replace(/\r$/, "")); field = ""; closed = false;
      if (char === "\n") { if (row.some(Boolean)) rows.push(row); row = []; }
    } else if (closed && char !== "\r") throw fail(400, "INVALID_CSV", "Unexpected content after quoted field");
    else field += char;
  }
  if (quoted) throw fail(400, "INVALID_CSV", "Unclosed quoted field");
  row.push(field.replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function parseInventoryCsv(csv, kind, now = new Date()) {
  if (typeof csv !== "string" || Buffer.byteLength(csv) > 65536 || !Object.hasOwn(RESOURCE_CATALOGUE, kind)) throw fail(400, "INVALID_CSV", "CSV must be at most 64 KiB with a supported organisation kind");
  const [header, ...rows] = csvRecords(csv.replace(/^\uFEFF/, ""));
  if (!header || header.join(",") !== HEADER.join(",") || rows.length < 1 || rows.length > 25) throw fail(400, "INVALID_CSV", "Use the exact inventory header and 1–25 rows");
  const seen = new Set();
  return rows.map(cells => {
    if (cells.length !== HEADER.length || cells.some(value => /^[=+@]/.test(value))) throw fail(400, "INVALID_CSV", "Unexpected columns or formula values");
    const raw = Object.fromEntries(HEADER.map((key, index) => [key, cells[index].trim()]));
    const definition = RESOURCE_CATALOGUE[kind].find(resource => resource.key === raw.resourceKey && resource.unit === raw.unit);
    if (!definition || seen.has(raw.resourceKey)) throw fail(400, "INVALID_RESOURCE", "Unknown resource, wrong unit or duplicate resource row");
    seen.add(raw.resourceKey);
    const input = { unit: raw.unit, observedAt: raw.observedAt, reportingMethod: "provider_report" };
    for (const key of ["capacity", "occupied", "blocked", "held", "expectedVersion"]) {
      if (raw[key] === "" && key !== "expectedVersion") input[key] = null;
      else { if (!/^\d+$/.test(raw[key])) throw fail(400, "INVALID_CSV", "Counts and versions must be non-negative integers; blank counts mean unknown"); input[key] = Number(raw[key]); }
    }
    normalizeInventoryInput(input, now);
    return { resourceKey: raw.resourceKey, input };
  });
}
async function authorise(actor, kind, organization) {
  if (!mongoose.isObjectIdOrHexString(actor?.id) || !mongoose.isObjectIdOrHexString(organization) || !Object.hasOwn(RESOURCE_CATALOGUE, kind)) throw fail(403, "IMPORT_FORBIDDEN", "An assigned active Provider Admin is required");
  await assertProviderPermission({ actor, kind, organizationId: organization, permission: "inventory:write" });
  const [user, membership, target] = await Promise.all([
    User.exists({ _id: actor.id, role: "provider_admin", accountStatus: "active" }),
    ProviderMembership.exists({ user: actor.id, kind, organization, active: true }),
    (kind === "hospital" ? Hospital : ResourceProvider).exists({ _id: organization, archivedAt: null, approvalStatus: { $nin: ["pending", "rejected"] }, ...(kind === "hospital" ? {} : { kind, active: true }) }),
  ]);
  if (!user || !membership || !target || !await organizationIsAvailable(kind, organization)) throw fail(403, "IMPORT_FORBIDDEN", "An assigned active Provider Admin is required");
}
const publicStage = stage => ({ id: stage._id, kind: stage.kind, organization: stage.organization, digest: stage.digest, status: stage.status, terminalReason: stage.terminalReason, expiresAt: stage.expiresAt, attempts: stage.attempts, rows: stage.rows });
export async function previewInventoryImport({ actor, kind, organizationId, csv, now = new Date() }) {
  await authorise(actor, kind, organizationId);
  const rows = parseInventoryCsv(csv, kind, now);
  await consumeOrganizationQuota({ kind, organizationId, operation: "import", now });
  const digest = createHash("sha256").update(JSON.stringify({ actor: String(actor.id), kind, organizationId: String(organizationId), rows })).digest("hex");
  const stage = await InventoryImport.create({ actor: actor.id, kind, organization: organizationId, digest, commitKey: randomBytes(32).toString("hex"), rows, expiresAt: new Date(now.getTime() + 15 * 60000) });
  await AuditLog.create({ user: actor.id, action: "create", entityType: "InventoryImport", entityId: stage._id, after: { operation: "preview", rows: rows.length, digest } });
  return publicStage(stage.toObject());
}
function commitRequestId(stage, index) {
  if (!/^[a-f0-9]{64}$/.test(stage.commitKey || "")) throw fail(409, "IMPORT_COMMIT_KEY_REQUIRED", "Preview this import again");
  return `inventory-import:${stage._id}:${index}:${createHmac("sha256", stage.commitKey).update(String(index)).digest("hex")}`;
}
async function committed(stage, index) {
  const requestId = commitRequestId(stage, index);
  const inventory = await ResourceInventory.findOne({ kind: stage.kind, organization: stage.organization, resourceKey: stage.rows[index].resourceKey }).select("_id").lean();
  const audit = inventory && await AuditLog.findOne({ entityType: "ResourceInventory", entityId: inventory._id, user: stage.actor, requestId }).select("after.version").lean();
  if (audit) return audit.after.version;
  const snapshot = await ResourceInventory.findOne({ kind: stage.kind, organization: stage.organization, resourceKey: stage.rows[index].resourceKey, "pendingEvents.requestId": requestId }).select("+pendingEvents").lean();
  return snapshot?.pendingEvents.find(event => event.requestId === requestId && String(event.actor) === String(stage.actor))?.version ?? null;
}
export async function readInventoryImport({ actor, id }) {
  if (!mongoose.isObjectIdOrHexString(id) || !mongoose.isObjectIdOrHexString(actor?.id)) throw fail(400, "INVALID_IMPORT", "Invalid import ID or actor");
  const stage = await InventoryImport.findOne({ _id: id, actor: actor.id }).lean();
  if (!stage) throw fail(404, "IMPORT_NOT_FOUND", "Import not found");
  await authorise(actor, stage.kind, stage.organization);
  await recoverInventoryImports({ id });
  return publicStage(await InventoryImport.findById(id).lean());
}
export async function confirmInventoryImport({ actor, id, digest, attestProviderObserved }) {
  if (!mongoose.isObjectIdOrHexString(id) || !mongoose.isObjectIdOrHexString(actor?.id)) throw fail(400, "INVALID_IMPORT", "Invalid import ID");
  let before = await InventoryImport.findOne({ _id: id, actor: actor.id }).lean();
  if (!before) throw fail(404, "IMPORT_NOT_FOUND", "Import not found");
  await authorise(actor, before.kind, before.organization);
  await recoverInventoryImports({ id });
  before = await InventoryImport.findById(id).lean();
  if (digest !== before.digest || attestProviderObserved !== true) throw fail(400, "IMPORT_CONFIRMATION_REQUIRED", "Confirm the preview digest and that these are provider-observed values");
  if (before.status === "complete") return publicStage(before);
  if (["expired", "exhausted"].includes(before.status)) throw fail(409, "IMPORT_UNAVAILABLE", "Import expired or its retry budget is exhausted");
  const now = new Date(), leaseToken = randomUUID();
  const stage = await InventoryImport.findOneAndUpdate({ _id: id, actor: actor.id, digest, attempts: { $lt: 3 }, expiresAt: { $gt: now }, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] },
    { $set: { status: "processing", leaseToken, leaseUntil: new Date(now.getTime() + 60000) }, $inc: { attempts: 1 } }, { new: true }).select("+commitKey").lean();
  if (!stage) throw fail(409, "IMPORT_UNAVAILABLE", "Import is busy, expired or its retry budget is exhausted");
  const owned = { _id: id, leaseToken, leaseUntil: { $gt: new Date() } };
  for (let index = 0; index < stage.rows.length; index++) {
    const row = stage.rows[index]; if (["applied", "conflict"].includes(row.state)) continue;
    await authorise(actor, stage.kind, stage.organization);
    owned.leaseUntil = { $gt: new Date() };
    const renewed = await InventoryImport.updateOne(owned, { $set: { leaseUntil: new Date(Date.now() + 60000) } });
    if (renewed.matchedCount !== 1) throw fail(409, "IMPORT_LEASE_LOST", "Import processing ownership changed");
    let result;
    try {
      const version = await committed(stage, index);
      const inventoryVersion = version ?? (await updateInventory({ actor, kind: stage.kind, organizationId: String(stage.organization), resourceKey: row.resourceKey, input: row.input, requestId: commitRequestId(stage, index) })).inventory.version;
      result = { state: "applied", inventoryVersion };
    } catch (error) {
      result = { state: error.status === 409 ? "conflict" : "failed", errorCode: /^[A-Z_]{1,80}$/.test(error.code || "") ? error.code : "IMPORT_ROW_FAILED" };
    }
    owned.leaseUntil = { $gt: new Date() };
    const saved = await InventoryImport.updateOne(owned, { $set: Object.fromEntries(Object.entries(result).map(([key, value]) => [`rows.${index}.${key}`, value])) });
    if (saved.matchedCount !== 1) throw fail(409, "IMPORT_LEASE_LOST", "Import processing ownership changed");
  }
  owned.leaseUntil = { $gt: new Date() };
  const current = await InventoryImport.findOne(owned).lean();
  if (!current) throw fail(409, "IMPORT_LEASE_LOST", "Import processing ownership changed");
  const complete = current.rows.every(row => row.state === "applied");
  owned.leaseUntil = { $gt: new Date() };
  const final = await InventoryImport.findOneAndUpdate(owned, { $set: { status: complete ? "complete" : current.attempts >= 3 ? "exhausted" : "partial", ...(current.attempts >= 3 && !complete ? { terminalReason: "IMPORT_RETRIES_EXHAUSTED" } : {}), completedAt: new Date() }, $unset: { leaseToken: 1, leaseUntil: 1 } }, { new: true }).lean();
  if (!final) throw fail(409, "IMPORT_LEASE_LOST", "Import processing ownership changed");
  return publicStage(final);
}

export async function recoverInventoryImports({ id, now = new Date() } = {}) {
  const target = id ? { _id: id } : {};
  const inactiveLease = { $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] };
  const exhausted = await InventoryImport.updateMany({ ...target, status: { $in: ["processing", "partial"] }, attempts: { $gte: 3 }, ...inactiveLease },
    { $set: { status: "exhausted", terminalReason: "IMPORT_RETRIES_EXHAUSTED", completedAt: now }, $unset: { leaseToken: 1, leaseUntil: 1 } });
  const expired = await InventoryImport.updateMany({ ...target, status: { $in: ["preview", "processing", "partial"] }, expiresAt: { $lte: now }, ...inactiveLease },
    { $set: { status: "expired", terminalReason: "IMPORT_PREVIEW_EXPIRED", completedAt: now }, $unset: { leaseToken: 1, leaseUntil: 1 } });
  const recovered = await InventoryImport.updateMany({ ...target, status: "processing", attempts: { $lt: 3 }, expiresAt: { $gt: now }, leaseUntil: { $lte: now } },
    { $set: { status: "partial", terminalReason: "IMPORT_INTERRUPTED_RETRY_REQUIRED" }, $unset: { leaseToken: 1, leaseUntil: 1 } });
  return { exhausted: exhausted.modifiedCount, expired: expired.modifiedCount, recovered: recovered.modifiedCount };
}
