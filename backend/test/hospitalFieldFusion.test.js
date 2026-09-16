import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFieldValue, resolveHospitalField } from "../src/services/hospitalFieldFusion.js";

test("field fusion keeps opposed unverified source values unresolved", () => {
  const claims = [
    { value: "022-11111111", verificationStatus: "unverified", confidence: "HIGH" },
    { value: "022-22222222", verificationStatus: "unverified", confidence: "HIGH" },
  ];
  assert.deepEqual(resolveHospitalField("phone", claims), { conflict: true, selectedClaim: null, value: null });
  const resolved = resolveHospitalField("phone", [{ ...claims[0], verificationStatus: "verified" }, claims[1]]);
  assert.equal(resolved.conflict, true);
  assert.equal(resolved.value, "022-11111111");
});

test("field normalization rejects invalid website/pincode and treats specialties as a set", () => {
  assert.equal(normalizeFieldValue("website", "javascript:alert(1)"), null);
  assert.equal(normalizeFieldValue("pincode", "4000"), null);
  assert.deepEqual(normalizeFieldValue("specialties", ["Cardiology", "cardiology", "Neurology"]), ["Cardiology", "Neurology"]);
  assert.equal(normalizeFieldValue("specialties", [" ", ""]), null);
});
