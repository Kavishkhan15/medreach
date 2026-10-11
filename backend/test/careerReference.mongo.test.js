import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { Job } from "../src/models/Job.js";
import { JobApplication } from "../src/models/JobApplication.js";
import { OrganizationApplication } from "../src/models/OrganizationApplication.js";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { EmailDelivery } from "../src/models/EmailDelivery.js";
import { signSessionToken } from "./helpers/session.js";
import { careerSubmission, createCareerApplication } from "../src/utils/careerReference.js";
import { env } from "../src/config/env.js";
import { setEmailTransportFactoryForTests } from "../src/services/emailService.js";

const uri = process.env.MEDREACH_TEST_MONGO_URI || "mongodb://127.0.0.1:27017/medreach_career_reference_test";

test("career public references persist through submission, retry, review and tracking", async (t) => {
  assert.match(new URL(uri).pathname, /(?:_test|_integration)$/);
  await connectDB(uri);
  await mongoose.connection.dropDatabase();
  const emailEnvironment = { emailEnabled: env.emailEnabled, smtpHost: env.smtpHost, smtpFrom: env.smtpFrom, emailProvider: env.emailProvider };
  const sent = [];
  try {
    Object.assign(env, { emailEnabled: true, smtpHost: "mock.smtp.test", smtpFrom: "qa@medreach.test", emailProvider: "smtp" });
    setEmailTransportFactoryForTests(() => ({ sendMail: async (mail) => { sent.push(mail); return { accepted: [mail.to] }; } }));
    const app = createApp();
    const applicant = await User.create({ name: "Private applicant", email: "candidate@career-reference.test" });
    const staff = await User.create({ name: "Hospital staff", email: "staff@career-reference.test", role: "hospital_admin", notificationsEnabled: true, notificationEmail: "staff@career-reference.test", notificationEmailVerifiedAt: new Date() });
    const other = await User.create({ name: "Other applicant", email: "other@career-reference.test" });
    const hospital = await Hospital.create({ name: "Career reference test hospital", slug: "career-reference-test", admins: [staff._id] });
    const job = await Job.create({ hospital: hospital._id, title: "Healthcare test role", category: "Nurse",
      description: "A healthcare role used only by this isolated integration suite.", employmentType: "full_time",
      status: "published", createdBy: staff._id });
    await Promise.all([JobApplication.init(), OrganizationApplication.init()]);
    const token = await signSessionToken(applicant);
    const staffToken = await signSessionToken(staff);
    const payload = { candidateName: "Private applicant", contactEmail: applicant.email, contactPhone: "+91 9876543210",
      sop: "Private application statement with healthcare qualifications and experience.", reference: "CAR-J00000000000000" };
    let jobRecord;
    let organizationRecord;

    await t.test("job submission returns a server reference and stores it without using the document ID", async () => {
      const response = await request(app).post(`/api/jobs/${job._id}/apply`).set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", "career-job-reference-first-submit").send(payload);
      assert.equal(response.status, 201);
      assert.match(response.body.application.reference, /^CAR-J[A-F0-9]{14}$/);
      assert.notEqual(response.body.application.reference, payload.reference);
      assert.equal(response.body.application._id, undefined);
      jobRecord = await JobApplication.findOne({ reference: response.body.application.reference });
      assert.ok(jobRecord);
      assert.notEqual(jobRecord.reference, jobRecord._id.toString());
      assert.equal(jobRecord.status, "submitted");
      assert.equal(jobRecord.applicant.toString(), applicant.id);
      assert.equal((await EmailDelivery.findOne({ eventKey: `mail:application:${jobRecord.id}:submitted` })).template, "job_applied");
      assert.equal((await EmailDelivery.findOne({ eventKey: `application:${jobRecord.id}:received:${staff.id}` })).template, "job_application_received");
      assert.equal(await mongoose.connection.collection("notifications").countDocuments(), 0);
      const confirmation = sent.find((mail) => mail.to === applicant.email && mail.subject === "Application submitted");
      assert.ok(confirmation.text.includes(jobRecord.reference));
      assert.ok(confirmation.text.includes(`/track?type=career&reference=${jobRecord.reference}`));
      assert.equal(confirmation.text.includes(jobRecord._id.toString()), false);
    });

    await t.test("organization submission has its own server-generated public reference", async () => {
      const response = await request(app).post(`/api/organizations/${hospital._id}/apply`).set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", "career-organization-reference-first-submit")
        .send({ ...payload, organizationType: "hospital", roleInterested: "Nurse" });
      assert.equal(response.status, 201);
      assert.match(response.body.application.reference, /^CAR-O[A-F0-9]{14}$/);
      assert.equal(response.body.application._id, undefined);
      organizationRecord = await OrganizationApplication.findOne({ reference: response.body.application.reference });
      assert.ok(organizationRecord);
      assert.notEqual(organizationRecord.reference, organizationRecord._id.toString());
      assert.notEqual(organizationRecord.reference, jobRecord.reference);
      assert.equal((await EmailDelivery.findOne({ eventKey: `mail:org_application:${organizationRecord.id}:submitted` })).template, "org_applied");
      assert.equal((await EmailDelivery.findOne({ eventKey: `org_application:${organizationRecord.id}:received:${staff.id}` })).template, "org_application_received");
      const confirmation = sent.find((mail) => mail.to === applicant.email && mail.text.includes(organizationRecord.reference));
      assert.ok(confirmation.text.includes(`/track?type=career&reference=${organizationRecord.reference}`));
      assert.equal(confirmation.text.includes(organizationRecord._id.toString()), false);
    });

    await t.test("idempotent retries return the original reference and create no new application", async () => {
      const jobRetry = await request(app).post(`/api/jobs/${job._id}/apply`).set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", "career-job-reference-first-submit").send(payload);
      const organizationRetry = await request(app).post(`/api/organizations/${hospital._id}/apply`).set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", "career-organization-reference-first-submit")
        .send({ ...payload, organizationType: "hospital", roleInterested: "Nurse" });
      assert.equal(jobRetry.status, 200);
      assert.equal(jobRetry.body.application.reference, jobRecord.reference);
      assert.equal(jobRetry.body.application._id, undefined);
      assert.equal(organizationRetry.status, 200);
      assert.equal(organizationRetry.body.application.reference, organizationRecord.reference);
      assert.equal(organizationRetry.body.application._id, undefined);
      assert.equal(await JobApplication.countDocuments({ job: job._id, applicant: applicant._id }), 1);
      assert.equal(await OrganizationApplication.countDocuments({ hospital: hospital._id, applicant: applicant._id }), 1);
    });

    await t.test("application history exposes persisted public references for both application types", async () => {
      const response = await request(app).get("/api/applications/mine").set("Authorization", `Bearer ${token}`);
      assert.equal(response.status, 200);
      assert.deepEqual(new Set(response.body.data.map((item) => item.reference)), new Set([jobRecord.reference, organizationRecord.reference]));
      for (const item of response.body.data) assert.equal(item._id, undefined);
      assert.equal(response.body.data.find((item) => item.applicationType === "job").job.title, job.title);
    });

    await t.test("guest tracking returns only reference, actual status and updated time for both application types", async () => {
      for (const record of [jobRecord, organizationRecord]) {
        const response = await request(app).get(`/api/tracking/career/${record.reference.toLowerCase()}`)
          .set("Cookie", "token=expired-session");
        assert.equal(response.status, 200);
        assert.equal(response.headers["cache-control"], "no-store");
        assert.deepEqual(Object.keys(response.body), ["record"]);
        assert.deepEqual(Object.keys(response.body.record).sort(), ["reference", "status", "updatedAt"]);
        assert.equal(response.body.record.reference, record.reference);
        assert.equal(response.body.record.status, "submitted");
        assert.ok(response.body.record.updatedAt);
        assert.equal(JSON.stringify(response.body).includes(applicant.email), false);
        assert.equal(JSON.stringify(response.body).includes(payload.sop), false);
      }
    });

    await t.test("staff review changes are reflected by the public career lookup", async () => {
      const jobReview = await request(app).patch(`/api/applications/${jobRecord._id}`).set("Authorization", `Bearer ${staffToken}`)
        .send({ status: "shortlisted" });
      const organizationReview = await request(app).patch(`/api/organization-applications/${organizationRecord._id}`)
        .set("Authorization", `Bearer ${staffToken}`).send({ status: "under_review" });
      assert.equal(jobReview.status, 200);
      assert.equal(organizationReview.status, 200);
      assert.equal((await EmailDelivery.findOne({ eventKey: `mail:application:${jobRecord.id}:shortlisted` })).template, "job_updated");
      assert.equal((await EmailDelivery.findOne({ eventKey: `mail:org_application:${organizationRecord.id}:under_review` })).template, "org_application_updated");
      assert.equal((await request(app).get(`/api/tracking/career/${jobRecord.reference}`)).body.record.status, "shortlisted");
      assert.equal((await request(app).get(`/api/tracking/career/${organizationRecord.reference}`)).body.record.status, "under_review");
    });

    await t.test("public references grant no access to review or another applicant's private records", async () => {
      assert.equal((await request(app).patch(`/api/applications/${jobRecord._id}`).send({ status: "rejected" })).status, 401);
      assert.equal((await request(app).patch(`/api/applications/${jobRecord._id}`)
        .set("Authorization", `Bearer ${await signSessionToken(other)}`).send({ status: "rejected" })).status, 403);
      const mine = await request(app).get("/api/applications/mine").set("Authorization", `Bearer ${await signSessionToken(other)}`);
      assert.equal(mine.status, 200);
      assert.equal(mine.body.data.some((application) => application.reference === jobRecord.reference), false);
      assert.equal((await request(app).patch(`/api/tracking/career/${jobRecord.reference}`).send({ status: "rejected" })).status, 404);
    });

    await t.test("malformed, MongoDB ID, wrong-type and unknown references do not retrieve applications", async () => {
      for (const path of [`career/${jobRecord._id}`, "career/not-a-reference", `blood/${jobRecord.reference}`,
        `bed/${jobRecord.reference}`, "career/BR-20261002-AABBCC"]) {
        assert.equal((await request(app).get(`/api/tracking/${path}`)).status, 400, path);
      }
      assert.equal((await request(app).get("/api/tracking/career/CAR-JFFFFFFFFFFFFFF")).status, 404);
    });

    await t.test("database uniqueness prevents duplicate references independently of applicant/job uniqueness", async () => {
      await assert.rejects(JobApplication.create({ job: job._id, applicant: other._id, contactEmail: other.email,
        reference: jobRecord.reference, statement: payload.sop }), (error) => error.code === 11000);
      await assert.rejects(OrganizationApplication.create({ organizationType: "hospital", hospital: hospital._id,
        roleInterested: "Nurse", applicant: other._id, contactEmail: other.email, reference: organizationRecord.reference,
        statement: payload.sop }), (error) => error.code === 11000);
    });

    await t.test("concurrent submissions receive distinct references across both application models", async () => {
      const candidates = await User.create(Array.from({ length: 4 }, (_, index) => ({
        name: `Concurrent candidate ${index}`, email: `concurrent-${index}@career-reference.test`,
      })));
      const authentications = await Promise.all(candidates.map(async (candidate) => `Bearer ${await signSessionToken(candidate)}`));
      const responses = await Promise.all(candidates.flatMap((candidate, index) => {
        const authentication = authentications[index];
        return [request(app).post(`/api/jobs/${job._id}/apply`).set("Authorization", authentication)
          .send({ ...payload, contactEmail: candidate.email }),
        request(app).post(`/api/organizations/${hospital._id}/apply`).set("Authorization", authentication)
          .send({ ...payload, contactEmail: candidate.email, organizationType: "hospital", roleInterested: "Nurse" })];
      }));
      for (const response of responses) assert.equal(response.status, 201);
      const references = responses.map((response) => response.body.application.reference);
      assert.equal(new Set(references).size, responses.length);
      for (const reference of references) assert.match(reference, /^CAR-[JO][A-F0-9]{14}$/);
    });

    await t.test("legacy application references are persisted before sharing and stay stable across concurrent reads", async () => {
      for (const [model, fields] of [[JobApplication, { job: job._id }],
        [OrganizationApplication, { organizationType: "hospital", hospital: hospital._id, roleInterested: "Nurse" }]]) {
        const legacyUser = await User.create({ name: "Legacy applicant", email: `legacy-${model.modelName}@career-reference.test` });
        const scope = model === JobApplication ? "job-application" : "organization-application";
        const retryKey = `legacy-career-${model.modelName}-retry`;
        const inserted = await model.collection.insertOne({ ...fields, applicant: legacyUser._id, contactEmail: legacyUser.email,
          idempotencyKeyHash: createHash("sha256").update(`${scope}:${retryKey}`).digest("hex"),
          status: "submitted", createdAt: new Date(), updatedAt: new Date() });
        const [first, concurrent] = await Promise.all([model.findById(inserted.insertedId), model.findById(inserted.insertedId)]);
        const [result, concurrentResult] = await Promise.all([careerSubmission(first), careerSubmission(concurrent)]);
        assert.match(result.reference, /^CAR-[JO][A-F0-9]{14}$/);
        assert.equal(result.reference, concurrentResult.reference);
        const stored = await model.collection.findOne({ _id: inserted.insertedId });
        assert.equal(stored.reference, result.reference);
        assert.equal((await careerSubmission(await model.findById(inserted.insertedId))).reference, result.reference);
        assert.equal((await request(app).get(`/api/tracking/career/${result.reference}`)).status, 200);
        const path = model === JobApplication ? `/api/jobs/${job._id}/apply` : `/api/organizations/${hospital._id}/apply`;
        const replay = await request(app).post(path).set("Authorization", `Bearer ${await signSessionToken(legacyUser)}`)
          .set("Idempotency-Key", retryKey).send({ ...payload, organizationType: "hospital", roleInterested: "Nurse" });
        assert.equal(replay.status, 200);
        assert.equal(replay.body.application.reference, result.reference);
        assert.equal(replay.body.application._id, undefined);
        const history = await request(app).get("/api/applications/mine").set("Authorization", `Bearer ${await signSessionToken(legacyUser)}`);
        assert.equal(history.status, 200);
        assert.equal(history.body.data[0].reference, result.reference);
        assert.equal(history.body.data[0]._id, undefined);
      }
    });

    await t.test("bed tracking resolves the public requestId while keeping patient data and internal ID private", async () => {
      const bed = await EmergencyRequest.create({ requestId: "MR-MUR00000-AABBCC", hospital: hospital._id,
        emergencyType: "Standard bed request", requiredFacility: "ICU", contactPhone: "+91 9876543210",
        contactEmail: "private-patient@career-reference.test", patientSummary: "Private patient medical summary",
        expiresAt: new Date(Date.now() + 3600000), isEmergency: false });
      const response = await request(app).get(`/api/tracking/bed/${bed.requestId.toLowerCase()}`);
      assert.equal(response.status, 200);
      assert.deepEqual(Object.keys(response.body.record).sort(), ["reference", "status", "updatedAt"]);
      assert.equal(response.body.record.reference, bed.requestId);
      assert.equal(response.body.record.status, "REQUESTED");
      await EmergencyRequest.updateOne({ _id: bed._id }, { $set: { status: "UNDER_REVIEW" } });
      assert.equal((await request(app).get(`/api/tracking/bed/${bed.requestId}`)).body.record.status, "UNDER_REVIEW");
      assert.equal((await request(app).get(`/api/tracking/bed/${bed._id}`)).status, 400);
      assert.equal((await request(app).get("/api/tracking/bed/MR-MUR00000-FFFFFF")).status, 404);
    });
  } finally {
    Object.assign(env, emailEnvironment);
    setEmailTransportFactoryForTests();
    await mongoose.connection.dropDatabase();
    await disconnectDB();
  }
});

test("career creation retries only reference collisions and preserves other duplicate errors", async () => {
  const payload = { candidateName: "Candidate" };
  const referenceCollision = Object.assign(new Error("Reference collision"), { code: 11000, keyPattern: { reference: 1 } });
  let attempts = 0;
  const created = { reference: "CAR-JAAAAAAAAAAAAAA" };
  assert.equal(await createCareerApplication({ create: async (value) => {
    assert.equal(value, payload);
    if (attempts++ === 0) throw referenceCollision;
    return created;
  } }, payload), created);
  assert.equal(attempts, 2);
  const applicationCollision = Object.assign(new Error("Already applied"), { code: 11000, keyPattern: { job: 1, applicant: 1 } });
  attempts = 0;
  await assert.rejects(createCareerApplication({ create: async () => { attempts++; throw applicationCollision; } }, payload),
    (error) => error === applicationCollision);
  assert.equal(attempts, 1);
  attempts = 0;
  await assert.rejects(createCareerApplication({ create: async () => { attempts++; throw referenceCollision; } }, payload),
    (error) => error === referenceCollision);
  assert.equal(attempts, 5);
});
