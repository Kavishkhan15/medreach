import test from "node:test";
import assert from "node:assert/strict";
import { fuseFacilityClaims } from "../src/services/facilityClaimFusion.js";
import { FacilitySourceClaim } from "../src/models/FacilitySourceClaim.js";
import { DataConflict } from "../src/models/DataConflict.js";

const yes = { capability: "yes", verificationStatus: "unverified", confidence: "MEDIUM", source: "site" };
const no = { capability: "no", verificationStatus: "unverified", confidence: "HIGH", source: "directory" };

test("disagreeing sources remain an unresolved capability conflict", () => {
  const result = fuseFacilityClaims([yes, no]);
  assert.equal(result.capability, "unknown");
  assert.equal(result.conflict, true);
  assert.equal(result.selectedClaim, null);
});

test("verified claim resolves an unverified disagreement but retains conflict flag", () => {
  const result = fuseFacilityClaims([{ ...yes, verificationStatus: "verified" }, no]);
  assert.equal(result.capability, "yes");
  assert.equal(result.conflict, true);
  assert.equal(result.selectedClaim.source, "site");
});

test("opposed verified claims require review; rejected claims do not count", () => {
  assert.equal(fuseFacilityClaims([
    { ...yes, verificationStatus: "verified" },
    { ...no, verificationStatus: "verified" },
  ]).capability, "unknown");
  assert.equal(fuseFacilityClaims([yes, { ...no, verificationStatus: "rejected" }]).capability, "yes");
});

test("facility claim schema requires a real source and constrained capability", () => {
  const base = { hospital: "507f1f77bcf86cd799439011", source: "507f1f77bcf86cd799439012", facility: "ICU", sourcePageUrl: "https://example.org/icu", observedAt: new Date() };
  assert.equal(new FacilitySourceClaim({ ...base, capability: "yes" }).validateSync(), undefined);
  assert.ok(new FacilitySourceClaim({ ...base, capability: "available" }).validateSync()?.errors?.capability);
  assert.ok(new FacilitySourceClaim({ hospital: base.hospital, facility: "ICU", capability: "yes" }).validateSync()?.errors?.source);
  assert.ok(new FacilitySourceClaim({ ...base, sourcePageUrl: undefined, capability: "yes" }).validateSync()?.errors?.sourcePageUrl);
  assert.ok(new FacilitySourceClaim({ ...base, observedAt: undefined, capability: "yes" }).validateSync()?.errors?.observedAt);
});

test("conflict schema requires a hospital and a recognized facility", () => {
  const hospital = "507f1f77bcf86cd799439011";
  assert.equal(new DataConflict({ hospital, kind: "facility_capability", facility: "ICU" }).validateSync(), undefined);
  assert.ok(new DataConflict({ hospital, kind: "facility_capability", facility: "Unlisted" }).validateSync()?.errors?.facility);
});
