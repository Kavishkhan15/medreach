// Additive, idempotent product demo data. Never resets stored hospitals or claims.
// Run explicitly: node backend/scripts/seedProductDemo.js --demo
import { connectDB, disconnectDB } from "../src/config/db.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { Job } from "../src/models/Job.js";
import { User } from "../src/models/User.js";

if (!process.argv.includes("--demo")) {
  console.error("Pass --demo to add clearly labeled simulation records.");
  process.exit(2);
}

await connectDB();
try {
  const fixtures = [
    { kind: "blood_bank", name: "MedReach DEMO Blood Bank", services: ["Blood bank"], locality: "Bandra" },
    { kind: "diagnostic", name: "MedReach DEMO Diagnostics", services: ["CT", "MRI", "X-ray"], locality: "Andheri" },
    { kind: "ambulance", name: "MedReach DEMO Ambulance Provider", providerType: "Basic transport", coverageArea: "Mumbai demo region", locality: "Dadar" },
  ];
  for (const item of fixtures) await ResourceProvider.findOneAndUpdate({ kind: item.kind, name: item.name },
    { $setOnInsert: { ...item, sourceName: "MedReach demo fixture — simulation only", confidence: "UNKNOWN",
      verificationStatus: "unverified", demo: true } }, { upsert: true, runValidators: true });
  const hospital = await Hospital.findOne().sort({ name: 1 }).lean();
  const admin = await User.findOne({ role: { $in: ["admin", "system_admin"] } }).lean();
  if (hospital && admin) await Job.findOneAndUpdate({ hospital: hospital._id, title: "DEMO • Emergency Nurse" },
    { $setOnInsert: { hospital: hospital._id, title: "DEMO • Emergency Nurse", category: "Nurse",
      description: "Simulation listing for MedReach product evaluation. No real employment offer or application delivery to this hospital.",
      employmentType: "full_time", location: "Mumbai", status: "published", verificationStatus: "unverified",
      createdBy: admin._id, demo: true } }, { upsert: true, runValidators: true });
  console.log("Added or retained 3 clearly labeled demo providers" + (hospital && admin ? " and 1 demo job" : "; demo job skipped (hospital/admin missing)"));
} finally { await disconnectDB(); }
