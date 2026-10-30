import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { ProviderMembership, PROVIDER_KINDS } from "../models/ProviderMembership.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";

export const activeOrganizationFilter = { archivedAt: null };
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

// Parent archival is effective immediately, including while membership cleanup recovers.
export async function organizationIsAvailable(kind, id) {
  const Model = kind === "hospital" ? Hospital : ResourceProvider;
  const org = await Model.findOne({ _id: id, archivedAt: null, ...(kind === "hospital" ? {} : { kind, active: { $ne: false } }) }).select("hospital").lean();
  if (!org) return false;
  return !org.hospital || Boolean(await Hospital.exists({ _id: org.hospital, archivedAt: null }));
}
export async function archivedHospitalIds() {
  return Hospital.find({ archivedAt: { $ne: null } }).distinct("_id");
}
export async function reconcileProviderArchive(kind, id) {
  const Model = kind === "hospital" ? Hospital : ResourceProvider;
  const now = new Date(), leaseToken = randomUUID();
  const org = await Model.findOneAndUpdate({ _id: id, archivedAt: { $ne: null }, archivePending: true,
    archiveAttempts: { $lt: 5 }, archiveExhaustedAt: null,
    $and: [{ $or: [{ archiveLeaseUntil: null }, { archiveLeaseUntil: { $lte: now } }] },
      { $or: [{ archiveRetryAt: null }, { archiveRetryAt: { $lte: now } }] }] },
    { $set: { archiveLeaseToken: leaseToken, archiveLeaseUntil: new Date(now.getTime() + 30000) }, $inc: { archiveAttempts: 1 } }, { new: true }).lean();
  if (!org) return false;
  const owned = { _id: id, archiveOperation: org.archiveOperation, archiveLeaseToken: leaseToken };
  try {
    const organizations = [org._id];
    if (kind === "hospital") organizations.push(...await ResourceProvider.find({ hospital: org._id }).distinct("_id"));
    // Marker preserves the exact set changed by this operation; inactive memberships stay inactive.
    await ProviderMembership.updateMany({ organization: { $in: organizations }, active: true },
      { $set: { active: false, archivedByOperation: org.archiveOperation } });
    await AuditLog.updateOne({ _id: org.archiveOperation }, { $setOnInsert: { user: org.archivedBy, action: "update",
      entityType: kind === "hospital" ? "Hospital" : "ResourceProvider", entityId: org._id,
      before: { archivedAt: null }, after: { archivedAt: org.archivedAt, archiveReason: org.archiveReason, lifecycle: "archived" },
      createdAt: org.archivedAt, updatedAt: org.archivedAt } }, { upsert: true, timestamps: false });
    const finished = await Model.updateOne({ ...owned, archiveLeaseUntil: { $gt: new Date() } }, { $set: { archivePending: false }, $unset: { archiveLeaseToken: 1, archiveLeaseUntil: 1, archiveRetryAt: 1, archiveErrorCode: 1 } });
    if (finished.modifiedCount !== 1) throw fail(409, "ARCHIVE_LEASE_LOST", "Archive processing lease expired");
  } catch (error) {
    await Model.updateOne({ ...owned, archiveLeaseUntil: { $gt: new Date() } }, { $set: { archiveRetryAt: new Date(Date.now() + Math.min(60000, 1000 * 2 ** (org.archiveAttempts - 1))), archiveErrorCode: "ARCHIVE_CLEANUP_FAILED",
      ...(org.archiveAttempts >= 5 ? { archiveExhaustedAt: new Date() } : {}) }, $unset: { archiveLeaseToken: 1, archiveLeaseUntil: 1 } });
    throw error;
  }
  return true;
}
export async function archiveProviderOrganization({ kind, id, actor, reason }) {
  if (!PROVIDER_KINDS.includes(kind) || !mongoose.isObjectIdOrHexString(id)) throw fail(400, "INVALID_ORGANIZATION", "Invalid organisation");
  if (!actor?.id || !await User.exists({ _id: actor.id, role: "system_admin", accountStatus: "active" })) throw fail(403, "ARCHIVE_FORBIDDEN", "Active System Admin required");
  if (typeof reason !== "string" || reason.trim().length < 3 || reason.trim().length > 500) throw fail(400, "ARCHIVE_REASON_REQUIRED", "An archive reason of 3–500 characters is required");
  const Model = kind === "hospital" ? Hospital : ResourceProvider;
  let org = await Model.findOneAndUpdate({ _id: id, archivedAt: null, capacityReservationCount: { $not: { $gt: 0 } }, ...(kind === "hospital" ? {} : { kind }) },
    { $set: { archivedAt: new Date(), archivedBy: actor.id, archiveReason: reason.trim(), archiveOperation: new mongoose.Types.ObjectId(), archivePending: true, archiveAttempts: 0, archiveExhaustedAt: null } }, { new: true });
  if (!org) org = await Model.findOne({ _id: id, ...(kind === "hospital" ? {} : { kind }) });
  if (!org) throw fail(404, "ORGANIZATION_NOT_FOUND", "Organisation not found");
  if (!org.archivedAt) throw fail(409, "ACTIVE_CAPACITY_ALLOCATIONS", "Resolve active reservations or admissions before archiving this organisation");
  try { await reconcileProviderArchive(kind, id); } catch { /* Durable state remains fail-closed until recovery. */ }
  const cleanupPending = Boolean(await Model.exists({ _id: id, archivePending: true }));
  return { organization: org, archived: true, cleanupPending };
}

