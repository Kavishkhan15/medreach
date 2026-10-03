import { installAuthMocks, signMockToken } from "./helpers/mockAuth.js";
// Pure service and route-wiring unit tests use explicit account/session query mocks.
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";

import { freshnessLabel } from "../src/services/freshnessService.js";
import { scoreHospital, rankHospitals } from "../src/services/rankingService.js";
import { buildHospitalFilter, paginate } from "../src/services/hospitalService.js";
import { latestByFacility } from "../src/services/availabilityService.js";
import { applyReview, VALID_DECISIONS } from "../src/services/verificationService.js";

const app = createApp();

// ---- services ----
test("freshnessLabel thresholds", () => {
  const now = Date.now();
  assert.equal(freshnessLabel(new Date(now - 60000), now), "RECENT");
  assert.equal(freshnessLabel(new Date(now - 2 * 3600000), now), "STALE");
  assert.equal(freshnessLabel(null), "UNKNOWN");
  assert.equal(freshnessLabel(new Date(now + 60000), now), "UNKNOWN");
});

test("scoreHospital deterministic + reasons; ranking sorts", () => {
  const cat = { specialties: ["Cardiology", "Emergency"], facilities: ["Emergency Department", "ICU"] };
  const good = { facilities: [{ facility: "Emergency Department", status: "available", confidence: "HIGH" }, { facility: "ICU", status: "available" }], specialties: ["Cardiology", "Emergency"], verificationStatus: "verified" };
  const bad = { facilities: [{ facility: "Emergency Department", status: "unavailable" }], specialties: [] };
  const rg = scoreHospital(good, { category: cat, distanceKm: 2 });
  assert.ok(rg.score > scoreHospital(bad, { category: cat }).score);
  assert.ok(rg.reasons.length > 0);
  const ranked = rankHospitals([bad, good], { category: cat });
  assert.equal(ranked[0].specialties.length, 2); // good first
});

test("buildHospitalFilter + paginate", () => {
  const f = buildHospitalFilter({ q: "icu", specialty: "Cardiology", verified: "true", hospitalType: "Trust" });
  assert.deepEqual(f.$text, { $search: "icu" });
  assert.equal(f.verificationStatus, "verified");
  assert.ok(f.$or);
  const p = paginate({ page: 3, limit: 10 });
  assert.equal(p.skip, 20);
});

test("latestByFacility keeps newest per facility", () => {
  const obs = [
    { facility: "ICU", status: "limited", retrievedAt: "2026-08-30T09:00:00Z" },
    { facility: "ICU", status: "available", retrievedAt: "2026-08-30T10:00:00Z" },
    { facility: "CT", status: "available", retrievedAt: "2026-08-30T08:00:00Z" },
  ];
  const latest = latestByFacility(obs);
  assert.equal(latest.length, 2);
  assert.equal(latest.find((x) => x.facility === "ICU").status, "available");
});

test("applyReview produces updates + audit; rejects bad decision", () => {
  const r = applyReview({ decision: "approve", before: { verificationStatus: "pending" }, userId: "u1", entityType: "Hospital", entityId: "h1" });
  assert.equal(r.ok, true);
  assert.equal(r.updates.verificationStatus, "verified");
  assert.equal(r.audit.action, "verify");
  assert.equal(applyReview({ decision: "nope" }).ok, false);
  assert.ok(VALID_DECISIONS.includes("mark_stale"));
});

// ---- route wiring (no DB) ----
test("GET /health → 200 with db field", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.ok("db" in res.body);
});

test("GET /api/sources without auth → 401", async () => {
  assert.equal((await request(app).get("/api/sources")).status, 401);
});

test("GET /api/admin/overview without auth → 401", async () => {
  assert.equal((await request(app).get("/api/admin/overview")).status, 401);
});

test("GET /api/crawler/jobs as non-admin → 403", async () => {
  const res = await request(app).get("/api/crawler/jobs").set("Authorization", `Bearer ${userToken}`);
  assert.equal(res.status, 403);
});

test("POST /api/hospitals/x/availability invalid body (admin) → 400", async () => {
  const res = await request(app).post("/api/hospitals/507f1f77bcf86cd799439011/availability")
    .set("Authorization", `Bearer ${adminToken}`).send({ facility: "NotAFacility", status: "weird" });
  assert.equal(res.status, 400);
});

test("POST /api/admin/hospitals/x/verify invalid decision (admin) → 400", async () => {
  const res = await request(app).post("/api/admin/hospitals/507f1f77bcf86cd799439011/verify")
    .set("Authorization", `Bearer ${adminToken}`).send({ decision: "explode" });
  assert.equal(res.status, 400);
});

test("GET /api/admin/audit as plain user → 403", async () => {
  const res = await request(app).get("/api/admin/audit").set("Authorization", `Bearer ${userToken}`);
  assert.equal(res.status, 403);
});

let adminToken, userToken;
test.beforeEach((t) => {
  installAuthMocks(t);
  adminToken = signMockToken({ _id: "507f1f77bcf86cd799439011", role: "system_admin", email: "a@x.io", name: "A" });
  userToken = signMockToken({ _id: "507f1f77bcf86cd799439012", role: "user", email: "u@x.io", name: "U" });
});
