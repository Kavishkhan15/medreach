// Seed the database with comprehensive Mumbai hospitals, diagnostic centres, blood banks, users, and alerts.
// Requires a running MongoDB (MONGO_URI). Run: npm --workspace backend run seed
import { connectDB, disconnectDB } from "../src/config/db.js";
import { Hospital } from "../src/models/Hospital.js";
import { User } from "../src/models/User.js";
import { Alert } from "../src/models/Alert.js";
import { BloodCampaign } from "../src/models/BloodCampaign.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { hospitals, adminSeed, userSeed, bloodCampaignsSeed, mumbaiDiagnosticsAndBloodBanks } from "../src/data/seedData.js";

async function run() {
  await connectDB();
  await Promise.all([
    Hospital.deleteMany({}),
    User.deleteMany({}),
    Alert.deleteMany({}),
    BloodCampaign.deleteMany({}),
    ResourceProvider.deleteMany({}),
  ]);

  const admin = new User({ email: adminSeed.email, name: adminSeed.name, region: adminSeed.region, role: "admin" });
  await admin.setPassword(adminSeed.password);
  await admin.save();

  const user = new User({
    email: userSeed.email,
    name: userSeed.name,
    region: userSeed.region,
    emergencyContact: userSeed.emergencyContact,
  });
  await user.setPassword(userSeed.password);
  await user.save();

  const createdHospitals = await Hospital.insertMany(hospitals.map((h) => ({ ...h, admins: [admin._id] })));

  const createdResources = await ResourceProvider.insertMany(mumbaiDiagnosticsAndBloodBanks);

  await Alert.create({
    title: "Monsoon Emergency Readiness & High-Tide Advisory",
    body: "BMC Disaster Management Cell alert: High tide expected along Marine Drive and Bandra Bandstand. Emergency casualty and trauma units across KEM, Sion, and Cooper are on standby.",
    severity: "warning",
    region: "South Mumbai",
    createdBy: admin._id,
  });

  await BloodCampaign.insertMany(bloodCampaignsSeed.map((c) => ({ ...c, createdBy: admin._id })));

  console.log(`Successfully seeded Mumbai healthcare network:`);
  console.log(`  - ${createdHospitals.length} Hospitals across South Mumbai, Western, Central & Harbour corridors`);
  console.log(`  - ${createdResources.length} Diagnostic centres, pathology labs & blood banks`);
  console.log(`  - ${bloodCampaignsSeed.length} Blood campaigns`);
  console.log(`  - 2 Users (Admin & Registered User)`);
  console.log(`  - 1 Emergency Alert`);
  await disconnectDB();
}

run().catch((e) => {
  console.error("[seed] failed — is MongoDB running?\n", e.message);
  process.exit(1);
});
