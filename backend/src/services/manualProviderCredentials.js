import { organizationIsAvailable } from "./providerLifecycle.js";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";
import { User } from "../models/User.js";
import { ProviderMembership } from "../models/ProviderMembership.js";
import { AuthToken } from "../models/AuthToken.js";
import { existingProviderInventory } from "../../scripts/provisionExistingProviders.js";
import { accountView, addAssignment, provisionProvider } from "./providerAccounts.js";
import { findOrganization } from "./providerAccess.js";
import { guardSystemAdminMutation } from "./adminMutationGuard.js";
import { localManualCredentialsEnabled } from "./demoAccounts.js";
import { writeAudit } from "../utils/audit.js";

const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
async function verifyLocalDatabase() {
  if (!localManualCredentialsEnabled()) fail("Manual demo credentials are available only on an approved local development database", 403);
  if (mongoose.connection.name === "medreach") {
    const options = await mongoose.connection.db.admin().command({ getCmdLineOpts: 1 });
    if (options.parsed?.storage?.dbPath !== "/home/anonymous/medreach/data") fail("The canonical local database could not be verified", 403);
  }
}
export async function approvedAssignments(user) {
  const assignments = await ProviderMembership.find({ user: user._id, active: true }).lean();
  if (!assignments.length) return false;
  if ((await Promise.all(assignments.map(a => organizationIsAvailable(a.kind, a.organization)))).some(available => !available)) return false;
  const orgs = await Promise.all(assignments.map(a => findOrganization(a.kind, a.organization)));
  return orgs.every(org => org && org.verificationStatus === "verified" && !["pending", "rejected"].includes(org.approvalStatus) && org.active !== false);
}
const loginId = group => {
  const org = group.organizations[0];
  const slug = group.name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/g, "") || org.kind.replaceAll("_", "-");
  return `admin@${slug}-${org.id}.example`;
};

// Provision only missing accounts. Existing memberships, credentials and roles
// are never replaced or reactivated by this bulk operation.
export async function prepareManualProviderAccounts(actor, selection = {}) {
  await verifyLocalDatabase();
  return guardSystemAdminMutation(actor, async assertHeld => {
    const inventory = await existingProviderInventory();
    const groups = selection.organizationId
      ? inventory.filter(g => g.organizations.some(o => o.kind === selection.kind && o.id === selection.organizationId))
      : inventory;
    if (!groups.length) fail("Organisation not found", 404);
    let created = 0, needsReview = 0;
    const selectedIds = new Set();
    for (const group of groups) {
      if (group.action === "provision_pending_contact_required") {
        await assertHeld();
        const first = group.organizations[0];
        const result = await provisionProvider({ kind: first.kind, organizationId: first.id, loginEmail: loginId(group), provisioningKey: `existing:${group.key}` }, actor, false, { deferInvitation: true, manualLogin: true });
        const user = await User.findById(result.account._id);
        for (const org of group.organizations.slice(1)) await addAssignment(user, { kind: org.kind, organizationId: org.id }, actor);
        selectedIds.add(String(user._id)); created++;
      } else if (group.action === "retain_existing_assignments" && group.eligible) {
        const existing = await User.find({ _id: { $in: group.existingAccounts.map(a => a.id) }, role: "provider_admin" });
        if (!existing.length) needsReview++;
        existing.forEach(user => selectedIds.add(String(user._id)));
      } else if (group.review || group.action === "resume_pending_assignments") needsReview++;
    }
    const candidates = await User.find({ _id: { $in: [...selectedIds] }, role: "provider_admin", accountStatus: { $in: ["pending", "active"] } }).select("+passwordHash +authVersion");
    const accounts = [];
    for (const user of candidates) if (!user.passwordHash && await approvedAssignments(user)) accounts.push(await accountView(user));
    return { ok: true, summary: { created, awaitingPassword: accounts.length, needsReview }, accounts,
      message: "Accounts prepared. Generate credentials for manual handover; no email was sent." };
  });
}

export async function generateManualProviderCredentials(actor, id, { mode, expectedRevision }) {
  await verifyLocalDatabase();
  return guardSystemAdminMutation(actor, async assertHeld => {
    const user = await User.findOne({ _id: id, role: "provider_admin" }).select("+passwordHash +authVersion");
    if (!user) fail("Provider account not found", 404);
    if (!await approvedAssignments(user)) fail("An active assignment to an approved organisation is required");
    const revision = Number(user.authVersion || 0);
    if (expectedRevision !== revision || (mode === "generate" && user.passwordHash)) fail("Credentials may already have changed. Refresh account status before explicitly resetting.");
    const password = `Aa9!${randomBytes(24).toString("base64url")}`;
    const previousHash = user.passwordHash;
    await user.setPassword(password);
    await assertHeld();
    const updated = await User.findOneAndUpdate({ _id: id, role: "provider_admin", accountStatus: user.accountStatus,
      passwordHash: previousHash || { $in: [null] },
      ...(revision === 0 ? { $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }] } : { authVersion: revision }),
    }, { $set: { passwordHash: user.passwordHash, credentialState: "custom", credentialDelivery: "manual", demoAccount: false,
      activationDeliveryStatus: "not_required", ...(user.accountStatus === "pending" ? { accountStatus: "active" } : {}) }, $inc: { authVersion: 1 } },
    { new: true, runValidators: true }).select("+passwordHash +authVersion");
    if (!updated) fail("The account changed while credentials were being prepared. Refresh before retrying.");
    let sessionCleanup = "confirmed";
    try {
      await AuthToken.updateMany({ user: id, purpose: { $in: ["refresh_session", "provider_activation", "reset_password"] }, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date(), revokeReason: "manual_credentials_changed" } });
    } catch { sessionCleanup = "unconfirmed"; }
    try { await writeAudit({ user: actor, action: "update", entityType: "ProviderAccount", entityId: id,
      after: { action: mode, credentialDelivery: "manual", accountStatus: updated.accountStatus } }); }
    catch { console.warn("[medreach] Manual credentials saved; audit confirmation unavailable."); }
    return { ok: true, account: await accountView(updated), credentials: { accountId: String(id), email: updated.email, password }, sessionCleanup,
      message: "New credentials generated for manual handover. Copy them now; the password cannot be retrieved later. No email was sent." };
  });
}
