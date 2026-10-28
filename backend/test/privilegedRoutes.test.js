import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { installAuthMocks, signMockToken } from "./helpers/mockAuth.js";
import { PrivilegedSecurity, PrivilegedReauthentication } from "../src/models/PrivilegedSecurity.js";
import { createApp } from "../src/app.js";
const id = "507f1f77bcf86cd799439011";
test("privileged mutation routes cannot bypass recent MFA through controller-only authorization", async (t) => {
  installAuthMocks(t);
  const originalFlag = process.env.MFA_ENFORCE_PRIVILEGED, originalKey = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENFORCE_PRIVILEGED = "true"; process.env.MFA_ENCRYPTION_KEY = "7".repeat(64);
  t.after(() => {
    if (originalFlag === undefined) delete process.env.MFA_ENFORCE_PRIVILEGED; else process.env.MFA_ENFORCE_PRIVILEGED = originalFlag;
    if (originalKey === undefined) delete process.env.MFA_ENCRYPTION_KEY; else process.env.MFA_ENCRYPTION_KEY = originalKey;
  });
  t.mock.method(PrivilegedSecurity, "exists", async () => true);
  t.mock.method(PrivilegedReauthentication, "exists", async () => null);
  const token = signMockToken({ _id: id, role: "system_admin", email: "admin@example.test", name: "Admin" });
  const app = createApp();
  for (const [method, path] of [
    ["patch", `/api/jobs/${id}`], ["post", `/api/jobs/${id}/status`],
    ["patch", `/api/applications/${id}`], ["patch", `/api/organization-applications/${id}`],
    ["post", `/api/hospital-admin/hospitals/${id}/facility-claims`],
    ["patch", `/api/emergency-requests/${id}`], ["put", "/api/auth/password"],
    ["patch", `/api/admin/users/${id}/role`],
  ]) {
    const response = await request(app)[method](path).set("Authorization", `Bearer ${token}`).send({});
    assert.equal(response.status, 403, `${method} ${path}: ${JSON.stringify(response.body)}`);
    assert.equal(response.body.code, "REAUTHENTICATION_REQUIRED");
  }
});
