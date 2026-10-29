import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import express from "express";
import { createApp } from "../src/app.js";
import { safeInputKeys, rejectUnsafeBodyKeys } from "../src/middleware/inputShape.js";
import { User } from "../src/models/User.js";

test("nested operators, dotted/bracketed fields and prototype keys never reach account queries", async t => {
  let lookups = 0;
  t.mock.method(User, "findOne", () => { lookups++; throw new Error("Unexpected lookup"); });
  const app = createApp();
  const payloads = [
    '{"email":{"$ne":null},"password":"anything"}',
    '{"email":"someone@example.test","password":"anything","$or":[{}]}',
    '{"email":"someone@example.test","password":"anything","metadata":[{"filter":{"$where":"return true"}}]}',
    '{"profile.role":"system_admin"}', '{"profile[role]":"system_admin"}',
    '{"__proto__":{"role":"system_admin"}}', '{"metadata":{"constructor":{"prototype":{"role":"system_admin"}}}}',
  ];
  for (const raw of payloads) {
    const res = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send(raw);
    assert.equal(res.status, 400);
    assert.equal(res.headers["set-cookie"], undefined);
    assert.equal(JSON.stringify(res.body).includes("someone@example.test"), false);
  }
  assert.equal(lookups, 0);
  assert.equal({}.role, undefined);
});

test("body guard protects all JSON routes and preserves ordinary text and arrays", async () => {
  const app = express();
  app.use(express.json(), rejectUnsafeBodyKeys);
  app.post("/", (req, res) => res.json(req.body));
  const body = { notes: "Please explain $or and Dr. Patel's services", tests: ["CBC", "BLOOD_GLUCOSE"], measurements: { quantity: 0, available: null } };
  assert.deepEqual((await request(app).post("/").send(body).expect(200)).body, body);
  await request(app).post("/").send({ observations: [{ quantities: { $inc: 5 } }] }).expect(400);
});

test("input traversal has depth and entry budgets", () => {
  let value = {};
  for (let i = 0; i < 26; i++) value = { child: value };
  assert.equal(safeInputKeys(value), false);
  assert.equal(safeInputKeys(Array(20001).fill(0)), false);
  assert.equal(safeInputKeys({ observations: Array.from({ length: 500 }, (_, i) => ({ resourceKey: "bed.general", capacity: i })) }), true);
});

test("structured profile fields are rejected before scalar sanitizers can coerce them", async () => {
  for (const field of ["name", "region", "emergencyContact"]) {
    await request(createApp()).post("/api/auth/register").send({ email: "a@example.test", name: "Patient",
      password: "IsolatedSecurePhrase123!", [field]: ["not", "a scalar"] }).expect(400);
  }
});

test("authentication rejects upload-sized payloads before account queries", async t => {
  let lookups = 0;
  t.mock.method(User, "findOne", () => { lookups++; throw new Error("Unexpected lookup"); });
  const response = await request(createApp()).post("/api/auth/login").send({ email: "a@example.test", password: "x".repeat(20000) });
  assert.equal(response.status, 413);
  assert.equal(response.headers["set-cookie"], undefined);
  assert.equal(lookups, 0);
});
