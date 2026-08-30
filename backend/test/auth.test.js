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

test("token sign/verify roundtrip", () => {
  const t = signToken({ _id: "abc123", role: "admin", email: "a@x.io", name: "A" });
  const p = verifyToken(t);
  assert.equal(p.sub, "abc123");
  assert.equal(p.role, "admin");
});
