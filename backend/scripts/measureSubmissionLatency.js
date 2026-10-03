import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import request from "supertest";
// Run only against the disposable database below.
if (process.env.NODE_ENV !== "test") throw new Error("Run with NODE_ENV=test");

const root = new URL("../src/", import.meta.url).href;
const { createApp } = await import(root + "app.js");
const { connectDB, disconnectDB } = await import(root + "config/db.js");
const { env } = await import(root + "config/env.js");
const { signToken } = await import(root + "utils/token.js");
const { issueSession } = await import(root + "services/authTokenService.js");
const { setEmailTransportFactoryForTests } = await import(root + "services/emailService.js");
const models = {};
for (const name of ["User", "Hospital", "ResourceProvider", "Job", "JobApplication", "OrganizationApplication", "EmailDelivery", "EmergencyRequest", "BloodRequest"]) {
  models[name] = (await import(root + `models/${name}.js`))[name];
}
// This benchmark deletes only its dedicated disposable database. It replaces
// SMTP with a delayed local mock; no messages leave this process.
const uri = process.env.MEDREACH_LATENCY_TEST_MONGO_URI || "mongodb://127.0.0.1:27017/medreach_latency_test";
const parsed = new URL(uri);
if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol) || parsed.pathname !== "/medreach_latency_test") {
  throw new Error("Benchmark must use the isolated medreach_latency_test database");
}
const db = await connectDB(uri);
await db.dropDatabase();
try {
  await Promise.all(Object.values(models).map(model => model.init()));
  Object.assign(env, { emailEnabled: true, smtpHost: "mock.smtp.test", smtpFrom: "qa@medreach.test", emailProvider: "smtp" });
  let active = 0, peak = 0, deliveries = 0;
  setEmailTransportFactoryForTests(() => ({ sendMail: async () => {
    active++; peak = Math.max(peak, active); deliveries++;
    await new Promise(resolve => setTimeout(resolve, 150));
    active--;
    return { accepted: ["test"] };
  } }));
  const staff = await models.User.create([0, 1, 2].map(i => ({ name: `Staff ${i}`, email: `staff${i}@latency.test`, role: "hospital_admin" })));
  const hospital = await models.Hospital.create({ name: "Isolated latency fixture", admins: staff.map(user => user._id) });
  const bank = await models.ResourceProvider.create({ name: "Isolated blood fixture", kind: "blood_bank", sourceName: "Isolated QA fixture" });
  const job = await models.Job.create({ hospital: hospital._id, title: "Test role", category: "Nurse", description: "Isolated test role", employmentType: "full_time", status: "published", createdBy: staff[0]._id });
  const app = createApp();
  const measurements = {};
  for (const kind of ["bed", "blood", "career", "organization"]) {
    const times = []; const peaks = []; const counts = [];
    for (let i = 0; i < 5; i++) {
      const patient = await models.User.create({ name: "Latency fixture", email: `${kind}${i}@latency.test` });
      const common = { contactPhone: "+91 9876543210", contactEmail: patient.email };
      const career = { ...common, candidateName: patient.name, sop: "Healthcare qualifications and experience for isolated testing." };
      const [url, payload] = kind === "bed" ? ["/api/emergency-requests/standard", { ...common, hospitalId: hospital.id, emergencyType: "General care", requiredFacility: "ICU" }]
        : kind === "blood" ? ["/api/blood-requests/standard", { ...common, type: "REQUEST", providerId: bank.id, bloodBankName: bank.name, bloodGroup: "O+", patientOrDonorName: patient.name, units: 1, urgency: "3 days" }]
        : kind === "career" ? [`/api/jobs/${job.id}/apply`, career]
        : [`/api/organizations/${hospital.id}/apply`, { ...career, organizationType: "hospital", roleInterested: "Nurse" }];
      peak = 0; deliveries = 0;
      const started = performance.now();
      const response = await request(app).post(url).set("Authorization", `Bearer ${signToken(patient, (await issueSession(patient)).entry.familyId)}`).send(payload);
      times.push(Math.round(performance.now() - started)); peaks.push(peak); counts.push(deliveries);
      assert.equal(response.status, 201, JSON.stringify(response.body)); assert.equal(active, 0);
    }
    times.sort((a,b) => a-b);
    measurements[kind] = { samples: times, p50Ms: times[2], maxMs: times[4], peakConcurrentDeliveries: peaks, deliveryCounts: counts };
  }
  console.log(JSON.stringify({ smtpDelayMs: 150, staffCount: 3, measurements }, null, 2));
} finally { await db.dropDatabase(); await disconnectDB(); }
