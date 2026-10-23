// research/experiments/load/seed-load-data.mjs
// Isolated synthetic data seeder for load & reliability testing
// STRICT SAFETY: Connects ONLY to 127.0.0.1:27018, database medreach_load_test.
// NEVER contacts 27017.

import mongoose from "mongoose";
import { Hospital } from "../../../backend/src/models/Hospital.js";
import { AvailabilityObservation } from "../../../backend/src/models/AvailabilityObservation.js";
import { ResourceProvider } from "../../../backend/src/models/ResourceProvider.js";

const TARGET_PORT = "27018";
const TARGET_DB = "medreach_load_test";
const uri = process.env.MONGODB_URI || `mongodb://127.0.0.1:${TARGET_PORT}/${TARGET_DB}`;

console.log(`[SEED-LOAD] Target URI: ${uri}`);

// Verification checks
const url = new URL(uri);
if (url.port !== TARGET_PORT) {
  console.error(`[FATAL] Refusing to seed: Port must be ${TARGET_PORT}, but got ${url.port}`);
  process.exit(1);
}
if (url.port === "27017") {
  console.error(`[FATAL] CRITICAL ERROR: Attempted to contact owner database port 27017! ABORTING.`);
  process.exit(1);
}
const dbName = url.pathname.replace(/^\//, "");
if (dbName !== TARGET_DB) {
  console.error(`[FATAL] Refusing to seed: Database name must be '${TARGET_DB}', got '${dbName}'`);
  process.exit(1);
}

const CITIES = [
  { city: "Mumbai", region: "Maharashtra", lat: 19.0760, lng: 72.8777 },
  { city: "Delhi", region: "Delhi", lat: 28.6139, lng: 77.2090 },
  { city: "Bangalore", region: "Karnataka", lat: 12.9716, lng: 77.5946 },
  { city: "Pune", region: "Maharashtra", lat: 18.5204, lng: 73.8567 },
  { city: "Hyderabad", region: "Telangana", lat: 17.3850, lng: 78.4867 },
  { city: "Chennai", region: "Tamil Nadu", lat: 13.0827, lng: 80.2707 },
];

const SPECIALTIES = [
  "Cardiology", "Neurology", "Emergency Medicine", "Orthopedics",
  "Pediatrics", "Oncology", "Trauma", "Pulmonology"
];

const HOSPITAL_TYPE_LIST = ["Government", "Private", "Trust", "Municipal", "Teaching", "Specialty"];
const FACILITY_LIST = ["ICU", "Emergency Department", "Cardiology", "Neurology", "Pediatrics"];

async function runSeed() {
  await mongoose.connect(uri);
  console.log(`[SEED-LOAD] Connected to MongoDB on port ${TARGET_PORT}, db: ${dbName}`);

  // Drop only the isolated load test database
  await mongoose.connection.dropDatabase();
  console.log(`[SEED-LOAD] Reset clean database: ${dbName}`);

  const hospitalsToInsert = [];
  const observationsToInsert = [];

  for (let i = 1; i <= 60; i++) {
    const locInfo = CITIES[i % CITIES.length];
    // Slightly jitter coordinates
    const lat = locInfo.lat + (Math.random() - 0.5) * 0.1;
    const lng = locInfo.lng + (Math.random() - 0.5) * 0.1;
    const hospitalType = HOSPITAL_TYPE_LIST[i % HOSPITAL_TYPE_LIST.length];
    const specs = [SPECIALTIES[i % SPECIALTIES.length], SPECIALTIES[(i + 2) % SPECIALTIES.length]];

    const hospitalId = new mongoose.Types.ObjectId();
    const slug = `synthetic-load-hospital-${i}`;

    hospitalsToInsert.push({
      _id: hospitalId,
      name: `Synthetic Regional Medical Center ${i}`,
      slug,
      approvalStatus: "approved",
      hospitalType,
      city: locInfo.city,
      region: locInfo.region,
      address: `Synthetic Sector ${i}, ${locInfo.city}`,
      pincode: `4000${String(i).padStart(2, "0")}`,
      location: {
        type: "Point",
        coordinates: [lng, lat],
      },
      phone: `+91 98000 ${String(10000 + i).slice(1)}`,
      emergencyPhone: `+91 98001 ${String(10000 + i).slice(1)}`,
      specialties: specs,
      departments: specs,
      operatingHours: "24/7",
      emergencyDepartmentStatus: i % 4 === 0 ? "available" : i % 4 === 1 ? "limited" : "available",
      isSynthetic: true,
    });

    // Create realistic recent availability observations
    for (const fac of FACILITY_LIST) {
      observationsToInsert.push({
        hospital: hospitalId,
        facility: fac,
        status: i % 5 === 0 ? "limited" : "available",
        quantity: Math.floor(Math.random() * 25) + 2,
        observedAt: new Date(Date.now() - Math.floor(Math.random() * 600000)), // 0-10 mins ago
        retrievedAt: new Date(),
        confidence: "HIGH",
        verificationStatus: "verified",
      });
    }
  }

  await Hospital.insertMany(hospitalsToInsert);
  console.log(`[SEED-LOAD] Seeded ${hospitalsToInsert.length} synthetic hospitals.`);

  await AvailabilityObservation.insertMany(observationsToInsert);
  console.log(`[SEED-LOAD] Seeded ${observationsToInsert.length} availability observations.`);

  // Verify document count
  const countH = await Hospital.countDocuments();
  const countO = await AvailabilityObservation.countDocuments();
  console.log(`[SEED-LOAD] Verification: ${countH} hospitals, ${countO} observations in ${dbName}.`);

  await mongoose.disconnect();
  console.log(`[SEED-LOAD] Disconnected cleanly.`);
}

runSeed().catch((err) => {
  console.error(`[SEED-LOAD] Error during seeding:`, err);
  process.exit(1);
});
