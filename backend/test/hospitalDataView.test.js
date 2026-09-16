import test from "node:test";
import assert from "node:assert/strict";
import { composeHospitalDataView, CURRENT_AVAILABILITY_MAX_AGE_MS } from "../src/services/hospitalDataView.js";

const hospital = { _id: "h1", name: "Example Hospital", emergencyStatus: "available", bedsAvailable: 0 };
const facility = { hospital: "h1", facility: "Emergency Department", capability: "yes", status: "available", source: "site" };
const now = new Date("2026-09-14T12:00:00Z");

test("static facility capability never becomes current availability or a bed count", () => {
  const view = composeHospitalDataView(hospital, [facility], [], now);
  assert.equal(view.facilities[0].capability, "yes");
  assert.equal(view.facilities[0].capabilityFreshness, "UNKNOWN");
  assert.equal(view.facilities[0].status, "unknown");
  assert.equal(view.facilities[0].count, null);
  assert.equal(view.emergencyStatus, "unknown");
  assert.equal(view.bedsAvailable, null);
});

test("recent verified observation can supply availability with provenance", () => {
  const observation = {
    hospital: "h1", facility: "Emergency Department", status: "limited",
    quantity: 2, verificationStatus: "verified", source: "partner",
    observedAt: "2026-09-14T11:55:00Z", confidence: "HIGH",
  };
  const view = composeHospitalDataView(hospital, [facility], [observation], now);
  assert.equal(view.facilities[0].status, "limited");
  assert.equal(view.facilities[0].count, 2);
  assert.equal(view.facilities[0].availabilitySource, "partner");
  assert.equal(view.emergencyStatus, "limited");
  assert.equal(view.bedsAvailable, null, "facility quantity is not a hospital-wide bed count");
});

test("unverified or stale observations cannot claim live availability", () => {
  for (const observation of [
    { verificationStatus: "unverified", observedAt: "2026-09-14T11:55:00Z" },
    { verificationStatus: "verified", observedAt: new Date(now.getTime() - CURRENT_AVAILABILITY_MAX_AGE_MS - 1) },
  ]) {
    const view = composeHospitalDataView(hospital, [facility], [{
      hospital: "h1", facility: "Emergency Department", status: "available", quantity: 4,
      ...observation,
    }], now);
    assert.equal(view.facilities[0].status, "unknown");
    assert.equal(view.facilities[0].count, null);
    assert.equal(view.emergencyStatus, "unknown");
  }
});

test("latest observation wins; an unknown update cannot expose an older available status", () => {
  const view = composeHospitalDataView(hospital, [facility], [
    { hospital: "h1", facility: "Emergency Department", status: "available", verificationStatus: "verified", observedAt: "2026-09-14T11:50:00Z" },
    { hospital: "h1", facility: "Emergency Department", status: "unknown", verificationStatus: "unverified", observedAt: "2026-09-14T11:59:00Z" },
  ], now);
  assert.equal(view.facilities[0].status, "unknown");
  assert.equal(view.facilities[0].lastObservedAt, "2026-09-14T11:59:00.000Z");
});
