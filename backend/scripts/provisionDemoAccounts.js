// Non-destructive provisioning, only against an explicitly named loopback demo DB.
import mongoose from "mongoose";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { isolatedDemoEnabled, setDemoPassword, demoLoginEmail } from "../src/services/demoAccounts.js";
import { provisionProvider } from "../src/services/providerAccounts.js";
const uri = process.env.MEDREACH_DEMO_MONGO_URI;
if (!process.argv.includes("--demo") || !uri || !/^mongodb:\/\/(?:localhost|127\.0\.0\.1):\d+\/medreach_demo(?:_[a-z0-9]+)*$/.test(uri)) throw new Error("Explicit --demo and a loopback medreach_demo database URI are required");
try {
  await mongoose.connect(uri);
  if (!isolatedDemoEnabled()) throw new Error("Demo database isolation and disabled email are required");
  let system = await User.findOne({ email: "admin@medreach.com" });
  if (system && (system.role !== "system_admin" || !system.demoAccount)) throw new Error("Existing account requires manual review; nothing will be overwritten");
  if (!system) {
    system = new User({ email: "admin@medreach.com", name: "Demo System Admin", role: "system_admin", accountStatus: "active", region: "Mumbai" });
    await setDemoPassword(system); await system.save();
  }
  const organizations = [...(await Hospital.find({ verificationStatus: "verified" })).map((org) => ({ org, kind: "hospital" })),
    ...(await ResourceProvider.find({ verificationStatus: "verified", active: { $ne: false } })).map((org) => ({ org, kind: org.kind }))];
  for (const { org, kind } of organizations) {
    const email = demoLoginEmail(org, kind);
    if (await User.exists({ email })) { console.log(`Skipped existing account for ${org.name}; credentials and assignments unchanged.`); continue; }
    await provisionProvider({ kind, organizationId: org._id, demo: true, provisioningKey: `demo:${kind}:${org._id}` }, system._id);
    console.log(`Provisioned demo account for ${org.name}.`);
  }
  console.log("Demo provisioning completed without deleting, reseeding, migrating or overwriting existing records.");
} finally { await mongoose.disconnect(); }
