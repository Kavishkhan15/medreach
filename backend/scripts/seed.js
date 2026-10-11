// Seed the database with comprehensive Mumbai hospitals, diagnostic centres, blood banks, users, and alerts.
// Requires a running MongoDB (MONGO_URI). Run: npm --workspace backend run seed
import { isolatedDemoEnabled, setDemoPassword } from "../src/services/demoAccounts.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { Hospital } from "../src/models/Hospital.js";
import { User } from "../src/models/User.js";
import { Alert } from "../src/models/Alert.js";
import { BloodCampaign } from "../src/models/BloodCampaign.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { hospitals, adminSeed, userSeed, bloodCampaignsSeed, mumbaiDiagnosticsAndBloodBanks } from "../src/data/seedData.js";

async function run() {
  await connectDB();
  if (!isolatedDemoEnabled()) throw new Error("Legacy dataset seeding is restricted to an isolated local demo database with email disabled. Use non-destructive account provisioning for existing data.");
  await Promise.all([
    Hospital.deleteMany({}),
    User.deleteMany({}),
    Alert.deleteMany({}),
    BloodCampaign.deleteMany({}),
    ResourceProvider.deleteMany({}),
  ]);

  const admin = new User({ email: "admin@medreach.com", name: adminSeed.name, region: adminSeed.region, role: "system_admin" });
  await setDemoPassword(admin);
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

  const { seedCareersFromProviders } = await import("../src/services/careerJobSeeder.js");
  const seededJobs = await seedCareersFromProviders({ adminId: admin._id });

  console.log(`Successfully seeded Mumbai healthcare network:`);
  console.log(`  - ${createdHospitals.length} Hospitals across South Mumbai, Western, Central & Harbour corridors`);
  console.log(`  - ${createdResources.length} Diagnostic centres, pathology labs & blood banks`);
  console.log(`  - ${bloodCampaignsSeed.length} Blood campaigns`);
  console.log(`  - ${seededJobs.length} draft demo job listings awaiting verification`);
  console.log(`  - 2 Users (Admin & Registered User)`);
  console.log(`  - 1 Emergency Alert`);
  await disconnectDB();
}

run().catch((e) => {
  console.error("[seed] failed — is MongoDB running?\n", e.message);
  process.exit(1);
});
