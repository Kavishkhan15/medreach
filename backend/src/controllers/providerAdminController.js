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
import { accountView, accountViews, addAssignment, provisionProvider, revokeProviderAccess, validContact } from "../services/providerAccounts.js";
import { findOrganization } from "../services/providerAccess.js";
import { issueProviderActivation } from "../services/providerInvitation.js";
import { isolatedDemoEnabled, localManualCredentialsEnabled } from "../services/demoAccounts.js";
import { guardSystemAdminMutation } from "../services/adminMutationGuard.js";
import { writeAudit } from "../utils/audit.js";
import { issueAuthToken } from "../services/authTokenService.js";
const account = async (id) => User.findOne({ _id: id, role: "provider_admin" }).select("+authVersion +passwordHash");
const sameText = (value) => ({ $regex: `^\\s*${value.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+")}\\s*$`, $options: "i" });
export const listAccounts = asyncHandler(async (_req, res) => {
  const users = await User.find({ role: "provider_admin" }).select("+passwordHash +authVersion").sort({ createdAt: -1 });
  res.json({ data: await accountViews(users), demoEnabled: isolatedDemoEnabled(), manualCredentialsEnabled: localManualCredentialsEnabled() });
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
  const membership = await ProviderMembership.findOneAndUpdate({ _id: req.params.membershipId, user: user._id },
    { $set: { active: req.body.active } }, { new: true });
  if (!membership) return { status: 404, body: { error: "Assignment not found" } };
  await revokeProviderAccess(user);
  await writeAudit({ user: req.user.id, action: "update", entityType: "ProviderMembership", entityId: membership._id, after: { active: membership.active } });
  return { body: { ok: true, account: await accountView(user) } };
})));
export const listOrganizations = asyncHandler(async (_req, res) => {
  const [hospitals, providers] = await Promise.all([Hospital.find().select("name verificationStatus approvalStatus").lean(), ResourceProvider.find().select("name kind verificationStatus approvalStatus").lean()]);
  res.json({ data: [...hospitals.map((r) => ({ ...r, kind: "hospital" })), ...providers] });
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
export const providerApplications = asyncHandler(async (_req, res) => res.json({ data: await ProviderApplication.find().sort({ createdAt: -1 }).lean() }));
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
    const [hospitals, providers] = await Promise.all([Hospital.find().select("name phone website address verificationStatus").lean(), ResourceProvider.find().select("name kind phone website address verificationStatus").lean()]);
    return res.json({ data: [...hospitals.map((r) => ({ ...r, kind: "hospital" })), ...providers] });
  }
  const rows = await ProviderMembership.find({ user: req.user.id, active: true }).lean();
  const data = await Promise.all(rows.map(async (r) => {
    const org = await findOrganization(r.kind, r.organization);
    return org ? { _id: String(org._id), name: org.name, kind: r.kind, phone: org.phone, website: org.website, address: org.address, verificationStatus: org.verificationStatus } : null;
  }));
  // Legacy hospital assignment display is read-only compatibility, not migration.
  if (req.user.role === "hospital_admin") for (const h of await Hospital.find({ admins: req.user.id }).select("name phone website address verificationStatus").lean()) {
    if (!data.some((r) => r?._id === String(h._id))) data.push({ ...h, _id: String(h._id), kind: "hospital" });
  }
  res.json({ data: data.filter(Boolean) });
});
