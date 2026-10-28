import { randomUUID } from "node:crypto";
import { organizationIsAvailable } from "./providerLifecycle.js";
import { User } from "../models/User.js";
import { ProviderMembership, PROVIDER_KINDS } from "../models/ProviderMembership.js";
import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { findOrganization } from "./providerAccess.js";
import { credentialLabel, demoLoginEmail, isolatedDemoEnabled, setDemoPassword, localManualCredentialsEnabled } from "./demoAccounts.js";
import { issueProviderActivation } from "./providerInvitation.js";
import { revokeAllSessions } from "./authTokenService.js";
import { writeAudit } from "../utils/audit.js";
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export const validContact = (email) => typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !/\.(example|test|invalid|localhost)$/i.test(email);
function serializeAccount(user, organizations) {
  return { _id: String(user._id), name: user.name, email: user.email, role: user.role, accountStatus: user.accountStatus,
    organizations, invitationStatus: user.activationDeliveryStatus || (user.demoAccount ? "not_required" : "unknown"), notificationEmail: user.notificationEmail || "", notificationsEnabled: Boolean(user.notificationsEnabled),
    notificationContactVerified: Boolean(user.notificationEmailVerifiedAt), credentialLabel: credentialLabel(user), demo: isolatedDemoEnabled() && user.demoAccount,
    demoLoginId: /\.example$/i.test(user.email), passwordSet: Boolean(user.passwordHash),
    passwordStatus: user.passwordHash ? "Set (secure hash only)" : "Not set",
    credentialRevision: Number(user.authVersion || 0), credentialDelivery: user.credentialDelivery || "invitation" };
}
export async function accountViews(users) {
  if (!users.length) return [];
  const assignments = await ProviderMembership.find({ user: { $in: users.map(user => user._id) } }).lean();
  const hospitals = assignments.filter(row => row.kind === "hospital").map(row => row.organization);
  const providers = assignments.filter(row => row.kind !== "hospital").map(row => row.organization);
  const [hospitalRows, providerRows] = await Promise.all([
    hospitals.length ? Hospital.find({ _id: { $in: hospitals } }).select("name").lean() : [],
    providers.length ? ResourceProvider.find({ _id: { $in: providers } }).select("name kind").lean() : [],
  ]);
  const names = new Map([
    ...hospitalRows.map(row => [`hospital:${row._id}`, row.name]),
    ...providerRows.map(row => [`${row.kind}:${row._id}`, row.name]),
  ]);
  const byUser = new Map();
  for (const row of assignments) {
    const key = String(row.user);
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push({ _id: String(row._id), organizationId: String(row.organization), kind: row.kind,
      name: names.get(`${row.kind}:${row.organization}`) || "Organisation unavailable", active: row.active, accessLevel: row.accessLevel || "admin" });
  }
  return users.map(user => serializeAccount(user, byUser.get(String(user._id)) || []));
}
export async function accountView(user) {
  return (await accountViews([user]))[0];
}
// Post-write eligibility closes the gap where archive cleanup ran before a new
// assignment was inserted. Only this write's token may be compensatively disabled.
export async function verifyAssignmentAfterWrite(membership, mutationToken) {
  let available;
  try { available = await organizationIsAvailable(membership.kind, membership.organization); }
  catch (error) {
    try { await ProviderMembership.updateOne({ _id: membership._id, assignmentMutation: mutationToken, active: true }, { $set: { active: false } }); } catch { /* access resolution also fails closed */ }
    throw Object.assign(new Error("Assignment verification unavailable", { cause: error }), { status: 503 });
  }
  if (!available) {
    await ProviderMembership.updateOne({ _id: membership._id, assignmentMutation: mutationToken, active: true }, { $set: { active: false } });
    fail("Organisation became archived or unavailable; assignment was not activated", 409);
  }
}
export async function addAssignment(user, { kind, organizationId, accessLevel = "admin" }, actor, allowPending = false) {
  if (!["admin", "inventory_reporter", "reviewer"].includes(accessLevel)) fail("Invalid staff access level");
  if (user.role !== "provider_admin" || !PROVIDER_KINDS.includes(kind)) fail("Invalid provider assignment");
  const org = await findOrganization(kind, organizationId);
  if (!org || !await organizationIsAvailable(kind, organizationId) || (org.verificationStatus !== "verified" || org.approvalStatus === "rejected" || (!allowPending && org.approvalStatus === "pending"))) fail("An approved organisation is required", 409);
  // Adding an assignment never overwrites or reactivates an existing one.
  const assignmentMutation = randomUUID();
  const membership = await ProviderMembership.findOneAndUpdate({ user: user._id, kind, organization: org._id },
    { $setOnInsert: { active: true, assignedBy: actor, assignmentMutation, accessLevel } }, { upsert: true, new: true, runValidators: true });
  if ((membership.accessLevel || "admin") !== accessLevel) fail("Existing staff access differs; use explicit access review", 409);
  await verifyAssignmentAfterWrite(membership, assignmentMutation);
  await writeAudit({ user: actor, action: "create", entityType: "ProviderMembership", entityId: membership._id,
    after: { user: user._id, kind, organization: org._id, accessLevel } });
  return membership;
}
export async function provisionProvider({ kind, organizationId, loginEmail, notificationEmail, accessLevel = "admin", demo = false, provisioningKey }, actor, allowPending = false, { deferInvitation = false, manualLogin = false } = {}) {
  if (!PROVIDER_KINDS.includes(kind)) fail("Invalid provider type");
  if (!["admin", "inventory_reporter", "reviewer"].includes(accessLevel)) fail("Invalid staff access level");
  const organization = await findOrganization(kind, organizationId);
  if (!organization || !await organizationIsAvailable(kind, organizationId) || (organization.verificationStatus !== "verified" || organization.approvalStatus === "rejected" || (!allowPending && organization.approvalStatus === "pending"))) fail("Approve the organisation before provisioning", 409);
  if (demo && !isolatedDemoEnabled()) fail("Demo accounts require an isolated demo database with email disabled", 403);
  const email = (loginEmail || demoLoginEmail(organization, kind)).trim().toLowerCase();
  const manualIdentifier = manualLogin && deferInvitation && localManualCredentialsEnabled() && /^admin@[a-z0-9-]+-[a-f0-9]{24}\.example$/.test(email);
  if (!email || (!demo && loginEmail && !validContact(email) && !manualIdentifier)) fail("A real login email is required outside demo mode");
  if (notificationEmail && !validContact(notificationEmail)) fail("A real notification contact is required");
  if (!demo && !deferInvitation && !validContact(notificationEmail || email)) fail("A real invitation recipient is required");
  const previous = provisioningKey && await User.findOne({ provisioningKey }).select("+provisioningOrganization +passwordHash +authVersion");
  if (previous) {
    if (previous.role !== "provider_admin" || previous.email !== email || previous.provisioningOrganization !== `${kind}:${organizationId}`) fail("Provisioning details changed; review the existing account", 409);
    await addAssignment(previous, { kind, organizationId, accessLevel }, actor, allowPending);
    let invitation = "check_delivery_status";
    if (!deferInvitation && !previous.demoAccount && previous.accountStatus === "pending" && previous.activationDeliveryStatus === "pending") {
      try { invitation = (await issueProviderActivation(previous)).status; } catch { invitation = "failed"; }
    }
    return { account: await accountView(previous), invitation };
  }
  if (await User.exists({ email })) fail("This login email already exists. Use explicit assignment management; credentials will not be overwritten", 409);
  const user = new User({ name: organization.name, email, provisioningKey, provisioningOrganization: `${kind}:${organizationId}`, role: "provider_admin", activationDeliveryStatus: demo ? "not_required" : deferInvitation ? "unknown" : "pending", accountStatus: demo ? "active" : "pending",
    notificationEmail: notificationEmail || (demo || deferInvitation ? undefined : email), notificationsEnabled: false });
  if (demo) await setDemoPassword(user);
  await user.save();
  await addAssignment(user, { kind, organizationId, accessLevel }, actor, allowPending);
  await writeAudit({ user: actor, action: "create", entityType: "ProviderAccount", entityId: user._id,
    after: { role: user.role, organization: organization._id, demo: Boolean(demo) } });
  let invitation = "not_required";
  if (deferInvitation) invitation = "contact_required";
  else if (!demo) { try { invitation = (await issueProviderActivation(user)).status; } catch { invitation = "failed"; } }
  return { account: await accountView(user), invitation };
}
export async function revokeProviderAccess(user) {
  user.authVersion = Number(user.authVersion || 0) + 1;
  await user.save();
  await revokeAllSessions(user._id, "provider_access_changed");
}
