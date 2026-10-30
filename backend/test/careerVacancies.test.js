import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.js";
import { Job } from "../src/models/Job.js";
import { JobApplication } from "../src/models/JobApplication.js";
import { Hospital } from "../src/models/Hospital.js";
import { User } from "../src/models/User.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { signSessionToken } from "./helpers/session.js";
import { careerAvailability } from "../src/services/careerAvailability.js";

test("career transparency distinguishes unknown, zero, demo and deadline expiry", () => {
  assert.equal(careerAvailability({ status: "published" }).remaining, null);
  assert.equal(careerAvailability({ status: "published", vacancies: 0, filledPositions: 0 }).acceptingApplications, false);
  assert.equal(careerAvailability({ status: "published", vacancies: 3, filledPositions: 1 }).remaining, 2);
  assert.equal(careerAvailability({ status: "published", vacancies: 1, filledPositions: 3 }).remaining, null);
  assert.equal(careerAvailability({ status: "published", deadline: new Date(1) }).acceptingApplications, false);
  assert.equal(careerAvailability({ status: "published", demo: true }).source, "demo");
});

test("provider career vacancy integrity and publication", async t => {
  const uri = process.env.MEDREACH_CAREERS_TEST_MONGO_URI || "mongodb://127.0.0.1:27017/medreach_careers_test";
  const target = new URL(uri);
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname) && target.pathname === "/medreach_careers_test", "Only the isolated careers test database may be reset");
  await connectDB(uri);
  t.after(async () => { await mongoose.connection.dropDatabase(); await disconnectDB(); });
  await mongoose.connection.dropDatabase();
  const app = createApp();
  const admin = await User.create({ name: "Assigned HR", email: "hr@vacancy.example", role: "provider_admin", accountStatus: "active" });
  const outsider = await User.create({ name: "Other HR", email: "other@vacancy.example", role: "provider_admin", accountStatus: "active" });
  const candidate = await User.create({ name: "Candidate", email: "candidate@vacancy.example", role: "user", accountStatus: "active" });
  const hospital = await Hospital.create({ name: "Vacancy Test Hospital", slug: "vacancy-test-hospital", approvalStatus: "approved" });
  await ProviderMembership.create({ user: admin._id, kind: "hospital", organization: hospital._id, active: true, accessLevel: "admin", assignedBy: admin._id });
  const token = await signSessionToken(admin), otherToken = await signSessionToken(outsider), candidateToken = await signSessionToken(candidate);
  await JobApplication.init();
  const payload = { hospital: String(hospital._id), title: "Clinical Staff Nurse", category: "Nurse", description: "Provide patient care in the general ward.", employmentType: "full_time", vacancies: 3 };
  let job;
  await t.test("assigned provider creates a draft with vacancies; cannot self-publish", async () => {
    const created = await request(app).post("/api/jobs").set("Authorization", `Bearer ${token}`).send(payload);
    assert.equal(created.status, 201); job = created.body.job;
    assert.equal(job.vacancies, 3); assert.equal(job.filledPositions, 0); assert.equal(job.status, "draft");
    const submit = await request(app).post(`/api/jobs/${job._id}/status`).set("Authorization", `Bearer ${token}`).send({ status: "published" });
    assert.equal(submit.status, 200); assert.equal(submit.body.job.status, "pending");
    assert.equal((await request(app).get(`/api/jobs/${job._id}`)).status, 404);
    await Job.updateOne({ _id: job._id }, { $set: { status: "published", verificationStatus: "verified" } });
  });
  await t.test("outsiders cannot create or alter another organisation's positions", async () => {
    assert.equal((await request(app).post("/api/jobs").set("Authorization", `Bearer ${otherToken}`).send(payload)).status, 403);
    assert.equal((await request(app).patch(`/api/jobs/${job._id}/availability`).set("Authorization", `Bearer ${otherToken}`).send({ vacancies: 9, filledPositions: 0, expectedVersion: 1 })).status, 403);
    assert.equal((await Job.findById(job._id)).vacancies, 3);
  });
  await t.test("simultaneous count updates accept only one version and record the audit", async () => {
    const current = await Job.findById(job._id);
    const results = await Promise.all([1, 2].map(filledPositions => request(app).patch(`/api/jobs/${job._id}/availability`).set("Authorization", `Bearer ${token}`).send({ vacancies: 3, filledPositions, expectedVersion: current.__v })));
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    const saved = await Job.findById(job._id);
    assert.equal(saved.__v, current.__v + 1);
    assert.ok(await AuditLog.exists({ entityType: "Job", entityId: saved._id, "after.version": saved.__v }));
  });
  await t.test("invalid counts, missing versions and forged fields cannot change counts", async () => {
    const current = await Job.findById(job._id);
    for (const patch of [{ vacancies: -1 }, { vacancies: 1.5 }, { vacancies: 10001 }, { vacancies: 1, filledPositions: 2 }, { vacancies: { $gt: 0 } }, { organization: String(hospital._id) }, { expectedVersion: null }]) {
      const result = await request(app).patch(`/api/jobs/${job._id}/availability`).set("Authorization", `Bearer ${token}`).send({ vacancies: 3, filledPositions: 0, expectedVersion: current.__v, ...patch });
      assert.equal(result.status, 400);
    }
    assert.equal((await request(app).patch(`/api/jobs/${job._id}`).set("Authorization", `Bearer ${token}`).send({ vacancies: 999 })).status, 400);
    assert.equal((await Job.findById(job._id)).__v, current.__v);
    const structured = await request(app).post("/api/jobs").set("Authorization", `Bearer ${token}`).send({ ...payload, title: { text: "Forged title" } });
    assert.equal(structured.status, 400);
  });
  await t.test("public responses expose position counts but no applicant identities", async () => {
    const result = await request(app).get(`/api/jobs/${job._id}`);
    assert.equal(result.status, 200); assert.equal(typeof result.body.job.availability.remaining, "number");
    assert.equal(result.body.job.availabilityReportedBy, undefined);
    const listed = await request(app).get("/api/jobs?limit=1&page=1&employmentType=full_time");
    assert.equal(listed.status, 200); assert.equal(listed.body.pagination.limit, 1); assert.equal(listed.body.data.length, 1);
    assert.equal((await request(app).get("/api/jobs?limit=99999")).status, 400);
  });
  await t.test("applying does not consume a position; filled roles stop accepting applications", async () => {
    const before = await Job.findById(job._id);
    const applied = await request(app).post(`/api/jobs/${job._id}/apply`).set("Authorization", `Bearer ${candidateToken}`).send({ sop: "I am qualified for this clinical role and would like to apply." });
    assert.equal(applied.status, 201);
    const after = await Job.findById(job._id); assert.equal(after.filledPositions, before.filledPositions); assert.equal(after.vacancies, before.vacancies);
    const filled = await request(app).patch(`/api/jobs/${job._id}/availability`).set("Authorization", `Bearer ${token}`).send({ vacancies: 3, filledPositions: 3, expectedVersion: after.__v });
    assert.equal(filled.status, 200); assert.equal(filled.body.job.availability.remaining, 0);
    const denied = await request(app).post(`/api/jobs/${job._id}/apply`).set("Authorization", `Bearer ${otherToken}`).send({ sop: "I want to apply after all positions have been filled." });
    assert.equal(denied.status, 409);
    assert.equal(await JobApplication.countDocuments({ job: job._id }), 1);
  });
  await t.test("explicit unknown count stays unknown and legacy records are not backfilled", async () => {
    const current = await Job.findById(job._id);
    const result = await request(app).patch(`/api/jobs/${job._id}/availability`).set("Authorization", `Bearer ${token}`).send({ vacancies: null, filledPositions: 3, expectedVersion: current.__v });
    assert.equal(result.status, 200); assert.equal(result.body.job.availability.remaining, null);
    const legacy = await Job.collection.insertOne({ ...payload, hospital: hospital._id, vacancies: undefined, title: "Historical unknown role", status: "published", createdBy: admin._id });
    const list = await request(app).get("/api/jobs");
    assert.equal(list.body.data.find(row => row._id === String(legacy.insertedId)).availability.remaining, null);
    assert.equal((await Job.collection.findOne({ _id: legacy.insertedId })).availabilityReportedAt, undefined);
    const explicit = await request(app).patch(`/api/jobs/${legacy.insertedId}/availability`).set("Authorization", `Bearer ${token}`).send({ vacancies: 4, filledPositions: 1, expectedVersion: 0 });
    assert.equal(explicit.status, 200); assert.equal(explicit.body.job.availability.remaining, 3);
  });
});
