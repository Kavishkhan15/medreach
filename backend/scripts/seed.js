// Seed the database with demo hospitals, an admin, a user, and one alert.
// Requires a running MongoDB (MONGO_URI). Run: npm --workspace backend run seed
import { connectDB, disconnectDB } from "../src/config/db.js";
import { Hospital } from "../src/models/Hospital.js";
import { User } from "../src/models/User.js";
import { Alert } from "../src/models/Alert.js";
import { BloodCampaign } from "../src/models/BloodCampaign.js";
import { hospitals, adminSeed, userSeed, bloodCampaignsSeed } from "../src/data/seedData.js";

async function run() {
  await connectDB();
  await Promise.all([Hospital.deleteMany({}), User.deleteMany({}), Alert.deleteMany({}), BloodCampaign.deleteMany({})]);

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

  const created = await Hospital.insertMany(hospitals.map((h) => ({ ...h, admins: [admin._id] })));

  await Alert.create({
    title: "Heat advisory in effect",
    body: "High temperatures expected. Stay hydrated; ERs may see increased load.",
    severity: "warning",
    region: "Central",
    createdBy: admin._id,
  });

  await BloodCampaign.insertMany(bloodCampaignsSeed.map((c) => ({ ...c, createdBy: admin._id })));

  console.log(`Seeded ${created.length} hospitals, 2 users, 1 alert, ${bloodCampaignsSeed.length} blood campaigns.`);
  await disconnectDB();
}

run().catch((e) => {
  console.error("[seed] failed — is MongoDB running?\n", e.message);
  process.exit(1);
});
