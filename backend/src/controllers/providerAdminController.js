import { randomUUID } from "node:crypto";
import { organizationIsAvailable } from "../services/providerLifecycle.js";
import { sendMutationResponse } from "../utils/sendMutationResponse.js";
import { createHmac } from "node:crypto";
import { env } from "../config/env.js";
import { notifyProviderApplicationSafely } from "../services/providerApplicationNotifications.js";
import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/User.js";
import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { ProviderMembership } from "../models/ProviderMembership.js";
import { ProviderApplication } from "../models/ProviderApplication.js";
import { accountView, accountViews, verifyAssignmentAfterWrite, addAssignment, provisionProvider, revokeProviderAccess, validContact } from "../services/providerAccounts.js";
import { findOrganization } from "../services/providerAccess.js";
import { issueProviderActivation } from "../services/providerInvitation.js";
import { isolatedDemoEnabled, localManualCredentialsEnabled } from "../services/demoAccounts.js";
import { guardSystemAdminMutation } from "../services/adminMutationGuard.js";
import { writeAudit } from "../utils/audit.js";
import { issueAuthToken } from "../services/authTokenService.js";
const account = async (id) => User.findOne({ _id: id, role: "provider_admin" }).select("+authVersion +passwordHash");
const sameText = (value) => ({ $regex: `^\\s*${value.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+")}\\s*$`, $options: "i" });
// Defaults keep existing small installations complete while bounding larger responses.
function listingPage(query = {}) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const requested = query.limit === undefined ? 100 : Number(query.limit);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(requested) || requested < 1
    || (page - 1) > Math.floor(Number.MAX_SAFE_INTEGER / Math.min(requested, 100))) {
    throw Object.assign(new Error("Page and limit must be positive integers"), { status: 400 });
  }
  const perPage = Math.min(requested, 100);
  return { page, perPage, skip: (page - 1) * perPage };
}
const pageMetadata = ({ page, perPage }, total) => ({ page, perPage, total,
  hasMore: page * perPage < total, nextPage: page * perPage < total ? page + 1 : null });
