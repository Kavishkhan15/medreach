import test from "node:test";
import assert from "node:assert/strict";
import { validateRefinementSuggestion, refinementStatus } from "../src/services/refinementService.js";
import { getRoute } from "../src/services/routingService.js";
import { emailConfiguration } from "../src/services/emailService.js";

test("Gemini evidence suggestions require an allowed field and verbatim excerpt", () => {
  const source = "The hospital has a 24-hour Emergency Department.";
  assert.deepEqual(validateRefinementSuggestion({ facility: "Emergency Department", capability: "yes", evidence: "24-hour Emergency Department" }, source),
    { facility: "Emergency Department", candidateCapability: "yes", evidenceExcerpt: "24-hour Emergency Department" });
  assert.equal(validateRefinementSuggestion({ facility: "Live beds", capability: "yes", evidence: source }, source), null);
  assert.equal(validateRefinementSuggestion({ facility: "ICU", capability: "yes", evidence: "2 available beds" }, source), null);
});

test("disabled routing returns no invented ETA", async () => {
  const route = await getRoute({ lat: 19.1, lng: 72.8 }, { lat: 19.2, lng: 72.9 });
  assert.equal(route.durationMinutes, null);
  assert.equal(route.routeDistanceKm, null);
});

import { env } from "../src/config/env.js";

test("optional integrations disclose disabled state without exposing keys", () => {
  const orig = env.emailEnabled;
  env.emailEnabled = false;
  try {
    assert.equal(emailConfiguration().enabled, false);
    assert.equal(refinementStatus().configured, false);
    assert.equal(JSON.stringify(refinementStatus()).includes("API_KEY"), false);
  } finally {
    env.emailEnabled = orig;
  }
});
