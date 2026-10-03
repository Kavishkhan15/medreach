import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { Job } from "../src/models/Job.js";
import { JobApplication } from "../src/models/JobApplication.js";
import { OrganizationApplication } from "../src/models/OrganizationApplication.js";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { BloodRequest } from "../src/models/BloodRequest.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { signSessionToken } from "./helpers/session.js";
import { retryEmailDelivery, setEmailTransportFactoryForTests } from "../src/services/emailService.js";

const uri = process.env.MEDREACH_PRODUCT_TEST_MONGO_URI;
test("submission email batches preserve records, recipients, tracking, retries and delivery completion", {
  skip: !uri || !/\/medreach_product_integration(?:\?|$)/.test(uri), timeout: 60000,
}, async (t) => {
  await connectDB(uri);
  await mongoose.connection.dropDatabase();
  const previous = { emailEnabled: env.emailEnabled, smtpHost: env.smtpHost, smtpFrom: env.smtpFrom, emailProvider: env.emailProvider };
  let active = 0, peak = 0;
  let failingRecipient;
  const attempts = [];
  try {
    await Promise.all([User, Hospital, ResourceProvider, Job, JobApplication, OrganizationApplication,
      EmergencyRequest, BloodRequest, EmailDelivery].map(model => model.init()));
    Object.assign(env, { emailEnabled: true, smtpHost: "mock.smtp.test", smtpFrom: "qa@medreach.test", emailProvider: "smtp" });
    setEmailTransportFactoryForTests(() => ({ sendMail: async (mail) => {
      active++;
      peak = Math.max(peak, active);
      attempts.push(mail);
      try {
        await new Promise(resolve => setTimeout(resolve, 30));
        if (mail.to === failingRecipient) throw Object.assign(new Error("Test timeout"), { code: "ETIMEDOUT" });
        return { accepted: [mail.to] };
      } finally { active--; }
    } }));
    const staff = await User.create([0, 1, 2].map(index => ({ name: `Batch staff ${index}`,
      email: `staff${index}@email-batch.test`, role: "hospital_admin" })));
    const hospital = await Hospital.create({ name: "Isolated email batch fixture", admins: staff.map(user => user._id) });
    const bank = await ResourceProvider.create({ name: "Isolated blood fixture", kind: "blood_bank", sourceName: "Isolated QA fixture" });
    const job = await Job.create({ hospital: hospital._id, title: "Isolated nurse role", category: "Nurse",
      description: "Healthcare role for isolated automated tests only.", employmentType: "full_time",
      status: "published", createdBy: staff[0]._id });
    const app = createApp();
    for (const kind of ["standard", "emergency", "blood", "urgent", "career", "organization"]) {
      await t.test(`${kind}: all deliveries finish before response and the public reference tracks the saved record`, async () => {
        const patient = await User.create({ name: "Batch patient", email: `${kind}@email-batch.test` });
        const common = { contactEmail: patient.email, contactPhone: "+91 9876543210" };
        const career = { ...common, candidateName: patient.name, sop: "Healthcare qualifications and experience for isolated testing." };
        const bed = ["standard", "emergency"].includes(kind);
        const blood = ["blood", "urgent"].includes(kind);
        const [url, payload] = bed ? [`/api/emergency-requests/${kind}`, { ...common, hospitalId: hospital.id,
          emergencyType: "General care", requiredFacility: "ICU" }]
          : blood ? [`/api/blood-requests/${kind === "urgent" ? "urgent" : "standard"}`, { ...common,
            type: "REQUEST", providerId: bank.id, bloodBankName: bank.name, bloodGroup: "O+",
            patientOrDonorName: patient.name, units: 1, urgency: kind === "urgent" ? "within 6 hours" : "3 days" }]
          : kind === "career" ? [`/api/jobs/${job.id}/apply`, career]
          : [`/api/organizations/${hospital.id}/apply`, { ...career, organizationType: "hospital", roleInterested: "Nurse" }];
        peak = 0; attempts.length = 0;
        const key = `email-batch-${kind}-submission`;
        const submit = async () => {
          const call = request(app).post(url).set("Idempotency-Key", key);
          if (kind !== "emergency") call.set("Authorization", `Bearer ${await signSessionToken(patient)}`);
          return call.send(payload);
        };
        const response = await submit();
        assert.equal(response.status, 201, JSON.stringify(response.body));
        assert.equal(active, 0, "HTTP response must await all delivery attempts");
        assert.ok(peak > 1 && peak <= 3, `bounded overlap expected, observed ${peak}`);
        const expected = bed ? 5 : blood ? 2 : 4;
        assert.equal(attempts.length, expected);
        const record = bed ? response.body.request : blood ? response.body.bloodRequest : response.body.application;
        const reference = bed ? record.requestId : record.reference;
        assert.ok(reference);
        assert.ok(attempts.some(mail => mail.to === patient.email && mail.text.includes(reference)));
        if (!blood) for (const recipient of staff) assert.ok(attempts.some(mail => mail.to === recipient.email));
        assert.equal(await EmailDelivery.countDocuments({ status: "sent" }), expected);
        const track = await request(app).get(`/api/tracking/${bed ? "bed" : blood ? "blood" : "career"}/${reference}`);
        assert.equal(track.status, 200);
        assert.equal(track.body.record.reference, reference);
        const replay = await submit();
        assert.equal(replay.status, 200);
        assert.equal(attempts.length, expected, "idempotent retries must not resend emails");
        assert.equal(await (bed ? EmergencyRequest : blood ? BloodRequest : kind === "career" ? JobApplication : OrganizationApplication).countDocuments(), 1);
        await Promise.all([EmergencyRequest, BloodRequest, JobApplication, OrganizationApplication, EmailDelivery].map(model => model.deleteMany({})));
      });
    }
    await t.test("a staff routing lookup failure still returns the saved application and attempts its confirmation", async (t) => {
      const patient = await User.create({ name: "Routing failure applicant", email: "routing@email-batch.test" });
      attempts.length = 0;
      const mock = t.mock.method(Hospital, "findById", () => ({ select: () => ({ lean: async () => { throw new Error("Test routing outage"); } }) }));
      t.mock.method(console, "warn", () => {});
      try {
        const response = await request(app).post(`/api/jobs/${job.id}/apply`).set("Authorization", `Bearer ${await signSessionToken(patient)}`)
          .send({ candidateName: patient.name, contactEmail: patient.email, contactPhone: "+91 9876543210",
            sop: "Healthcare qualifications and experience for isolated testing." });
        assert.equal(response.status, 201);
        assert.match(response.body.application.reference, /^CAR-/);
        assert.equal(await JobApplication.countDocuments(), 1);
        assert.equal(attempts.length, 1);
        assert.equal(attempts[0].to, patient.email);
        assert.ok(attempts[0].text.includes(response.body.application.reference));
      } finally { mock.mock.restore(); }
      await JobApplication.deleteMany({});
      await EmailDelivery.deleteMany({});
    });
    await t.test("a failed staff delivery leaves the request and other deliveries intact and can be retried", async () => {
      failingRecipient = staff[0].email;
      attempts.length = 0;
      const response = await request(app).post("/api/emergency-requests/emergency").send({ hospitalId: hospital.id,
        emergencyType: "General care", requiredFacility: "ICU", contactPhone: "+91 9876543210", contactEmail: "guest@email-batch.test" });
      assert.equal(response.status, 201);
      assert.equal(active, 0);
      assert.equal(await EmergencyRequest.countDocuments(), 1);
      assert.equal(await EmailDelivery.countDocuments({ status: "sent" }), 4);
      const failed = await EmailDelivery.findOne({ status: "failed" });
      assert.equal(failed.recipient, failingRecipient);
      assert.equal(failed.errorCode, "ETIMEDOUT");
      assert.equal(failed.retryable, true);
      failingRecipient = undefined;
      const retried = await retryEmailDelivery({ deliveryId: failed.id, actorId: staff[1].id });
      assert.equal(retried.delivery.status, "sent");
      assert.equal(attempts.length, 6);
      assert.equal(await EmergencyRequest.countDocuments(), 1);
      assert.equal(await EmailDelivery.countDocuments(), 5);
      assert.equal(await EmailDelivery.countDocuments({ status: "sent" }), 5);
    });
  } finally {
    Object.assign(env, previous);
    setEmailTransportFactoryForTests();
    await mongoose.connection.dropDatabase();
    await disconnectDB();
  }
});