async function organizationPage(query, fields) {
  const pagination = listingPage(query);
  const [hospitalCount, providerCount] = await Promise.all([Hospital.countDocuments(), ResourceProvider.countDocuments()]);
  const hospitalLimit = Math.min(pagination.perPage, Math.max(0, hospitalCount - pagination.skip));
  const providerLimit = pagination.perPage - hospitalLimit;
  const [hospitals, providers] = await Promise.all([
    hospitalLimit ? Hospital.find().select(fields).sort({ _id: 1 }).skip(pagination.skip).limit(hospitalLimit).lean() : [],
    providerLimit ? ResourceProvider.find().select(`${fields} kind`).sort({ _id: 1 })
      .skip(Math.max(0, pagination.skip - hospitalCount)).limit(providerLimit).lean() : [],
  ]);
  return { data: [...hospitals.map(row => ({ ...row, kind: "hospital" })), ...providers],
    ...pageMetadata(pagination, hospitalCount + providerCount) };
}
export const listAccounts = asyncHandler(async (req, res) => {
  const pagination = listingPage(req.query);
  const filter = { role: "provider_admin" };
  const [users, total] = await Promise.all([
    User.find(filter).select("name email role accountStatus activationDeliveryStatus notificationEmail notificationsEnabled notificationEmailVerifiedAt credentialDelivery demoAccount credentialState +passwordHash +authVersion")
      .sort({ createdAt: -1, _id: -1 }).skip(pagination.skip).limit(pagination.perPage).lean(),
    User.countDocuments(filter),
  ]);
  res.json({ data: await accountViews(users), ...pageMetadata(pagination, total), demoEnabled: isolatedDemoEnabled(), manualCredentialsEnabled: localManualCredentialsEnabled() });
});
export const createAccount = asyncHandler(async (req, res) => sendMutationResponse(res, guardSystemAdminMutation(req.user.id, async () => ({ status: 201, body: { ok: true, ...await provisionProvider({ ...req.body, provisioningKey: req.idempotencyKeyHash }, req.user.id) } }))));
export const accountAction = asyncHandler(async (req, res) => {
  let result = {};
  await guardSystemAdminMutation(req.user.id, async () => {
    const user = await account(req.params.id);
    if (!user) return;
    const action = req.body.action;
    if (action === "activate") {
      const manual = user.credentialDelivery === "manual" && localManualCredentialsEnabled();
      if (!user.passwordHash || (!user.emailVerifiedAt && !manual)) { result = { error: "The representative must accept the activation invitation first", status: 409 }; return; }
      user.accountStatus = "active";
      await revokeProviderAccess(user);
    } else if (action === "deactivate") {
      user.accountStatus = "suspended";
      await revokeProviderAccess(user);
      await mongoose.model("AuthToken").updateMany({ user: user._id, purpose: "provider_activation", usedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    } else if (action === "invite") {
      if (user.demoAccount || !["pending", "suspended"].includes(user.accountStatus) || !validContact(user.notificationEmail)) { result = { error: "An invitation requires a pending or suspended account and a real contact", status: 409 }; return; }
      if (user.accountStatus === "suspended") { user.accountStatus = "pending"; await revokeProviderAccess(user); }
      result.invitation = (await issueProviderActivation(user)).status;
    } else if (action === "reset") {
      if (user.accountStatus !== "active" || !user.passwordHash || !user.notificationEmailVerifiedAt || !validContact(user.notificationEmail)) { result = { error: "Verify a real recovery contact before preparing a reset", status: 409 }; return; }
      await issueAuthToken(user, "reset_password");
      result.message = "Reset instructions prepared; inspect email delivery status.";
    }
    await writeAudit({ user: req.user.id, action: "update", entityType: "ProviderAccount", entityId: user._id, after: { action, accountStatus: user.accountStatus } });
    result.account = await accountView(user);
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  if (!result.account) return res.status(404).json({ error: "Provider account not found" });
  res.json({ ok: true, ...result });
});
export const assignAccount = asyncHandler(async (req, res) => sendMutationResponse(res, guardSystemAdminMutation(req.user.id, async () => {
  const user = await account(req.params.id);
  if (!user) return { status: 404, body: { error: "Provider account not found" } };
  await addAssignment(user, req.body, req.user.id);
  await revokeProviderAccess(user);
  return { body: { ok: true, account: await accountView(user) } };
})));
export const updateAssignment = asyncHandler(async (req, res) => sendMutationResponse(res, guardSystemAdminMutation(req.user.id, async () => {
  const user = await account(req.params.id);
  if (!user) return { status: 404, body: { error: "Provider account not found" } };
  const existingMembership = await ProviderMembership.findOne({ _id: req.params.membershipId, user: user._id });
  if (existingMembership && req.body.active === true && (existingMembership.archivedByOperation || !await organizationIsAvailable(existingMembership.kind, existingMembership.organization))) return { status: 409, body: { error: "Archived or unavailable organisations cannot be reassigned" } };
  const assignmentMutation = randomUUID();
  const membership = await ProviderMembership.findOneAndUpdate({ _id: req.params.membershipId, user: user._id,
    ...(req.body.active === true ? { archivedByOperation: null } : {}) },
    { $set: { active: req.body.active, assignmentMutation } }, { new: true });
  if (!membership) return { status: existingMembership ? 409 : 404, body: { error: existingMembership ? "Assignment changed during activation" : "Assignment not found" } };
  if (req.body.active === true) await verifyAssignmentAfterWrite(membership, assignmentMutation);
  await revokeProviderAccess(user);
  await writeAudit({ user: req.user.id, action: "update", entityType: "ProviderMembership", entityId: membership._id, after: { active: membership.active } });
  return { body: { ok: true, account: await accountView(user) } };
})));
export const listOrganizations = asyncHandler(async (req, res) => {
  res.json(await organizationPage(req.query, "name verificationStatus approvalStatus"));
});
export const approveOrganization = asyncHandler(async (req, res) => {
  const org = await findOrganization(req.params.kind, req.params.id);
  if (!org) return res.status(404).json({ error: "Organisation not found" });
  // Explicit platform approval does not rewrite provenance or availability.
  org.verificationStatus = "verified"; org.approvalStatus = "approved"; await org.save();
  await writeAudit({ user: req.user.id, action: "verify", entityType: "ProviderApproval", entityId: org._id, after: { kind: req.params.kind } });
  res.json({ ok: true, organization: { _id: org._id, name: org.name, kind: req.params.kind, verificationStatus: org.verificationStatus } });
});
export const submitProvider = asyncHandler(async (req, res) => {
  const { kind, name, address, phone, website, contactEmail, explanation, contactName, city } = req.body;
  const submissionFingerprint = createHmac("sha256", env.jwtSecret).update(JSON.stringify([
    kind, name.toLowerCase().replace(/\s+/g, " "), address.toLowerCase().replace(/\s+/g, " "), (city || "Mumbai").toLowerCase().replace(/\s+/g, " "),
  ])).digest("hex");
  let application = await ProviderApplication.findOne({ submissionFingerprint });
  if (!application) {
    try {
      application = await ProviderApplication.create({ kind, name, address, phone, website, contactEmail, explanation,
        contactName, city, requester: req.user?.id, submissionFingerprint, notificationVersion: 1 });
    } catch (error) {
      if (error.code !== 11000) throw error;
      application = await ProviderApplication.findOne({ submissionFingerprint });
      if (!application) throw error;
    }
  }
  await notifyProviderApplicationSafely(application);
  // Public receipts never expose another applicant's records, account or review history.
  const ownsApplication = req.user && String(application.requester) === String(req.user.id);
  res.status(ownsApplication ? 201 : 202).json({ ok: true, ...(ownsApplication ? { application } : {}), message: "Application recorded for System Admin review. This does not grant provider access. Email confirmation may be delayed; do not submit again." });
});
export const providerApplications = asyncHandler(async (req, res) => {
  const pagination = listingPage(req.query);
  const [data, total] = await Promise.all([
    ProviderApplication.find().sort({ createdAt: -1, _id: -1 }).skip(pagination.skip).limit(pagination.perPage).lean(),
    ProviderApplication.countDocuments(),
  ]);
  res.json({ data, ...pageMetadata(pagination, total) });
});
export const reviewProvider = asyncHandler(async (req, res) => {
  let result;
  await guardSystemAdminMutation(req.user.id, async () => {
    const application = await ProviderApplication.findById(req.params.id);
    if (!application) { result = { status: 404, error: "Provider submission not found" }; return; }
    if (application.status !== "pending") {
      if (application.status === (req.body.decision === "approve" ? "approved" : "rejected")) {
        await notifyProviderApplicationSafely(application);
        result = { ok: true, application, ...(application.account ? { account: await accountView(await account(application.account)) } : {}) };
      } else result = { status: 409, error: "Provider submission already reviewed" };
      return;
    }
    if (req.body.decision === "reject") {
      application.status = "rejected"; application.reviewedBy = req.user.id; application.reviewedAt = new Date(); application.reviewNote = req.body.note; application.notificationCompletedAt = undefined; await application.save();
      await notifyProviderApplicationSafely(application);
      await writeAudit({ user: req.user.id, action: "reject", entityType: "ProviderApplication", entityId: application._id });
      result = { ok: true, application }; return;
    }
    const Model = application.kind === "hospital" ? Hospital : ResourceProvider;
    // Reserved ID makes retries reuse the new organisation without touching existing records.
    let org = await Model.findById(application.organization);
    if (!org && await Model.exists({ name: sameText(application.name), address: sameText(application.address),
      $or: [{ city: sameText(application.city || "Mumbai") }, { city: { $in: [null, ""] } }],
      ...(application.kind === "hospital" ? {} : { kind: application.kind }) })) {
      result = { status: 409, error: "An existing organisation matches this application. Review its assignments in Provider Accounts before provisioning." }; return;
    }
    if (!org) org = await Model.create({ _id: application.organization, name: application.name, address: application.address,
      phone: application.phone, website: application.website, city: application.city || "Mumbai", kind: application.kind === "hospital" ? undefined : application.kind,
      sourceName: "Manually approved provider submission", verificationStatus: "verified", approvalStatus: "pending" });
    let provisioning;
    if (application.account) {
      const previous = await account(application.account);
      if (!previous) throw new Error("Provisioning requires review");
      provisioning = { account: await accountView(previous), invitation: "check_delivery_status" };
    } else {
      const loginEmail = req.body.loginEmail?.trim() || undefined;
      provisioning = await provisionProvider({ kind: application.kind, organizationId: org._id, loginEmail,
        notificationEmail: application.contactEmail, demo: req.body.demo === true, provisioningKey: `application:${application._id}` }, req.user.id, true);
      application.account = provisioning.account._id;
      await application.save();
    }
    org.approvalStatus = "approved"; await org.save();
    application.status = "approved"; application.reviewedBy = req.user.id; application.reviewedAt = new Date(); application.reviewNote = req.body.note?.trim() || undefined; application.notificationCompletedAt = undefined; await application.save();
    await notifyProviderApplicationSafely(application);
    await writeAudit({ user: req.user.id, action: "verify", entityType: "ProviderApplication", entityId: application._id, after: { organization: org._id, account: application.account } });
    result = { ok: true, application, ...provisioning };
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});
export const myOrganizations = asyncHandler(async (req, res) => {
  if (req.user.role === "system_admin") {
    return res.json(await organizationPage(req.query, "name phone website address verificationStatus"));
  }
  const pagination = listingPage(req.query);
  const userId = new mongoose.Types.ObjectId(req.user.id);
  const projection = { _id: 1, name: 1, phone: 1, website: 1, address: 1, verificationStatus: 1 };
  const pipeline = [
    { $match: { user: userId, active: true } },
    { $lookup: { from: Hospital.collection.name, let: { organization: "$organization", kind: "$kind" }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ["$_id", "$$organization"] }, { $eq: ["$$kind", "hospital"] }] } } },
      { $project: projection },
    ], as: "hospital" } },
    { $lookup: { from: ResourceProvider.collection.name, let: { organization: "$organization", kind: "$kind" }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ["$_id", "$$organization"] }, { $eq: ["$kind", "$$kind"] }] } } },
      { $project: projection },
    ], as: "provider" } },
    { $set: { organization: { $arrayElemAt: [{ $concatArrays: ["$hospital", "$provider"] }, 0] } } },
    { $match: { "organization._id": { $exists: true } } },
    { $replaceRoot: { newRoot: { $mergeObjects: ["$organization", { kind: "$kind" }] } } },
  ];
  // Legacy hospital assignment display stays scoped and does not migrate records.
  if (req.user.role === "hospital_admin") pipeline.push({ $unionWith: { coll: Hospital.collection.name, pipeline: [
    { $match: { admins: userId } }, { $project: projection }, { $set: { kind: "hospital" } },
  ] } });
  pipeline.push(
    { $group: { _id: { kind: "$kind", organization: "$_id" }, organization: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$organization" } },
    { $sort: { kind: 1, _id: 1 } },
    { $facet: { data: [{ $skip: pagination.skip }, { $limit: pagination.perPage }], counts: [{ $count: "total" }] } },
  );
  const [result] = await ProviderMembership.aggregate(pipeline);
  const total = result?.counts[0]?.total || 0;
  res.json({ data: (result?.data || []).map(row => ({ ...row, _id: String(row._id) })), ...pageMetadata(pagination, total) });
});
