// Assistant endpoint + service tests. Pure-logic tests (classifyIntent,
// sanitizeMessage) need no DB, matching this repo's "validation runs before
// any Mongoose query" pattern. Route-level tests below only exercise paths
// that fail before touching the DB (validation, rate limiting) — same
// convention as auth.test.js / app.test.js.
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { classifyIntent, detectEmergencyIntent } from "../src/services/assistantService.js";
import { sanitizeMessage, MAX_MESSAGE_LENGTH } from "../src/utils/sanitize.js";

const app = createApp();

// ---- classifyIntent / detectEmergencyIntent (pure, deterministic, no ML) ----

test("classifyIntent: emergency keywords always win, checked first", () => {
  assert.equal(classifyIntent("My father is unconscious."), "emergency");
  assert.equal(classifyIntent("He is not breathing"), "emergency");
  assert.equal(classifyIntent("severe bleeding after the accident"), "emergency");
});

test("classifyIntent: hospital search phrasing", () => {
  assert.equal(classifyIntent("Find cardiac hospitals near Andheri"), "hospital_search");
  assert.equal(classifyIntent("ICU hospitals near Bandra"), "hospital_search");
  assert.equal(classifyIntent("Where is the nearest hospital?"), "hospital_search");
});

test("classifyIntent: general/informational falls through", () => {
  assert.equal(classifyIntent("hello"), "general");
  assert.equal(classifyIntent("thank you"), "general");
});

test("detectEmergencyIntent: does not false-positive on unrelated text", () => {
  assert.equal(detectEmergencyIntent("What are your hospital hours?"), false);
  assert.equal(detectEmergencyIntent("Find ICU hospitals"), false);
});

// ---- sanitizeMessage (defense-in-depth input handling) ----

test("sanitizeMessage: trims and caps length", () => {
  const long = "a".repeat(MAX_MESSAGE_LENGTH + 100);
  const out = sanitizeMessage(`  ${long}  `);
  assert.equal(out.length, MAX_MESSAGE_LENGTH);
});

test("sanitizeMessage: strips control characters", () => {
  const out = sanitizeMessage("hello\x00\x1Fworld");
  assert.equal(out, "helloworld");
});

test("sanitizeMessage: non-string input yields empty string", () => {
  assert.equal(sanitizeMessage(null), "");
  assert.equal(sanitizeMessage(undefined), "");
  assert.equal(sanitizeMessage(42), "");
});

// ---- route: validation (fails before any DB access) ----

test("POST /api/assistant/message with empty message → 400", async () => {
  const res = await request(app).post("/api/assistant/message").send({ message: "" });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, "Validation failed");
});

test("POST /api/assistant/message with oversized message → 400", async () => {
  const res = await request(app)
    .post("/api/assistant/message")
    .send({ message: "a".repeat(MAX_MESSAGE_LENGTH + 1) });
  assert.equal(res.status, 400);
});

test("POST /api/assistant/message with missing message field → 400", async () => {
  const res = await request(app).post("/api/assistant/message").send({});
  assert.equal(res.status, 400);
});

test("POST /api/assistant/message rejects out-of-range origin coordinates → 400", async () => {
  const res = await request(app)
    .post("/api/assistant/message")
    .send({ message: "hello", origin: { lat: 999, lng: 72 } });
  assert.equal(res.status, 400);
});

test("POST /api/assistant/message accepts a well-formed request without auth (public endpoint)", async () => {
  // No Authorization header — the assistant is intentionally public, same
  // trust tier as GET /api/hospitals. This should NOT be a 401.
  const res = await request(app).post("/api/assistant/message").send({ message: "hi" });
  assert.notEqual(res.status, 401);
});

// ---- rate limiting ----

test("POST /api/assistant/message rate-limits after repeated requests", async () => {
  // The limiter is 20 requests / 5 min, shared across this whole test file's
  // requests (in-process, same limiter instance). We've already sent several
  // above; drive it well past the ceiling and confirm a 429 eventually fires.
  let sawRateLimited = false;
  for (let i = 0; i < 25; i++) {
    const res = await request(app).post("/api/assistant/message").send({ message: "hello" });
    if (res.status === 429) { sawRateLimited = true; break; }
  }
  assert.equal(sawRateLimited, true, "expected a 429 after exceeding the assistant rate limit");
});
