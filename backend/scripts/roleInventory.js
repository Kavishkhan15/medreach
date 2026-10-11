// Read-only inventory: native driver only; no model initialization/index writes.
import mongoose from "mongoose";
const { MongoClient } = mongoose.mongo;
import { env } from "../src/config/env.js";
export async function roleInventory(db) {
  const accounts = await db.collection("users").find({ role: { $in: ["admin", "hospital_admin", "user_admin"] } },
    { projection: { email: 1, name: 1, role: 1, accountStatus: 1 } }).sort({ email: 1 }).toArray();
  const hospitals = await db.collection("hospitals").find({ admins: { $in: accounts.map((a) => a._id) } }, { projection: { name: 1, admins: 1 } }).toArray();
  const activeSystemAdmins = await db.collection("users").find({ role: "system_admin", accountStatus: "active" }, { projection: { email: 1, name: 1, notificationsEnabled: 1, notificationEmailVerifiedAt: 1 } }).toArray();
  const mappings = accounts.map((account) => {
    const assignments = hospitals.filter((h) => h.admins?.some((id) => String(id) === String(account._id))).map((h) => ({ _id: String(h._id), name: h.name }));
    const eligible = account.role === "hospital_admin" && assignments.length > 0 && account.accountStatus === "active";
    return { _id: String(account._id), email: account.email, name: account.name, currentRole: account.role,
      accountStatus: account.accountStatus || "unknown", proposedRole: eligible ? "provider_admin" : account.role === "user_admin" ? "user" : null,
      preserveHospitalAssignments: assignments,
      manualReview: !eligible,
      reason: account.role === "user_admin" ? "Retired support role; propose regular user after individual review" : account.role === "admin" ? "System Admin eligibility requires individual approval; no automatic promotion" : !assignments.length ? "No hospital assignment found" : account.accountStatus !== "active" ? "Inactive or unknown account status requires review" : "Preserve each hospital assignment as an explicit membership; password stays unchanged" };
  });
  const counts = {};
  for (const collection of await db.listCollections({}, { nameOnly: true }).toArray()) counts[collection.name] = await db.collection(collection.name).countDocuments();
  return { readOnly: true, database: db.databaseName, activeSystemAdmins, systemAdminLockoutRisk: activeSystemAdmins.length === 0,
    legacyAccountCount: accounts.length, mappings, collectionCounts: counts,
    migrationApplied: false, nextStep: "Review mappings and approve migration separately. No write-capable migration is included." };
}
if (process.argv[1]?.endsWith("roleInventory.js")) {
  const client = new MongoClient(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  try { await client.connect(); console.log(JSON.stringify(await roleInventory(client.db()), null, 2)); }
  catch { console.error("Read-only role inventory unavailable: check database connectivity and read permissions. No migration was applied."); process.exitCode = 1; }
  finally { await client.close(); }
}
