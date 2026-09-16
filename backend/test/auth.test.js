// Auth + RBAC tests that don't touch the DB (validation + token + role gating
// all run before any Mongoose query).
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { signToken, verifyToken } from "../src/utils/token.js";

const app = createApp();

test("register with invalid body → 400", async () => {
  const res = await request(app).post("/api/auth/register").send({ email: "bad", password: "x" });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "Validation failed");
});

test("GET /api/auth/me without token → 401", async () => {
  const res = await request(app).get("/api/auth/me");
  assert.equal(res.status, 401);
});

test("RBAC: non-admin creating a hospital → 403", async () => {
  const token = signToken({ _id: "507f1f77bcf86cd799439011", role: "user", email: "u@x.io", name: "U" });
  const res = await request(app)
    .post("/api/hospitals")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Fake Hospital" });
  assert.equal(res.status, 403);
});

test("hospital staff cannot create a hospital and assign themselves ownership", async () => {
  const token = signToken({ _id: "507f1f77bcf86cd799439011", role: "hospital_admin", email: "h@x.io", name: "H" });
  const res = await request(app).post("/api/hospitals")
    .set("Authorization", `Bearer ${token}`).send({ name: "Unverified Hospital" });
  assert.equal(res.status, 403);
});

test("token sign/verify roundtrip", () => {
  const t = signToken({ _id: "abc123", role: "admin", email: "a@x.io", name: "A" });
  const p = verifyToken(t);
  assert.equal(p.sub, "abc123");
  assert.equal(p.role, "admin");
});

test("facility claim review is restricted to system admins", async () => {
  const token = signToken({ _id: "507f1f77bcf86cd799439011", role: "hospital_admin", email: "h@x.io", name: "H" });
  const res = await request(app)
    .post("/api/admin/facility-claims/507f1f77bcf86cd799439012/review")
    .set("Authorization", `Bearer ${token}`)
    .send({ decision: "approve" });
  assert.equal(res.status, 403);
});

test("conflict evidence is restricted to system admins", async () => {
  const token = signToken({ _id: "507f1f77bcf86cd799439011", role: "hospital_admin", email: "h@x.io", name: "H" });
  const res = await request(app).get("/api/admin/data-conflicts")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 403);
});

test("hospital staff cannot run the global crawler", async () => {
  const token = signToken({ _id: "507f1f77bcf86cd799439011", role: "hospital_admin", email: "h@x.io", name: "H" });
  const res = await request(app).post("/api/crawler/run-all")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(res.status, 403);
});

test("facility claim review validates decisions before touching MongoDB", async () => {
  const token = signToken({ _id: "507f1f77bcf86cd799439011", role: "system_admin", email: "a@x.io", name: "A" });
  const res = await request(app)
    .post("/api/admin/facility-claims/507f1f77bcf86cd799439012/review")
    .set("Authorization", `Bearer ${token}`)
    .send({ decision: "publish_without_review" });
  assert.equal(res.status, 400);
});

test("scheduler control requires runtime configuration before accepting pause", async () => {
  const token = signToken({ _id: "507f1f77bcf86cd799439011", role: "system_admin", email: "a@x.io", name: "A" });
  const res = await request(app).post("/api/crawler/scheduler")
    .set("Authorization", `Bearer ${token}`).send({ paused: true });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /CRAWLER_SCHEDULER_ENABLED/);
});
