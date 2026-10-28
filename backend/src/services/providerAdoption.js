import { guardAdminMutation } from "./adminMutationGuard.js";
import { InventoryObservation } from "../models/InventoryObservation.js";
import { RequestNotification } from "../models/RequestNotification.js";
import mongoose from "mongoose";
import { createHash, randomUUID } from "node:crypto";
import { ProviderGroup, ProviderOnboarding, ProviderOffboarding } from "../models/providerAdoptionModels.js";
import { ProviderMembership, PROVIDER_KINDS } from "../models/ProviderMembership.js";
import { User } from "../models/User.js";
import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { ResourceInventory } from "../models/ResourceInventory.js";
import { InventoryImport } from "../models/InventoryImport.js";
import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { BloodRequest } from "../models/BloodRequest.js";
import { AmbulanceBooking } from "../models/AmbulanceBooking.js";
import { AuthToken } from "../models/AuthToken.js";
import { AuditLog } from "../models/AuditLog.js";
import { organizationIsAvailable } from "./providerLifecycle.js";
import { publicInventorySnapshot } from "./inventoryService.js";

const fail = (status, code, message) => Object.assign(new Error(message || code), { status, code });
const objectId = value => mongoose.isObjectIdOrHexString(value);
const hash = value => createHash("sha256").update(value).digest("hex");
const checklistKeys = ["ownershipReviewed", "contactReviewed", "reportingAgreed", "escalationAgreed", "responsibilitiesAccepted"];
function version(value) { if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) throw fail(400, "INVALID_VERSION"); return value; }
function target(kind, id) { if (!PROVIDER_KINDS.includes(kind) || !objectId(id)) throw fail(400, "INVALID_ORGANIZATION"); }
export function validateBranchGroup(input) {
  if (!input || typeof input.name !== "string" || input.name.trim().length < 2 || input.name.length > 120 || !Array.isArray(input.branches) || input.branches.length > 100 || Object.keys(input).some(key => !["name", "branches", "expectedVersion"].includes(key))) throw fail(400, "INVALID_GROUP");
  const seen = new Set();
  const branches = input.branches.map(row => { if (!row || typeof row !== "object" || Array.isArray(row)) throw fail(400, "INVALID_BRANCH"); target(row.kind, row.organizationId); const key = `${row.kind}:${String(row.organizationId).toLowerCase()}`; if (seen.has(key) || Object.keys(row).some(field => !["kind", "organizationId"].includes(field))) throw fail(400, "DUPLICATE_BRANCH"); seen.add(key); return { kind: row.kind, organization: row.organizationId }; });
  return { name: input.name.trim(), branches, expectedVersion: version(input.expectedVersion) };
}
export function validateOnboarding(input) {
  if (!input || !["draft", "ready", "suspended"].includes(input.status) || typeof input.reason !== "string" || input.reason.trim().length < 10 || input.reason.length > 500 || !input.checklist || Array.isArray(input.checklist) || typeof input.checklist !== "object" || Object.keys(input.checklist).some(key => !checklistKeys.includes(key)) || Object.keys(input).some(key => !["status", "reason", "checklist", "evidenceRefs", "expectedVersion"].includes(key))) throw fail(400, "INVALID_ONBOARDING");
  const checklist = Object.fromEntries(checklistKeys.map(key => { if (input.checklist[key] !== undefined && typeof input.checklist[key] !== "boolean") throw fail(400, "INVALID_CHECKLIST"); return [key, input.checklist[key] === true]; }));
  if (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length > 20 || input.evidenceRefs.some(ref => typeof ref !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9:._/-]{0,159}$/.test(ref))) throw fail(400, "INVALID_EVIDENCE_REFERENCES");
  if (input.status === "ready" && (!Object.values(checklist).every(Boolean) || !input.evidenceRefs.length)) throw fail(400, "ONBOARDING_EVIDENCE_REQUIRED");
  return { status: input.status, checklist, evidenceRefs: input.evidenceRefs, reason: input.reason.trim(), expectedVersion: version(input.expectedVersion) };
}
async function currentUser(actor) {
  if (!objectId(actor?.id)) throw fail(401, "AUTHENTICATION_REQUIRED");
  const user = await User.findOne({ _id: actor.id, accountStatus: "active" }).select("role").lean();
  if (!user) throw fail(403, "ACCOUNT_INACTIVE"); return user;
}
async function scoped(actor, kind, id, write = false) {
  target(kind, id); const user = await currentUser(actor);
  if (!await organizationIsAvailable(kind, id)) throw fail(404, "ORGANIZATION_NOT_FOUND");
  if (user.role === "system_admin") return user;
  const member = user.role === "provider_admin" && await ProviderMembership.findOne({ user: user._id, kind, organization: id, active: true }).lean();
  if (!member || (write && (member.accessLevel || "admin") !== "admin")) throw fail(403, "ORGANIZATION_FORBIDDEN"); return user;
}
async function system(actor) { const user = await currentUser(actor); if (user.role !== "system_admin") throw fail(403, "SYSTEM_ADMIN_REQUIRED"); return user; }
export async function listBranchGroups({ actor, limit = 25, before }) {
  const user = await currentUser(actor);
  const size = Number(limit); if (!Number.isSafeInteger(size) || size < 1 || size > 100 || (before && !objectId(before))) throw fail(400, "INVALID_PAGINATION");
  let allowed = null;
  if (user.role !== "system_admin") {
    if (user.role !== "provider_admin") throw fail(403, "ORGANIZATION_FORBIDDEN");
    const memberships = await ProviderMembership.find({ user: user._id, active: true }).select("kind organization").limit(100).lean();
    allowed = [];
    for (const row of memberships) if (await organizationIsAvailable(row.kind, row.organization)) allowed.push({ kind: row.kind, organization: row.organization });
    if (!allowed.length) return { data: [], nextCursor: null };
  }
  const data = await ProviderGroup.find({ ...(before ? { _id: { $lt: before } } : {}), ...(allowed ? { $or: allowed.map(row => ({ branches: { $elemMatch: row } })) } : {}) }).sort({ _id: -1 }).limit(size + 1).lean();
  const page = data.slice(0, size).map(row => ({ _id: row._id, name: row.name, version: row.version, branches: allowed ? row.branches.filter(branch => allowed.some(scope => scope.kind === branch.kind && String(scope.organization) === String(branch.organization))) : row.branches }));
  return { data: page, nextCursor: data.length > size ? String(page.at(-1)._id) : null, permissionsInherited: false };
}
export async function putBranchGroup({ actor, id, input }) {
  await system(actor); if (!objectId(id)) throw fail(400, "INVALID_GROUP_ID");
  const normalized = validateBranchGroup(input);
  for (const branch of normalized.branches) if (!await organizationIsAvailable(branch.kind, branch.organization)) throw fail(400, "BRANCH_UNAVAILABLE");
  const before = await ProviderGroup.findById(id).lean();
  if ((before?.version || 0) !== normalized.expectedVersion) throw fail(409, "GROUP_VERSION_CONFLICT");
  if ((before?.changeLog?.length || 0) >= 100) throw fail(503, "GROUP_AUDIT_ARCHIVE_REQUIRED");
  const event = { at: new Date(), actor: actor.id, version: normalized.expectedVersion + 1, before: before ? { name: before.name, branches: before.branches, version: before.version } : null, after: { name: normalized.name, branches: normalized.branches }, operation: "group_updated" };
  // Audit before committing; failure preserves the existing group.
  await AuditLog.create({ user: actor.id, action: "update", entityType: "ProviderGroup", entityId: id, before, after: { ...normalized, operation: "group_update_requested" } });
  try {
    const group = await ProviderGroup.findOneAndUpdate({ _id: id, version: normalized.expectedVersion, "changeLog.99": { $exists: false } }, { $set: { name: normalized.name, branches: normalized.branches, version: normalized.expectedVersion + 1, updatedBy: actor.id }, $push: { changeLog: event } }, { upsert: normalized.expectedVersion === 0, new: true, runValidators: true }).lean();
    if (!group) throw fail(409, "GROUP_VERSION_CONFLICT"); return { data: group, permissionsInherited: false };
  } catch (error) { if (error.code === 11000) throw fail(409, "GROUP_IDENTITY_CONFLICT", "A branch already belongs to a group or the version changed"); throw error; }
}
export async function readProviderOnboarding({ actor, kind, organizationId }) { await scoped(actor, kind, organizationId); return { data: await ProviderOnboarding.findOne({ kind, organization: organizationId }).lean(), clinicalValidationImplied: false }; }
export async function putProviderOnboarding({ actor, kind, organizationId, input }) {
  await system(actor); await scoped(actor, kind, organizationId); const normalized = validateOnboarding(input);
  if (normalized.status === "ready") {
    const Model = kind === "hospital" ? Hospital : ResourceProvider;
    const organization = await Model.findById(organizationId).select("approvalStatus verificationStatus").lean();
    const members = await ProviderMembership.find({ kind, organization: organizationId, active: true, $or: [{ accessLevel: "admin" }, { accessLevel: { $exists: false } }] }).select("user").limit(100).lean();
    const contact = await User.exists({ _id: { $in: members.map(row => row.user) }, role: "provider_admin", accountStatus: "active", demoAccount: { $ne: true }, notificationsEnabled: true, notificationEmailVerifiedAt: { $type: "date" }, notificationEmail: { $type: "string", $nin: [""] } });
    if (!contact || organization.approvalStatus !== "approved" || organization.verificationStatus !== "verified") throw fail(409, "PROVIDER_READINESS_NOT_ESTABLISHED");
  }
  const current = await ProviderOnboarding.findOne({ kind, organization: organizationId }).select("version changeLog").lean();
  if ((current?.changeLog?.length || 0) >= 100) throw fail(503, "ONBOARDING_AUDIT_ARCHIVE_REQUIRED");
  const event = { at: new Date(), actor: actor.id, version: normalized.expectedVersion + 1, status: normalized.status, checklist: normalized.checklist, evidenceRefs: normalized.evidenceRefs, reason: normalized.reason, operation: "review_committed" };
  const auditId = new mongoose.Types.ObjectId();
  await AuditLog.create({ _id: auditId, user: actor.id, action: "update", entityType: "ProviderOnboarding", after: { kind, organization: organizationId, operation: "review_requested", ...normalized } });
  try {
    const row = await ProviderOnboarding.findOneAndUpdate({ kind, organization: organizationId, version: normalized.expectedVersion, "changeLog.99": { $exists: false } }, { $set: { status: normalized.status, checklist: normalized.checklist, evidenceRefs: normalized.evidenceRefs, reason: normalized.reason, reviewedBy: actor.id, version: normalized.expectedVersion + 1, auditPending: false }, $push: { changeLog: event } }, { upsert: normalized.expectedVersion === 0, new: true, runValidators: true }).lean();
    if (!row) throw fail(409, "ONBOARDING_VERSION_CONFLICT"); return { data: row, clinicalValidationImplied: false };
  } catch (error) { if (error.code === 11000) throw fail(409, "ONBOARDING_VERSION_CONFLICT"); throw error; }
}
export async function providerQualityReport({ actor, kind, organizationId, days = 30, now = new Date() }) {
  await scoped(actor, kind, organizationId); const windowDays = Number(days);
  if (!Number.isSafeInteger(windowDays) || windowDays < 1 || windowDays > 90) throw fail(400, "INVALID_REPORT_WINDOW");
  const since = new Date(now.getTime() - windowDays * 86400000), organization = new mongoose.Types.ObjectId(organizationId);
  const Model = kind === "hospital" ? EmergencyRequest : kind === "blood_bank" ? BloodRequest : kind === "ambulance" ? AmbulanceBooking : null;
  const [requests, imports, inventory, reportingDays, notificationStates] = await Promise.all([
    Model ? Model.aggregate([{ $match: { [kind === "hospital" ? "hospital" : "provider"]: organization, createdAt: { $gte: since, $lte: now } } }, { $group: { _id: "$status", count: { $sum: 1 } } }]).option({ maxTimeMS: 5000 }) : [],
    InventoryImport.aggregate([{ $match: { kind, organization, createdAt: { $gte: since, $lte: now } } }, { $group: { _id: "$status", count: { $sum: 1 } } }]).option({ maxTimeMS: 5000 }),
    ResourceInventory.find({ kind, organization }).select("resourceKey available capacity unit observedAt version classification reportingMethod").sort({ resourceKey: 1 }).limit(101).lean(),
    InventoryObservation.aggregate([{ $match: { kind, organization, recordedAt: { $gte: since, $lte: now } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$recordedAt", timezone: "UTC" } }, observations: { $sum: 1 }, providerConfirmed: { $sum: { $cond: [{ $eq: ["$classification", "provider_confirmed"] }, 1, 0] } } } },
      { $sort: { _id: 1 } }, { $limit: 91 }]).option({ maxTimeMS: 5000 }),
    Model ? RequestNotification.aggregate([{ $match: { sourceType: Model.modelName, createdAt: { $gte: since, $lte: now } } },
      { $lookup: { from: Model.collection.name, let: { source: "$source" }, pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$source"] }, [kind === "hospital" ? "hospital" : "provider"]: organization } }, { $project: { _id: 1 } }], as: "scopedSource" } },
      { $match: { "scopedSource.0": { $exists: true } } }, { $group: { _id: "$status", count: { $sum: 1 } } }]).option({ maxTimeMS: 5000 }) : [],
  ]);
  if (inventory.length > 100) throw fail(413, "REPORT_RESOURCE_LIMIT");
  const current = inventory.map(row => publicInventorySnapshot(row, now));
  return { kind, organizationId, generatedAt: now, since, windowDays, requests: Object.fromEntries(requests.map(row => [row._id, row.count])), imports: Object.fromEntries(imports.map(row => [row._id, row.count])), inventory: { resourceCount: current.length, unknown: current.filter(row => row.status === "unknown").length, outdated: current.filter(row => row.freshness === "outdated").length, resources: current }, reporting: { timezone: "UTC", observedUpdates: reportingDays.reduce((sum, day) => sum + day.observations, 0), daysWithReports: reportingDays.length, daily: reportingDays.map(day => ({ date: day._id, observations: day.observations, providerConfirmed: day.providerConfirmed })), note: "Persisted observations only; pending history journals may not yet be counted." },
    notifications: { supported: Boolean(Model), states: Object.fromEntries(notificationStates.map(row => [row._id, row.count])), note: "RequestNotification intent states within the reporting window, joined to this organisation. Sent means submitted, not delivered. General auth email delivery is outside this report." },
    containsPatientData: false, outcomeImprovementImplied: false };
}

export async function requestProviderOffboarding({ actor, membershipId, reason, idempotencyKey }) {
  if (!objectId(membershipId) || typeof reason !== "string" || reason.trim().length < 10 || reason.length > 500 || typeof idempotencyKey !== "string" || !/^[a-zA-Z0-9_-]{16,120}$/.test(idempotencyKey)) throw fail(400, "INVALID_OFFBOARDING");
  const membership = await ProviderMembership.findById(membershipId).select("+assignmentMutation").lean(); if (!membership) throw fail(404, "MEMBERSHIP_NOT_FOUND");
  const principal = await scoped(actor, membership.kind, membership.organization, true);
  if (principal.role !== "system_admin" && (membership.accessLevel || "admin") === "admin") {
    const alternatives = await ProviderMembership.find({ _id: { $ne: membership._id }, kind: membership.kind, organization: membership.organization, active: true, $or: [{ accessLevel: "admin" }, { accessLevel: { $exists: false } }] }).select("user").limit(100).lean();
    const remaining = await User.exists({ _id: { $in: alternatives.map(row => row.user) }, role: "provider_admin", accountStatus: "active" });
    if (!remaining) throw fail(409, "LAST_PROVIDER_ADMIN", "A System Admin must review removal of the last provider administrator");
  }
  const targetUser = await User.findById(membership.user).select("+authVersion").lean(); if (!targetUser || targetUser.role !== "provider_admin") throw fail(409, "LEGACY_ASSIGNMENT_REVIEW_REQUIRED");
  const key = hash(`${actor.id}:${membershipId}:${idempotencyKey}`);
  let operation;
  try { operation = await ProviderOffboarding.findOneAndUpdate({ key }, { $setOnInsert: { actor: actor.id, membership: membershipId, user: membership.user, kind: membership.kind, organization: membership.organization, previousAuthVersion: targetUser.authVersion || 0, originalUpdatedAt: membership.updatedAt, originalMutation: membership.assignmentMutation, originalActive: membership.active, reason: reason.trim() } }, { upsert: true, new: true }).lean(); }
  catch (error) { if (error.code !== 11000) throw error; operation = await ProviderOffboarding.findOne({ key }).lean(); }
  if (operation.reason !== reason.trim()) throw fail(409, "IDEMPOTENCY_KEY_REUSED");
  if (["complete", "superseded", "exhausted"].includes(operation.status)) return ProviderOffboarding.findById(operation._id).select("-key -previousAuthVersion -originalMutation").lean();
  // The processor applies access removal using the intent's original assignment CAS.
  try { await processProviderOffboarding(operation._id); } catch { /* Durable intent remains visible to recovery. */ }
  return ProviderOffboarding.findById(operation._id).select("-key -previousAuthVersion").lean();
}
export async function processProviderOffboarding(id) {
  return guardAdminMutation(async (assertHeld) => processOffboardingLocked(id, assertHeld));
}
async function processOffboardingLocked(id, assertHeld) {
  const now = new Date(), leaseToken = randomUUID();
  const row = await ProviderOffboarding.findOneAndUpdate({ _id: id, status: { $in: ["queued", "running"] }, attempts: { $lt: 5 }, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] }, { $set: { status: "running", leaseToken, leaseUntil: new Date(now.getTime() + 30000) }, $inc: { attempts: 1 } }, { new: true }).lean();
  if (!row) return false;
  const owned = { _id: id, leaseToken, leaseUntil: { $gt: new Date() } };
  try {
    await assertHeld();
    const marker = `offboarding:${row._id}`;
    const target = { _id: row.membership, user: row.user, kind: row.kind, organization: row.organization };
    let membership = await ProviderMembership.findOne(target).select("+assignmentMutation").lean();
    if (membership?.assignmentMutation !== marker) {
      const originalMatches = membership && membership.active === row.originalActive
        && String(membership.updatedAt || "") === String(row.originalUpdatedAt || "")
        && (membership.assignmentMutation ?? null) === (row.originalMutation ?? null);
      if (!originalMatches) {
        await ProviderOffboarding.updateOne(owned, { $set: { status: "superseded", errorCode: "ASSIGNMENT_CHANGED", completedAt: new Date() }, $unset: { leaseToken: 1, leaseUntil: 1 } });
        return false;
      }
      // Re-authorise only an uncommitted intent. Own disabled membership is recoverable after self-offboarding.
      await scoped({ id: String(row.actor) }, row.kind, row.organization, true);
      const principal = await currentUser({ id: String(row.actor) });
      if (principal.role !== "system_admin" && (membership?.accessLevel || "admin") === "admin") {
        const alternatives = await ProviderMembership.find({ _id: { $ne: row.membership }, kind: row.kind, organization: row.organization, active: true, $or: [{ accessLevel: "admin" }, { accessLevel: { $exists: false } }] }).select("user").limit(100).lean();
        const remaining = await User.exists({ _id: { $in: alternatives.map(item => item.user) }, role: "provider_admin", accountStatus: "active" });
        if (!remaining) throw fail(409, "LAST_PROVIDER_ADMIN");
      }
      const original = { ...target, active: row.originalActive,
        updatedAt: row.originalUpdatedAt || { $exists: false }, assignmentMutation: row.originalMutation ?? { $exists: false } };
      membership = await ProviderMembership.findOneAndUpdate(original, { $set: { active: false, assignmentMutation: marker } }, { new: true }).select("+assignmentMutation").lean();
    }
    if (!membership || membership.assignmentMutation !== marker) {
      await ProviderOffboarding.updateOne(owned, { $set: { status: "superseded", errorCode: "ASSIGNMENT_CHANGED", completedAt: new Date() }, $unset: { leaseToken: 1, leaseUntil: 1 } });
      return false;
    }
    await assertHeld();
    await User.updateOne({ _id: row.user, $or: [{ authVersion: row.previousAuthVersion }, ...(row.previousAuthVersion === 0 ? [{ authVersion: { $exists: false } }] : [])] }, { $inc: { authVersion: 1 } });
    await AuthToken.updateMany({ user: row.user, purpose: "refresh_session", createdAt: { $lte: row.createdAt }, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date(), revokeReason: "provider_offboarding" } });
    await AuditLog.updateOne({ _id: row._id }, { $setOnInsert: { user: row.actor, action: "update", entityType: "ProviderOffboarding", entityId: row.membership, after: { organization: row.organization, kind: row.kind, operation: "offboard", reason: row.reason } } }, { upsert: true });
    owned.leaseUntil = { $gt: new Date() };
    const saved = await ProviderOffboarding.updateOne(owned, { $set: { status: "complete", completedAt: new Date() }, $unset: { leaseToken: 1, leaseUntil: 1 } });
    if (saved.matchedCount !== 1) throw fail(409, "OFFBOARDING_LEASE_LOST"); return true;
  } catch (error) {
    await ProviderOffboarding.updateOne({ _id: id, leaseToken }, { $set: { status: row.attempts >= 5 ? "exhausted" : "queued", errorCode: "OFFBOARDING_EFFECTS_FAILED" }, $unset: { leaseToken: 1, leaseUntil: 1 } }); throw error;
  }
}
export async function recoverProviderOffboarding({ limit = 25 } = {}) {
  const now = new Date();
  await ProviderOffboarding.updateMany({ status: "running", attempts: { $gte: 5 }, leaseUntil: { $lte: now } }, { $set: { status: "exhausted", errorCode: "OFFBOARDING_FINAL_LEASE_EXPIRED" } });
  const rows = await ProviderOffboarding.find({ status: { $in: ["queued", "running"] }, attempts: { $lt: 5 }, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }] }).select("_id").sort({ updatedAt: 1 }).limit(Math.min(100, Math.max(1, limit))).lean();
  let recovered = 0, failed = 0;
  for (const row of rows) try { if (await processProviderOffboarding(row._id)) recovered++; } catch { failed++; }
  return { recovered, failed, exhausted: await ProviderOffboarding.countDocuments({ status: "exhausted" }) };
}

