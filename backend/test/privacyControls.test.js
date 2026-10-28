import test from "node:test";
import assert from "node:assert/strict";
import { RETENTION_POLICY, exportInventoryRow } from "../src/services/privacyControls.js";
import { redactOperationalValue, safeErrorMetadata } from "../src/utils/logRedaction.js";
test("unapproved retention never invents periods or enables deletion", () => {
  assert.equal(RETENTION_POLICY.status, "unapproved"); assert.equal(RETENTION_POLICY.automaticDeletionEnabled, false);
  assert.ok(RETENTION_POLICY.categories.every(row => row.retentionDays === null));
});
test("export allowlist removes private journals and recomputes freshness", () => {
  const now = new Date();
  const record = { resourceKey: "icu", unit: "beds", capacity: 15, available: 0, observedAt: now, classification: "provider_confirmed", version: 2,
    reportingMethod: "provider_report", updatedBy: "private-user", pendingEvents: ["private"], patient: "secret" };
  const fresh = exportInventoryRow(record, now);
  assert.equal(fresh.available, 0); assert.equal(fresh.status, "unavailable");
  for (const field of ["updatedBy", "pendingEvents", "patient"]) assert.equal(field in fresh, false);
  const stale = exportInventoryRow(record, new Date(now.getTime() + 1800001));
  assert.equal(stale.available, null); assert.equal(stale.capacity, null); assert.equal(stale.status, "unknown");
  assert.equal(exportInventoryRow({ ...record, classification: "demo" }, now).available, null);
});
test("operational redaction removes nested MFA credentials and error payloads", () => {
  const fields = ["password", "token", "authorization", "cookie", "secret", "recoveryCode", "recoveryCodes", "provisioningUri", "encryptedSecret", "pendingSecret", "recoveryHashes", "code", "email", "phone", "patient", "body"];
  const result = redactOperationalValue({ nested: Object.fromEntries(fields.map(key => [key, "sensitive"])), safe: "normal\ntext" });
  for (const key of fields) assert.equal(result.nested[key], "[redacted]");
  assert.equal(result.safe, "normal text");
  assert.deepEqual(safeErrorMetadata({ name: "sensitive-value", message: "password", code: "secret-value" }, "req-1"), { name: "Error", code: "UNEXPECTED_ERROR", requestId: "req-1" });
});
