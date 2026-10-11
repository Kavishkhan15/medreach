import { User } from "../models/User.js";
import { ProviderMembership, PROVIDER_KINDS } from "../models/ProviderMembership.js";
import { findOrganization } from "./providerAccess.js";
import { credentialLabel, demoLoginEmail, isolatedDemoEnabled, setDemoPassword } from "./demoAccounts.js";
import { issueProviderActivation } from "./providerInvitation.js";
import { revokeAllSessions } from "./authTokenService.js";
import { writeAudit } from "../utils/audit.js";
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export const validContact = (email) => typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/\.(example|test|invalid|localhost)$/i.test(email);
export async function accountView(user) {
  const assignments = await ProviderMembership.find({ user: user._id }).lean();
  const organizations = await Promise.all(assignments.map(async (r) => {
    const org = await findOrganization(r.kind, r.organization);
    return { _id: String(r._id), organizationId: String(r.organization), kind: r.kind, name: org?.name || "Organisation unavailable", active: r.active };
  }));
  return { _id: String(user._id), name: user.name, email: user.email, role: user.role, accountStatus: user.accountStatus,
    organizations, invitationStatus: user.activationDeliveryStatus || (user.demoAccount ? "not_required" : "unknown"), notificationEmail: user.notificationEmail || "", notificationsEnabled: Boolean(user.notificationsEnabled),
    notificationContactVerified: Boolean(user.notificationEmailVerifiedAt), credentialLabel: credentialLabel(user), demo: isolatedDemoEnabled() && user.demoAccount };
}
export async function addAssignment(user, { kind, organizationId }, actor, allowPending = false) {
  if (user.role !== "provider_admin" || !PROVIDER_KINDS.includes(kind)) fail("Invalid provider assignment");
  const org = await findOrganization(kind, organizationId);
  if (!org || (org.verificationStatus !== "verified" || org.approvalStatus === "rejected" || (!allowPending && org.approvalStatus === "pending"))) fail("An approved organisation is required", 409);
  // Adding an assignment never overwrites or reactivates an existing one.
  const membership = await ProviderMembership.findOneAndUpdate({ user: user._id, kind, organization: org._id },
    { $setOnInsert: { active: true, assignedBy: actor } }, { upsert: true, new: true, runValidators: true });
  await writeAudit({ user: actor, action: "create", entityType: "ProviderMembership", entityId: membership._id,
    after: { user: user._id, kind, organization: org._id } });
  return membership;
}
export async function provisionProvider({ kind, organizationId, loginEmail, notificationEmail, demo = false, provisioningKey }, actor, allowPending = false) {
  if (!PROVIDER_KINDS.includes(kind)) fail("Invalid provider type");
  const organization = await findOrganization(kind, organizationId);
  if (!organization || (organization.verificationStatus !== "verified" || organization.approvalStatus === "rejected" || (!allowPending && organization.approvalStatus === "pending"))) fail("Approve the organisation before provisioning", 409);
  if (demo && !isolatedDemoEnabled()) fail("Demo accounts require an isolated demo database with email disabled", 403);
  const email = (loginEmail || (demo ? demoLoginEmail(organization, kind) : "")).trim().toLowerCase();
  if (!email || (!demo && !validContact(email))) fail("A real login email is required outside demo mode");
  if (notificationEmail && !validContact(notificationEmail)) fail("A real notification contact is required");
  if (!demo && !validContact(notificationEmail || email)) fail("A real invitation recipient is required");
  const previous = provisioningKey && await User.findOne({ provisioningKey }).select("+provisioningOrganization");
  if (previous) {
    if (previous.role !== "provider_admin" || previous.email !== email || previous.provisioningOrganization !== `${kind}:${organizationId}`) fail("Provisioning details changed; review the existing account", 409);
    await addAssignment(previous, { kind, organizationId }, actor, allowPending);
    let invitation = "check_delivery_status";
    if (!previous.demoAccount && previous.accountStatus === "pending" && previous.activationDeliveryStatus === "pending") {
      try { invitation = (await issueProviderActivation(previous)).status; } catch { invitation = "failed"; }
    }
    return { account: await accountView(previous), invitation };
  }
  if (await User.exists({ email })) fail("This login email already exists. Use explicit assignment management; credentials will not be overwritten", 409);
  const user = new User({ name: organization.name, email, provisioningKey, provisioningOrganization: `${kind}:${organizationId}`, role: "provider_admin", activationDeliveryStatus: demo ? "not_required" : "pending", accountStatus: demo ? "active" : "pending",
    notificationEmail: notificationEmail || (demo ? undefined : email), notificationsEnabled: false });
  if (demo) await setDemoPassword(user);
  await user.save();
  await addAssignment(user, { kind, organizationId }, actor, allowPending);
  await writeAudit({ user: actor, action: "create", entityType: "ProviderAccount", entityId: user._id,
    after: { role: user.role, organization: organization._id, demo: Boolean(demo) } });
  let invitation = "not_required";
  if (!demo) { try { invitation = (await issueProviderActivation(user)).status; } catch { invitation = "failed"; } }
  return { account: await accountView(user), invitation };
}
export async function revokeProviderAccess(user) {
  user.authVersion = Number(user.authVersion || 0) + 1;
  await user.save();
  await revokeAllSessions(user._id, "provider_access_changed");
}
