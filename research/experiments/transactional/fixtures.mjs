import mongoose from "mongoose";
import { assertSafeUri, TEST_MONGO_URI } from "./db-guard.mjs";
import { User } from "../../../backend/src/models/User.js";
import { Hospital } from "../../../backend/src/models/Hospital.js";
import { ResourceProvider } from "../../../backend/src/models/ResourceProvider.js";
import { ProviderMembership } from "../../../backend/src/models/ProviderMembership.js";
import { EmergencyRequest } from "../../../backend/src/models/EmergencyRequest.js";
import { BloodRequest } from "../../../backend/src/models/BloodRequest.js";
import { AmbulanceBooking } from "../../../backend/src/models/AmbulanceBooking.js";
import { AvailabilityObservation } from "../../../backend/src/models/AvailabilityObservation.js";
import { AuthToken } from "../../../backend/src/models/AuthToken.js";
import { AuditLog } from "../../../backend/src/models/AuditLog.js";
import { issueSession } from "../../../backend/src/services/authTokenService.js";
import { signToken } from "../../../backend/src/utils/token.js";

const DEFAULT_PASSWORD = "TxSafePassword_123!";

export async function setupTestFixtures() {
  assertSafeUri(TEST_MONGO_URI);
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(TEST_MONGO_URI);
  }

  console.log("[fixtures] Ensuring schema indexes on test DB...");
  await Promise.all([
    EmergencyRequest.createIndexes(),
    BloodRequest.createIndexes(),
    AmbulanceBooking.createIndexes(),
    User.createIndexes(),
    Hospital.createIndexes(),
    ResourceProvider.createIndexes(),
    ProviderMembership.createIndexes(),
    AvailabilityObservation.createIndexes(),
    AuthToken.createIndexes(),
    AuditLog.createIndexes(),
  ]);

  console.log("[fixtures] Resetting existing test collections in medreach_research_test...");
  await Promise.all([
    EmergencyRequest.deleteMany({}),
    BloodRequest.deleteMany({}),
    AmbulanceBooking.deleteMany({}),
    User.deleteMany({ email: /.*\.tx@medreach\.test$/ }),
    Hospital.deleteMany({ slug: "medreach-tx-research-hospital" }),
    ResourceProvider.deleteMany({ sourceName: "TX Research controlled fixture" }),
    ProviderMembership.deleteMany({}),
    AvailabilityObservation.deleteMany({}),
    AuthToken.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);

  console.log("[fixtures] Seeding users...");
  const admin = new User({
    name: "TX System Admin",
    email: "admin.tx@medreach.test",
    role: "system_admin",
    region: "Mumbai",
    accountStatus: "active",
    emailVerifiedAt: new Date(),
  });
  await admin.setPassword(DEFAULT_PASSWORD);
  await admin.save();

  const staff1 = new User({
    name: "TX Hospital Staff 1",
    email: "staff1.tx@medreach.test",
    role: "hospital_admin",
    region: "Mumbai",
    accountStatus: "active",
    emailVerifiedAt: new Date(),
  });
  await staff1.setPassword(DEFAULT_PASSWORD);
  await staff1.save();

  const staff2 = new User({
    name: "TX Hospital Staff 2",
    email: "staff2.tx@medreach.test",
    role: "hospital_admin",
    region: "Mumbai",
    accountStatus: "active",
    emailVerifiedAt: new Date(),
  });
  await staff2.setPassword(DEFAULT_PASSWORD);
  await staff2.save();

  const patient1 = new User({
    name: "TX Patient 1",
    email: "patient1.tx@medreach.test",
    role: "user",
    region: "Mumbai",
    emergencyContact: "+91 98765 00001",
    accountStatus: "active",
    emailVerifiedAt: new Date(),
  });
  await patient1.setPassword(DEFAULT_PASSWORD);
  await patient1.save();

  const patient2 = new User({
    name: "TX Patient 2",
    email: "patient2.tx@medreach.test",
    role: "user",
    region: "Mumbai",
    emergencyContact: "+91 98765 00002",
    accountStatus: "active",
    emailVerifiedAt: new Date(),
  });
  await patient2.setPassword(DEFAULT_PASSWORD);
  await patient2.save();

  const ambulanceAdmin = new User({
    name: "TX Ambulance Admin",
    email: "ambulance.admin.tx@medreach.test",
    role: "provider_admin",
    region: "Mumbai",
    accountStatus: "active",
    emailVerifiedAt: new Date(),
  });
  await ambulanceAdmin.setPassword(DEFAULT_PASSWORD);
  await ambulanceAdmin.save();

  const bloodAdmin = new User({
    name: "TX Blood Admin",
    email: "blood.admin.tx@medreach.test",
    role: "provider_admin",
    region: "Mumbai",
    accountStatus: "active",
    emailVerifiedAt: new Date(),
  });
  await bloodAdmin.setPassword(DEFAULT_PASSWORD);
  await bloodAdmin.save();

  console.log("[fixtures] Seeding hospital and providers...");
  const hospital = await Hospital.create({
    name: "MedReach TX Research Hospital",
    slug: "medreach-tx-research-hospital",
    city: "Mumbai",
    locality: "Bandra West",
    address: "100 Research Lane, Bandra West, Mumbai",
    phone: "+91 22 5555 0100",
    emergencyPhone: "+91 22 5555 0199",
    approvalStatus: "approved",
    verificationStatus: "verified",
    specialties: ["Emergency Medicine", "Critical Care", "Trauma"],
    services: ["Emergency Department", "ICU", "Blood Storage"],
    facilities: ["ICU", "Ventilator", "Emergency Department"],
    location: { type: "Point", coordinates: [72.83, 19.06] },
    admins: [staff1._id, staff2._id],
  });

  const ambulanceProvider = await ResourceProvider.create({
    kind: "ambulance",
    name: "MedReach TX Ambulance Provider",
    sourceName: "TX Research controlled fixture",
    locality: "Bandra West",
    phone: "+91 22 5555 0200",
    email: "dispatch.tx@medreach.test",
    approvalStatus: "approved",
    verificationStatus: "verified",
    active: true,
    services: ["Basic Life Support", "Advanced Life Support"],
    location: { type: "Point", coordinates: [72.831, 19.061] },
  });

  const bloodProvider = await ResourceProvider.create({
    kind: "blood_bank",
    name: "MedReach TX Blood Bank",
    sourceName: "TX Research controlled fixture",
    locality: "Bandra West",
    phone: "+91 22 5555 0300",
    email: "blood.tx@medreach.test",
    approvalStatus: "approved",
    verificationStatus: "verified",
    active: true,
    listedBloodGroups: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
    services: ["Whole Blood", "Platelets", "Packed Red Blood Cells"],
    location: { type: "Point", coordinates: [72.832, 19.062] },
  });

  await ProviderMembership.create([
    { user: staff1._id, kind: "hospital", organization: hospital._id, assignedBy: admin._id },
    { user: staff2._id, kind: "hospital", organization: hospital._id, assignedBy: admin._id },
    { user: ambulanceAdmin._id, kind: "ambulance", organization: ambulanceProvider._id, assignedBy: admin._id },
    { user: bloodAdmin._id, kind: "blood_bank", organization: bloodProvider._id, assignedBy: admin._id },
  ]);

  // Initial AvailabilityObservation (e.g. 5 ICU beds reported available)
  const initialObs = await AvailabilityObservation.create({
    hospital: hospital._id,
    facility: "ICU",
    status: "available",
    quantity: 5,
    observedAt: new Date(),
    retrievedAt: new Date(),
    verificationStatus: "verified",
    verifiedBy: staff1._id,
  });

  console.log("[fixtures] Fixture seeding complete.");
  return {
    admin,
    staff1,
    staff2,
    patient1,
    patient2,
    ambulanceAdmin,
    bloodAdmin,
    hospital,
    ambulanceProvider,
    bloodProvider,
    initialObs,
  };
}

export async function createAuthenticatedSession(user) {
  const reqContext = { ip: "127.0.0.1", userAgent: "MedReach-TX-Research-Harness/1.0" };
  const { token: refreshToken, entry } = await issueSession(user, reqContext);
  await user.save();
  const accessToken = signToken(user, entry.familyId);
  return {
    accessToken,
    refreshToken,
    authHeaders: {
      Authorization: `Bearer ${accessToken}`,
      Cookie: `token=${accessToken}; refresh_token=${refreshToken}`,
      Origin: "http://localhost:3000",
    },
  };
}
