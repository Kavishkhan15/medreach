import { ProviderMembership } from "../backend/src/models/ProviderMembership.js";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../backend/src/config/db.js";
import { Hospital } from "../backend/src/models/Hospital.js";
import { Job } from "../backend/src/models/Job.js";
import { ResourceProvider } from "../backend/src/models/ResourceProvider.js";
import { User } from "../backend/src/models/User.js";

const uri = process.env.MEDREACH_E2E_MONGO_URI || process.env.MONGO_URI;
if (!uri) throw new Error("MEDREACH_E2E_MONGO_URI is required");

const databaseName = new URL(uri).pathname.slice(1);
if (!databaseName.toLowerCase().includes("e2e")) {
  throw new Error(`Refusing to reset non-E2E database: ${databaseName || "<missing>"}`);
}

const password = "E2E_SafePassword_123!";
const variants = ["bootstrap", "tailwind", "skeleton"];

try {
  await connectDB(uri);
  await mongoose.connection.dropDatabase();

  const admin = new User({
    name: "E2E System Admin",
    email: "admin.e2e@medreach.test",
    role: "system_admin",
    region: "Mumbai",
    emailVerifiedAt: new Date(),
  });
  await admin.setPassword(password);
  await admin.save();

  const staff = new User({
    name: "E2E Hospital Staff",
    email: "staff.e2e@medreach.test",
    role: "hospital_admin",
    region: "Mumbai",
    emailVerifiedAt: new Date(),
  });
  await staff.setPassword(password);
  await staff.save();

  for (const variant of variants) {
    const user = new User({
      name: `E2E ${variant} User`,
      email: `${variant}.e2e@medreach.test`,
      role: "user",
      region: "Mumbai",
      emergencyContact: "+91 98765 40000",
      emailVerifiedAt: new Date(),
    });
    await user.setPassword(password);
    await user.save();
  }

  const hospital = await Hospital.create({
    name: "MedReach E2E Hospital",
    slug: "medreach-e2e-hospital",
    city: "Mumbai",
    locality: "Bandra West",
    address: "E2E Test Campus, Bandra West, Mumbai",
    phone: "+91 22 4000 1000",
    emergencyPhone: "+91 22 4000 1122",
    verificationStatus: "verified",
    facilities: [],
    specialties: ["Emergency Medicine", "Critical Care"],
    services: ["Emergency Department", "ICU"],
    location: { type: "Point", coordinates: [72.8295, 19.0596] },
    admins: [staff._id],
  });

  await ResourceProvider.create([
    {
      kind: "blood_bank",
      name: "MedReach E2E Blood Bank",
      sourceName: "E2E controlled fixture",
      locality: "Bandra West",
      phone: "+91 22 4000 2000",
      verificationStatus: "verified",
      listedBloodGroups: ["A+", "O+", "AB-"],
      services: ["Blood components"],
      location: { type: "Point", coordinates: [72.831, 19.061] },
    },
    {
      kind: "diagnostic",
      name: "MedReach E2E Diagnostics",
      approvalStatus: "approved",
      sourceName: "E2E controlled fixture",
      locality: "Bandra West",
      phone: "+91 22 4000 3000",
      verificationStatus: "verified",
      services: ["CT", "MRI", "Pathology"],
      location: { type: "Point", coordinates: [72.832, 19.062] },
    },
    {
      kind: "ambulance",
      name: "MedReach E2E Ambulance",
      sourceName: "E2E controlled fixture",
      locality: "Bandra West",
      phone: "+91 22 4000 4000",
      email: "dispatch.e2e@medreach.test",
      verificationStatus: "verified",
      services: ["Basic Life Support"],
      location: { type: "Point", coordinates: [72.833, 19.063] },
    },
  ]);

  const support = new User({ name: "E2E Regular User", email: "support.e2e@medreach.test", role: "user", region: "Mumbai", emailVerifiedAt: new Date() });
  await support.setPassword(password); await support.save();
  const bloodBank = await ResourceProvider.findOne({ kind: "blood_bank" });
  const diagnostic = await ResourceProvider.findOne({ kind: "diagnostic" });
  for (const variant of variants) {
    const provider = new User({ name: `E2E ${variant} Provider`, email: `${variant}.provider.e2e@medreach.test`, role: "provider_admin", region: "Mumbai", emailVerifiedAt: new Date() });
    await provider.setPassword(password); await provider.save();
    await ProviderMembership.create([{ user: provider._id, kind: "hospital", organization: hospital._id, assignedBy: admin._id },
      { user: provider._id, kind: "blood_bank", organization: bloodBank._id, assignedBy: admin._id }]);
  }
  const diagnosticAdmin = new User({ name: "E2E Diagnostic Admin", email: "diagnostic.provider.e2e@medreach.test", role: "provider_admin", region: "Mumbai", emailVerifiedAt: new Date() });
  await diagnosticAdmin.setPassword(password); await diagnosticAdmin.save();
  await ProviderMembership.create({ user: diagnosticAdmin._id, kind: "diagnostic", organization: diagnostic._id, assignedBy: admin._id });
  await Job.create({
    hospital: hospital._id,
    organizationType: "hospital",
    organizationName: hospital.name,
    title: "E2E Emergency Nurse",
    category: "Nurse",
    description: "Controlled published listing used only by the MedReach browser release checks.",
    requirements: "Registered nurse with emergency care experience.",
    employmentType: "full_time",
    location: "Bandra West, Mumbai",
    status: "published",
    verificationStatus: "verified",
    createdBy: admin._id,
    reviewedBy: admin._id,
    demo: false,
  });

  console.log(JSON.stringify({ database: databaseName, hospital: hospital.id, users: variants.length + 2 }));
} finally {
  await disconnectDB();
}
