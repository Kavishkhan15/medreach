// Assistant endpoint + service tests.
// Pure-logic tests (classifyIntent, sanitizeMessage, entity detection) need no DB.
// Route-level tests exercise validation, rate limiting, and response structure.
import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  classifyIntent,
  detectEmergencyIntent,
  detectBloodGroup,
  detectLocality,
} from "../src/services/assistantService.js";
import { sanitizeMessage, MAX_MESSAGE_LENGTH } from "../src/utils/sanitize.js";

const app = createApp();

// ---- classifyIntent / detectEmergencyIntent (pure, deterministic, no ML) ----

test("classifyIntent: emergency keywords always win, checked first", () => {
  assert.equal(classifyIntent("My father is unconscious."), "emergency");
  assert.equal(classifyIntent("He is not breathing"), "emergency");
  assert.equal(classifyIntent("severe bleeding after the accident"), "emergency");
  assert.equal(classifyIntent("chest pain and difficulty breathing"), "emergency");
});

test("classifyIntent: hospital search phrasing", () => {
  assert.equal(classifyIntent("Find cardiac hospitals near Andheri"), "hospital_search");
  assert.equal(classifyIntent("ICU hospitals near Bandra"), "hospital_search");
  assert.equal(classifyIntent("Where is the nearest hospital?"), "hospital_search");
});

test("classifyIntent: urgent blood vs blood bank search", () => {
  assert.equal(classifyIntent("I need O+ blood urgently"), "urgent_blood");
  assert.equal(classifyIntent("Emergency blood needed for surgery"), "urgent_blood");
  assert.equal(classifyIntent("Find blood banks near Bandra"), "blood_bank_search");
  assert.equal(classifyIntent("Where can I donate blood?"), "blood_bank_search");
});

test("classifyIntent: ambulance search phrasing", () => {
  assert.equal(classifyIntent("Need an ambulance for patient transit"), "ambulance_search");
  assert.equal(classifyIntent("Book ambulance from Bandra"), "ambulance_search");
  assert.equal(classifyIntent("ALS cardiac ambulance services"), "ambulance_search");
});

test("classifyIntent: diagnostic search phrasing", () => {
  assert.equal(classifyIntent("Show diagnostic centres for MRI in Andheri"), "diagnostic_search");
  assert.equal(classifyIntent("Where can I get a CT scan and blood test?"), "diagnostic_search");
  assert.equal(classifyIntent("Pathology labs in Ghatkopar"), "diagnostic_search");
});

test("classifyIntent: bed request phrasing", () => {
  assert.equal(classifyIntent("I need a hospital bed"), "bed_request");
  assert.equal(classifyIntent("Looking for ICU bed admission"), "bed_request");
  assert.equal(classifyIntent("Check hospital bed vacancy"), "bed_request");
});

test("classifyIntent: career and job search phrasing", () => {
  assert.equal(classifyIntent("Are there nurse jobs in Mumbai?"), "career_search");
  assert.equal(classifyIntent("Doctor vacancies at hospitals"), "career_search");
  assert.equal(classifyIntent("Looking for medical staffing jobs"), "career_search");
});

test("classifyIntent: general/informational falls through", () => {
  assert.equal(classifyIntent("hello"), "general");
  assert.equal(classifyIntent("thank you"), "general");
});

test("detectEmergencyIntent: does not false-positive on unrelated text", () => {
  assert.equal(detectEmergencyIntent("What are your hospital hours?"), false);
  assert.equal(detectEmergencyIntent("Find ICU hospitals"), false);
  assert.equal(detectEmergencyIntent("Diagnostic blood test"), false);
});

test("detectBloodGroup: accurately extracts blood types", () => {
  assert.equal(detectBloodGroup("I need O+ blood immediately"), "O+");
  assert.equal(detectBloodGroup("Looking for A- donors"), "A-");
  assert.equal(detectBloodGroup("Patient requires AB+ platelets"), "AB+");
  assert.equal(detectBloodGroup("Regular checkup"), null);
});

test("detectLocality: extracts Mumbai localities", () => {
  assert.equal(detectLocality("Hospitals near Andheri"), "Andheri");
  assert.equal(detectLocality("Ambulance in Bandra West"), "Bandra");
  assert.equal(detectLocality("Blood bank in Ghatkopar"), "Ghatkopar");
  assert.equal(detectLocality("General inquiry"), null);
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
  const res = await request(app).post("/api/assistant/message").send({ message: "hi" });
  assert.notEqual(res.status, 401);
  assert.equal(res.status, 200);
  assert.ok(typeof res.body.reply === "string");
  assert.ok(Array.isArray(res.body.suggestedActions));
  assert.ok(Array.isArray(res.body.hospitals));
  assert.ok(Array.isArray(res.body.bloodBanks));
  assert.ok(Array.isArray(res.body.ambulances));
  assert.ok(Array.isArray(res.body.diagnostics));
  assert.ok(Array.isArray(res.body.jobs));
});

// ---- rate limiting ----

test("POST /api/assistant/message rate-limits after repeated requests", async () => {
  let sawRateLimited = false;
  for (let i = 0; i < 25; i++) {
    const res = await request(app).post("/api/assistant/message").send({ message: "hello" });
    if (res.status === 429) { sawRateLimited = true; break; }
  }
  assert.equal(sawRateLimited, true, "expected a 429 after exceeding the assistant rate limit");
});