// Access changes share the same distributed mutation lease as assignment writers/offboarding.
export async function updateMembershipAccess({ actor, membershipId, input }) {
  if (!objectId(membershipId) || !input || Object.keys(input).some(key => !["accessLevel", "reason", "expectedUpdatedAt"].includes(key)) || !["admin", "inventory_reporter", "reviewer"].includes(input.accessLevel)
    || typeof input.reason !== "string" || input.reason.trim().length < 10 || input.reason.length > 500 || typeof input.expectedUpdatedAt !== "string" || !Number.isFinite(new Date(input.expectedUpdatedAt).getTime())) throw fail(400, "INVALID_ACCESS_REVIEW");
  return guardAdminMutation(async assertHeld => {
    const membership = await ProviderMembership.findById(membershipId).select("+accessAudit +assignmentMutation").lean();
    if (!membership || !membership.active) throw fail(404, "MEMBERSHIP_NOT_FOUND");
    const principal = await scoped(actor, membership.kind, membership.organization, true);
    const targetUser = await User.findById(membership.user).select("role +authVersion").lean();
    if (!targetUser || targetUser.role !== "provider_admin") throw fail(409, "LEGACY_ASSIGNMENT_REVIEW_REQUIRED");
    if (new Date(input.expectedUpdatedAt).getTime() !== new Date(membership.updatedAt).getTime()) throw fail(409, "MEMBERSHIP_VERSION_CONFLICT");
    const before = membership.accessLevel || "admin";
    if (before === input.accessLevel) return { membershipId: membership._id, accessLevel: before, updatedAt: membership.updatedAt, changed: false };
    if (before === "admin" && input.accessLevel !== "admin") {
      const alternatives = await ProviderMembership.find({ _id: { $ne: membership._id }, kind: membership.kind, organization: membership.organization, active: true, $or: [{ accessLevel: "admin" }, { accessLevel: { $exists: false } }] }).select("user").limit(100).lean();
      const live = await User.exists({ _id: { $in: alternatives.map(row => row.user) }, role: "provider_admin", accountStatus: "active" });
      if (!live && principal.role !== "system_admin") throw fail(409, "LAST_PROVIDER_ADMIN");
    }
    if ((membership.accessAudit?.length || 0) >= 100) throw fail(503, "MEMBERSHIP_AUDIT_ARCHIVE_REQUIRED");
    const operation = new mongoose.Types.ObjectId(), at = new Date();
    const event = { operation, actor: actor.id, at, before, after: input.accessLevel, reason: input.reason.trim() };
    await AuditLog.create({ _id: operation, user: actor.id, action: "update", entityType: "ProviderMembership", entityId: membership._id, after: { ...event, phase: "access_change_requested" } });
    await assertHeld();
    // Invalidate old sessions/keys before committing permission changes. Interruption leaves prior access and an explicit request audit, never stale granted sessions.
    await User.updateOne({ _id: membership.user }, { $inc: { authVersion: 1 } });
    await AuthToken.updateMany({ user: membership.user, purpose: "refresh_session", revokedAt: { $exists: false } }, { $set: { revokedAt: at, revokeReason: "provider_staff_access_changed" } });
    await assertHeld();
    const updated = await ProviderMembership.findOneAndUpdate({ _id: membership._id, updatedAt: membership.updatedAt, active: true, "accessAudit.99": { $exists: false } },
      { $set: { accessLevel: input.accessLevel, assignmentMutation: `access:${operation}` }, $push: { accessAudit: event } }, { new: true, runValidators: true }).lean();
    if (!updated) throw fail(409, "MEMBERSHIP_VERSION_CONFLICT");
    return { membershipId: updated._id, accessLevel: updated.accessLevel, updatedAt: updated.updatedAt, changed: true };
  });
}
