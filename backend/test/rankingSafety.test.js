import test from "node:test";
import assert from "node:assert/strict";
import { scoreHospital } from "../../packages/core/src/ranking.js";

test("proximity ranking never invents travel time without routing data", () => {
  const hospital = {
    name: "Test hospital",
    location: { coordinates: [72.84, 19.06] },
    facilities: [],
    specialties: [],
  };
  const result = scoreHospital(hospital, { origin: { lng: 72.83, lat: 19.05 } });
  assert.ok(result.distanceKm > 0);
  assert.equal(result.etaMinutes, null);
  assert.ok(result.reasons.some((reason) => /straight-line distance; travel time unavailable/.test(reason)));
});
