import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Hospital } from "../src/models/Hospital.js";
import { ResourceProvider } from "../src/models/ResourceProvider.js";
import { ProviderMembership } from "../src/models/ProviderMembership.js";
import { Job } from "../src/models/Job.js";
import { signSessionToken } from "./helpers/session.js";

const uri = process.env.MEDREACH_PERFORMANCE_TEST_MONGO_URI;
const isolated = Boolean(uri && /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_performance_test$/.test(uri));
test("directory performance preserves response contracts and private data boundaries", { skip: !isolated }, async t => {
  await mongoose.connect(uri, { monitorCommands: true });
  await mongoose.connection.dropDatabase();
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  const app = createApp();
  const system = await User.create({ name: "Performance fixture", email: "system@performance.test", role: "system_admin" });
  const auth = { Authorization: `Bearer ${await signSessionToken(system)}` };
  const hospital = await Hospital.create({ name: "Performance hospital", verificationStatus: "verified" });
  const resource = await ResourceProvider.create({ name: "Performance blood bank", kind: "blood_bank", sourceName: "Isolated fixture", verificationStatus: "verified" });
  for (let i = 0; i < 6; i++) {
    const user = await User.create({ name: `Provider ${i}`, email: `provider-${i}@performance.test`, role: "provider_admin" });
    await ProviderMembership.create({ user: user._id, kind: i % 2 ? "blood_bank" : "hospital",
      organization: i % 2 ? resource._id : hospital._id, assignedBy: system._id, active: i !== 5 });
  }
  await Job.create({ title: "Test clinical role", hospital: hospital._id, organizationName: hospital.name,
    description: "Isolated job description. ".repeat(120), category: "Nurse", employmentType: "full_time",
    status: "published", createdBy: system._id });

  await t.test("provider accounts batch organisation reads without exposing password hashes or losing inactive assignments", async () => {
    const reads = [];
    const client = mongoose.connection.getClient();
    const listen = event => { if (event.commandName === "find") reads.push(event.command.find); };
    client.on("commandStarted", listen);
    const response = await request(app).get("/api/admin/provider-accounts").set(auth);
    client.off("commandStarted", listen);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 6);
    assert.ok(reads.filter(name => ["providermemberships", "hospitals", "resourceproviders"].includes(name)).length <= 3, JSON.stringify(reads));
    assert.equal(response.body.data.flatMap(row => row.organizations).filter(org => !org.active).length, 1);
    assert.ok(response.body.data.every(row => !("passwordHash" in row) && row.organizations[0].name.startsWith("Performance")));
    assert.match(response.headers["cache-control"], /no-store/);
  });
  await t.test("homepage job summaries omit full descriptions and retain the normal Careers contract", async () => {
    const full = await request(app).get("/api/jobs");
    const summary = await request(app).get("/api/jobs?view=summary");
    assert.equal(full.status, 200); assert.equal(summary.status, 200);
    assert.equal(summary.body.data[0].title, full.body.data[0].title);
    assert.equal(summary.body.data[0]._id, full.body.data[0]._id);
    assert.ok(full.body.data[0].description.length > 1000);
    assert.equal(summary.body.data[0].description, undefined);
    assert.ok(summary.text.length < full.text.length / 3);
  });
  await t.test("public directories compress and revalidate; authenticated responses remain uncacheable", async () => {
    const response = await request(app).get("/api/jobs").set("Accept-Encoding", "gzip");
    assert.equal(response.status, 200);
    assert.equal(response.headers["content-encoding"], "gzip");
    assert.equal(response.body.data.length, 1);
    assert.equal(response.headers["cache-control"], "public, no-cache");
    assert.ok(response.headers.vary.includes("Accept-Encoding"));
    const unchanged = await request(app).get("/api/jobs").set("If-None-Match", response.headers.etag);
    assert.equal(unchanged.status, 304);
    const privateResponse = await request(app).get("/api/jobs").set(auth).set("Accept-Encoding", "gzip");
    assert.match(privateResponse.headers["cache-control"], /no-store/);
    assert.equal(privateResponse.headers["content-encoding"], undefined);
  });
});
