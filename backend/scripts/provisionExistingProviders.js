// Existing-data provisioning. No seeds, migrations, passwords or external email.
// Dry run by default; --apply requires an explicit verified local target.
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { provisionProvider } from "../src/services/providerAccounts.js";
import { guardSystemAdminMutation } from "../src/services/adminMutationGuard.js";
import { demoLoginEmail } from "../src/services/demoAccounts.js";
const normalized = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export async function existingProviderInventory() {
  const hospitals = await Hospital.find().lean(), resources = await ResourceProvider.find().lean();
  const groups = hospitals.map((h) => ({ key: `hospital:${h._id}`, name: h.name, organizations: [{ kind: "hospital", id: String(h._id), name: h.name }], eligible: h.verificationStatus === "verified" && !["pending", "rejected"].includes(h.approvalStatus) }));
  for (const p of resources) {
    const linked = p.hospital && groups.find((g) => g.key === `hospital:${p.hospital}`);
    const row = { kind: p.kind, id: String(p._id), name: p.name };
    const eligible = p.verificationStatus === "verified" && !["pending", "rejected"].includes(p.approvalStatus) && p.active !== false;
    if (linked && eligible) linked.organizations.push(row);
    else groups.push({ key: `${p.kind}:${p._id}`, name: p.name, organizations: [row], eligible: eligible && !p.hospital, review: p.hospital ? "Missing or ineligible parent hospital; review ownership" : undefined });
  }
  // Text hints cannot establish ownership. Flag possible hospital service duplicates
  // rather than making a second account or inferring a shared assignment.
  for (const group of groups.filter((g) => !g.key.startsWith("hospital:"))) {
    const providerName = group.name.toLowerCase();
    const matches = hospitals.filter((h) => {
      const alias = h.name.match(/\(([A-Z]{3,6})\)/)?.[1];
      const tokens = h.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !["hospital", "medical", "research", "centre", "center", "general", "charitable", "municipal", "government", "sir", "foundation", "and", "the"].includes(w));
      return (alias && new RegExp(`\\b${alias}\\b`, "i").test(group.name)) || (tokens.length >= 2 && tokens.every((w) => providerName.includes(w)));
    });
    if (matches.length) group.review = `Possible hospital service without an explicit ownership link: ${matches.map((h) => h.name).join(", ")}`;
  }
  const memberships = await ProviderMembership.find().lean();
  const users = await User.find().select("+provisioningKey +provisioningOrganization").lean();
  for (const group of groups) {
    const first = group.organizations[0];
    const assigned = memberships.filter((m) => group.organizations.some((o) => o.kind === m.kind && o.id === String(m.organization)));
    const linkedUsers = users.filter((u) => assigned.some((m) => String(m.user) === String(u._id)));
    // Any existing assignment requires review; never reactivate or override it.
    group.existingAccounts = linkedUsers.map((u) => ({ id: String(u._id), email: u.email, status: u.accountStatus }));
    group.login = demoLoginEmail({ name: group.name, _id: first.id }, first.kind);
    if (!assigned.length && !group.review && groups.some((g) => g !== group && normalized(g.name) === normalized(group.name))) group.review = "Duplicate organisation name without an explicit ownership link";
    const resumable = users.find((u) => u.email === group.login && u.role === "provider_admin" && u.accountStatus === "pending" && u.provisioningKey === `existing:${group.key}` && u.provisioningOrganization === `${first.kind}:${first.id}`);
    const incomplete = resumable && group.organizations.some((o) => !assigned.some((m) => String(m.user) === String(resumable._id) && m.kind === o.kind && String(m.organization) === o.id));
    if (!assigned.length && !group.review && users.some((u) => u.email === group.login) && !resumable) group.review = "Login collision without an existing assignment";
    group.action = assigned.length ? "retain_existing_assignments" : group.eligible && !group.review ? "provision_pending_contact_required" : "manual_review";
    if (incomplete && group.eligible && !group.review) group.action = "resume_pending_assignments";
  }
  return groups;
}
export async function provisionExistingProviders(actor) {
  return guardSystemAdminMutation(actor, async () => {
    const inventory = await existingProviderInventory(), results = [];
    for (const group of inventory) {
      if (!["provision_pending_contact_required", "resume_pending_assignments"].includes(group.action)) { results.push(group); continue; }
      const first = group.organizations[0];
      const result = await provisionProvider({ kind: first.kind, organizationId: first.id, provisioningKey: `existing:${group.key}` }, actor, false, { deferInvitation: true });
      for (const org of group.organizations.slice(1)) {
        const { addAssignment } = await import("../src/services/providerAccounts.js");
        await addAssignment(await User.findById(result.account._id), { kind: org.kind, organizationId: org.id }, actor);
      }
      results.push({ ...group, accountId: result.account._id, created: group.action !== "resume_pending_assignments", status: "pending", loginTested: false });
    }
    return results;
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.NODE_ENV === "production") throw new Error("Local-only operation");
  const uri = process.env.MEDREACH_EXISTING_LOCAL_URI;
  if (uri !== "mongodb://127.0.0.1:27017/medreach") throw new Error("Explicit canonical loopback medreach URI required");
  try {
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
    const options = await mongoose.connection.db.admin().command({ getCmdLineOpts: 1 });
    if (options.parsed.storage.dbPath !== "/home/anonymous/medreach/data") throw new Error("Canonical storage not confirmed");
    const admins = await User.find({ role: "system_admin", accountStatus: "active" }).lean();
    if (admins.length !== 1) throw new Error("Choose and review the local System Admin explicitly before provisioning");
    const results = process.argv.includes("--apply") ? await provisionExistingProviders(admins[0]._id) : await existingProviderInventory();
    console.log(JSON.stringify(results, null, 2));
  } finally { await mongoose.disconnect(); }
}