export async function recoverProviderArchives({ limit = 50 } = {}) {
  let recovered = 0, failed = 0, exhausted = 0;
  for (const [kind, Model] of [["hospital", Hospital], [null, ResourceProvider]]) {
    const now = new Date();
    await Model.updateMany({ archivePending: true, archiveExhaustedAt: null, archiveAttempts: { $gte: 5 },
      $or: [{ archiveLeaseUntil: null }, { archiveLeaseUntil: { $lte: now } }] },
      { $set: { archiveExhaustedAt: now, archiveErrorCode: "ARCHIVE_RETRIES_EXHAUSTED" }, $unset: { archiveLeaseToken: 1, archiveLeaseUntil: 1 } });
    exhausted += await Model.countDocuments({ archivePending: true, archiveExhaustedAt: { $type: "date" } });
    const pending = await Model.find({ archivePending: true, archiveExhaustedAt: null, archiveAttempts: { $lt: 5 }, archivedAt: { $ne: null },
      $and: [{ $or: [{ archiveLeaseUntil: null }, { archiveLeaseUntil: { $lte: now } }] },
        { $or: [{ archiveRetryAt: null }, { archiveRetryAt: { $lte: now } }] }] }).select("_id kind").sort({ archiveRetryAt: 1, _id: 1 }).limit(Math.min(Math.max(limit, 1), 100)).lean();
    for (const row of pending) {
      try { if (await reconcileProviderArchive(kind || row.kind, row._id)) recovered++; } catch { failed++; }
    }
  }
  return { recovered, failed, exhausted };
}

export async function archivedOrganizationIds() {
  const hospitals = await archivedHospitalIds();
  const providers = await ResourceProvider.find({ $or: [{ archivedAt: { $ne: null } }, { hospital: { $in: hospitals } }] }).distinct("_id");
  return { hospitals, providers };
}
export async function organizationIsArchived(kind, id) {
  const Model = kind === "hospital" ? Hospital : ResourceProvider;
  // Keep the lifecycle read independent of optional contact/routing lookups.
  // A failure here still propagates; a later routing failure must not undo a
  // safely persisted application or prevent the applicant's confirmation.
  const row = await Model.findOne({ _id: id }).select("archivedAt hospital").lean();
  return Boolean(row?.archivedAt || (row?.hospital && await Hospital.exists({ _id: row.hospital, archivedAt: { $ne: null } })));
}
