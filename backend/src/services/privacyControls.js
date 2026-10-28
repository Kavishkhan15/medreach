import { assertProviderPermission } from "./providerPermissions.js";
import { consumeOrganizationQuota } from "./organizationQuota.js";
import mongoose from "mongoose";
import { randomBytes, createHash } from "node:crypto";
import { DataExport } from "../models/DataExport.js";
import { ResourceInventory } from "../models/ResourceInventory.js";
import { PROVIDER_KINDS } from "../models/ProviderMembership.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";
import { organizationIsAvailable } from "./providerLifecycle.js";
import { publicInventorySnapshot } from "./inventoryService.js";
export const RETENTION_POLICY = Object.freeze({ version: "draft-1", status: "unapproved", automaticDeletionEnabled: false,
  categories: ["requests", "notification_content", "uploads", "operational_logs", "availability_observations", "backups"].map(category => ({ category, retentionDays: null, action: "preserve_pending_policy_approval" })) });
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const digest = value => createHash("sha256").update(value).digest("hex");
export async function assertExportScope(actor, kind, organizationId) {
  if (!actor?.id || !mongoose.isObjectIdOrHexString(actor.id)) throw fail(401, "AUTHENTICATION_REQUIRED", "Authentication required");
  if (!PROVIDER_KINDS.includes(kind) || !mongoose.isObjectIdOrHexString(organizationId)) throw fail(400, "INVALID_ORGANIZATION", "Invalid organisation");
  const user = await User.findById(actor.id).select("role accountStatus").lean();
  if (!user || user.accountStatus !== "active" || !["system_admin", "provider_admin"].includes(user.role)) throw fail(403, "EXPORT_FORBIDDEN", "Export not permitted");
  if (user.role !== "system_admin") await assertProviderPermission({ actor, kind, organizationId, permission: "inventory:read" });
  if (!await organizationIsAvailable(kind, organizationId)) throw fail(404, "ORGANIZATION_NOT_FOUND", "Organisation not found");
}
// Explicit field list: no actor IDs, audit journals, contacts or request content.
export const exportInventoryFields = "resourceKey unit capacity available observedAt version classification reportingMethod";
export function exportInventoryRow(row, now = new Date()) {
  return publicInventorySnapshot(Object.fromEntries(exportInventoryFields.split(" ").map(key => [key, row[key]])), now);
}
export async function createScopedExport({ actor, kind, organizationId, dataset, requestId }) {
  if (dataset !== "current_inventory") throw fail(400, "UNSUPPORTED_EXPORT", "Only current inventory export is enabled");
  await assertExportScope(actor, kind, organizationId);
  await consumeOrganizationQuota({ kind, organizationId, operation: "export" });
  const pending = await DataExport.countDocuments({ requestedBy: actor.id, consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  if (pending >= 5) throw fail(429, "EXPORT_LIMIT", "Download or allow current exports to expire before creating more");
  const rows = await ResourceInventory.find({ kind, organization: organizationId }).select(exportInventoryFields).sort({ resourceKey: 1 }).limit(201).lean();
  if (rows.length > 200) throw fail(413, "EXPORT_TOO_LARGE", "Export exceeds the current 200-resource limit");
  const token = randomBytes(32).toString("base64url"), expiresAt = new Date(Date.now() + 600000);
  // Fail closed if the creation audit cannot be persisted.
  const exportId = new mongoose.Types.ObjectId();
  await AuditLog.create({ user: actor.id, action: "create", entityType: "DataExport", entityId: exportId,
    requestId, after: { dataset, kind, organization: organizationId, rowCount: rows.length, expiresAt } });
  await DataExport.create({ _id: exportId, requestedBy: actor.id, kind, organization: organizationId, dataset,
    tokenHash: digest(token), expiresAt, rows: rows.map(row => exportInventoryRow(row)) });
  return { id: exportId, token, expiresAt, rowCount: rows.length, dataset };
}
export async function consumeScopedExport({ actor, id, token, requestId }) {
  if (!mongoose.isObjectIdOrHexString(id) || typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw fail(404, "EXPORT_NOT_FOUND", "Export unavailable");
  const entry = await DataExport.findOne({ _id: id, requestedBy: actor.id, tokenHash: digest(token),
    consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).select("kind organization dataset").lean();
  if (!entry) throw fail(404, "EXPORT_NOT_FOUND", "Export unavailable");
  // Membership revocation between creation/download takes effect immediately.
  await assertExportScope(actor, entry.kind, entry.organization);
  await AuditLog.create({ user: actor.id, action: "update", entityType: "DataExport", entityId: entry._id,
    requestId, after: { operation: "download_attempt", dataset: entry.dataset } });
  const claimed = await DataExport.findOneAndUpdate({ _id: entry._id, requestedBy: actor.id, tokenHash: digest(token),
    consumedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { new: true }).select("+rows").lean();
  if (!claimed) throw fail(409, "EXPORT_ALREADY_CONSUMED", "Export has already been downloaded or expired");
  return { dataset: claimed.dataset, kind: claimed.kind, organization: claimed.organization,
    createdAt: claimed.createdAt, downloadedAt: new Date(), note: "Snapshot at export creation; confirm current availability with the provider.",
    rows: claimed.rows.map(row => exportInventoryRow(row)) };
}
