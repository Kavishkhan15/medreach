// Wiring tests — no database required (supertest against the in-process app).
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

test("GET /health → 200 ok", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test("unknown route → 404 JSON", async () => {
  const res = await request(app).get("/does-not-exist");
  assert.equal(res.status, 404);
  assert.match(res.body.error, /Not found/);
});

test("helmet security headers present (the experimental constant)", async () => {
  const res = await request(app).get("/health");
  assert.ok(res.headers["content-security-policy"], "CSP header should be set");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
});
