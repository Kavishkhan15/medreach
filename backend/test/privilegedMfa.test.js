import { validateMfaConfiguration } from "../src/config/mfaPolicy.js";
import test from "node:test";
import assert from "node:assert/strict";
import { encodeBase32, totp, matchingTotpStep, newMfaSecret, encryptMfaSecret, decryptMfaSecret, newRecoveryCodes, recoveryDigest } from "../src/services/mfaCrypto.js";
import { PrivilegedSecurity, PrivilegedReauthentication } from "../src/models/PrivilegedSecurity.js";
import { verifyAndConsumeMfa } from "../src/services/privilegedMfaService.js";
import { requireRecentPrivilegedAuthentication, mfaEnforced } from "../src/middleware/privilegedSecurity.js";
import { localManualCredentialsEnabled, isolatedDemoEnabled } from "../src/services/demoAccounts.js";
process.env.MFA_ENCRYPTION_KEY ||= "8".repeat(64);
const secret = encodeBase32(Buffer.from("12345678901234567890"));
test("Guest request middleware leaves access decisions to the guest authorization path", async () => {
  let proceeded = false;
  await requireRecentPrivilegedAuthentication({}, {}, (error) => {
    assert.equal(error, undefined);
    proceeded = true;
  });
  assert.equal(proceeded, true);
});
test("TOTP conforms to RFC 6238 SHA1 reference vectors", () => {
  for (const [seconds, code] of [[59,"94287082"],[1111111109,"07081804"],[1111111111,"14050471"],[1234567890,"89005924"],[2000000000,"69279037"],[20000000000,"65353130"]]) {
    assert.equal(totp(secret, Math.floor(seconds / 30), 8), code);
  }
});
test("TOTP bounds clock tolerance, rejects malformed, old and replayed codes", () => {
  const now = 1234567890000, step = Math.floor(now / 30000);
  assert.equal(matchingTotpStep(secret, totp(secret, step), { now }), step);
  assert.equal(matchingTotpStep(secret, totp(secret, step), { now, lastStep: step }), null);
  assert.equal(matchingTotpStep(secret, totp(secret, step - 2), { now }), null);
  for (const code of [123456, "12345", "0000000", null, {}, "......"]) assert.equal(matchingTotpStep(secret, code, { now }), null);
});
test("MFA secrets use authenticated encryption and fail closed without configured key", () => {
  const previous = process.env.MFA_ENCRYPTION_KEY;
  try {
    process.env.MFA_ENCRYPTION_KEY = "a".repeat(64);
    const input = newMfaSecret(), encrypted = encryptMfaSecret(input);
    assert.equal(decryptMfaSecret(encrypted), input);
    assert.ok(!encrypted.includes(input));
    assert.notEqual(encryptMfaSecret(input), encrypted);
    const parts = encrypted.split("."); parts[2] = Buffer.alloc(20, 1).toString("base64url");
    assert.throws(() => decryptMfaSecret(parts.join(".")));
    delete process.env.MFA_ENCRYPTION_KEY;
    assert.throws(() => encryptMfaSecret(input), /not configured/);
  } finally { if (previous === undefined) delete process.env.MFA_ENCRYPTION_KEY; else process.env.MFA_ENCRYPTION_KEY = previous; }
});
test("Recovery codes have independent entropy and hashes only", () => {
  const { codes, hashes } = newRecoveryCodes();
  assert.equal(new Set(codes).size, 10);
  for (let i = 0; i < codes.length; i++) {
    assert.match(codes[i], /^[a-f0-9]{32}$/); assert.match(hashes[i], /^[a-f0-9]{64}$/);
    assert.equal(recoveryDigest(codes[i].toUpperCase()), hashes[i]); assert.notEqual(codes[i], hashes[i]);
  }
  assert.equal(PrivilegedSecurity.schema.paths.encryptedSecret.options.select, false);
  assert.equal(PrivilegedSecurity.schema.paths.recoveryHashes.options.select, false);
});
test("Concurrent recovery code consumption has exactly one winner", async () => {
  const originalFind = PrivilegedSecurity.findOne, originalUpdate = PrivilegedSecurity.findOneAndUpdate;
  const code = "c".repeat(32); let available = true;
  try {
    PrivilegedSecurity.findOne = () => ({ select: async () => ({ _id: "record", enabledAt: new Date(0) }) });
    PrivilegedSecurity.findOneAndUpdate = async (filter, update) => {
      assert.equal(filter.recoveryHashes, recoveryDigest(code)); assert.equal(update.$pull.recoveryHashes, filter.recoveryHashes);
      if (!available) return null; available = false; return { _id: "record" };
    };
    assert.deepEqual((await Promise.all([verifyAndConsumeMfa("u", { recoveryCode: code }), verifyAndConsumeMfa("u", { recoveryCode: code })])).sort(), [false, true]);
  } finally { PrivilegedSecurity.findOne = originalFind; PrivilegedSecurity.findOneAndUpdate = originalUpdate; }
});
test("Recent reauthentication checks enrollment, session family, auth version and expiry", async () => {
  const before = process.env.MFA_ENFORCE_PRIVILEGED;
  const originalSecurity = PrivilegedSecurity.exists, originalRecent = PrivilegedReauthentication.exists;
  const req = { user: { id: "u", role: "system_admin" }, accessClaims: { sid: "family", av: 9 } };
  let status, body, next = 0, enrolled = false, recent = false;
  const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
  try {
    process.env.MFA_ENFORCE_PRIVILEGED = "true";
    PrivilegedSecurity.exists = async () => enrolled;
    PrivilegedReauthentication.exists = async (filter) => {
      assert.equal(filter.familyId, "family"); assert.equal(filter.authVersion, 9); assert.ok(filter.expiresAt.$gt instanceof Date); return recent;
    };
    await requireRecentPrivilegedAuthentication(req, res, () => next++);
    assert.equal(status, 403); assert.equal(body.code, "MFA_ENROLLMENT_REQUIRED");
    enrolled = true;
    await requireRecentPrivilegedAuthentication(req, res, () => next++);
    assert.equal(body.code, "REAUTHENTICATION_REQUIRED");
    recent = true;
    await requireRecentPrivilegedAuthentication(req, res, () => next++);
    assert.equal(next, 1);
  } finally {
    PrivilegedSecurity.exists = originalSecurity; PrivilegedReauthentication.exists = originalRecent;
    if (before === undefined) delete process.env.MFA_ENFORCE_PRIVILEGED; else process.env.MFA_ENFORCE_PRIVILEGED = before;
  }
});
test("Provider enforcement is a staged explicit switch", () => {
  const previous = process.env.MFA_ENFORCE_PRIVILEGED, providers = process.env.MFA_ENFORCE_PROVIDERS;
  try {
    process.env.MFA_ENFORCE_PRIVILEGED = "true"; delete process.env.MFA_ENFORCE_PROVIDERS;
    assert.equal(mfaEnforced("system_admin"), true); assert.equal(mfaEnforced("provider_admin"), false); assert.equal(mfaEnforced("user"), false);
    process.env.MFA_ENFORCE_PROVIDERS = "true"; assert.equal(mfaEnforced("hospital_admin"), true);
  } finally {
    if (previous === undefined) delete process.env.MFA_ENFORCE_PRIVILEGED; else process.env.MFA_ENFORCE_PRIVILEGED = previous;
    if (providers === undefined) delete process.env.MFA_ENFORCE_PROVIDERS; else process.env.MFA_ENFORCE_PROVIDERS = providers;
  }
});
test("Disconnected database never enables demo credential provisioning", () => {
  assert.equal(localManualCredentialsEnabled(), false); assert.equal(isolatedDemoEnabled(), false);
});

test("MFA configuration typos, inconsistent rollout and missing keys fail closed", () => {
  for (const config of [
    { MFA_ENFORCE_PRIVILEGED: "TRUE" },
    { MFA_ENFORCE_PRIVILEGED: "1" },
    { MFA_ENFORCE_PROVIDERS: "true", MFA_ENFORCE_PRIVILEGED: "false" },
    { MFA_ENFORCE_PRIVILEGED: "true" },
    { MFA_ENFORCE_PRIVILEGED: "true", MFA_ENCRYPTION_KEY: "invalid" },
  ]) assert.throws(() => validateMfaConfiguration(config), error => error.status === 503 && error.code === "MFA_CONFIGURATION_INVALID");
  assert.equal(validateMfaConfiguration({ MFA_ENFORCE_PRIVILEGED: "true", MFA_ENCRYPTION_KEY: "a".repeat(64) }), true);
  assert.equal(validateMfaConfiguration({}), true);
});
