import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { generateKeyPairSync } from "node:crypto";

process.env.GOOGLE_CLIENT_ID ||= "unit-test-google-client";
process.env.GOOGLE_CLIENT_SECRET ||= "unit-test-google-secret";
process.env.GOOGLE_CALLBACK_URL ||= "http://localhost:4000/api/auth/google/callback";

const { createApp } = await import("../src/app.js");
const { User } = await import("../src/models/User.js");
const { AuthToken } = await import("../src/models/AuthToken.js");
const { signToken, verifyToken } = await import("../src/utils/token.js");
const { validateGoogleIdToken, resetGoogleJwksCacheForTests } = await import("../src/services/googleOidcService.js");
const jwt = (await import("jsonwebtoken")).default;

test("access JWT is typed, issuer/audience bound, and short lived", () => {
  const token = signToken({ _id: "507f1f77bcf86cd799439011", role: "user", email: "u@example.test", name: "U", authVersion: 3 }, "session-family");
  const claims = verifyToken(token);
  assert.equal(claims.typ, "access");
  assert.equal(claims.av, 3);
  assert.equal(claims.iss, "medreach-api");
  assert.equal(claims.aud, "medreach-web");
  assert.equal(claims.sid, "session-family");
  assert.ok(claims.exp - claims.iat <= 16 * 60);
});

test("User supports Google-only accounts but never serializes auth material", async () => {
  const googleOnly = new User({ email: "google@example.test", name: "Google User", googleSubject: "subject", authVersion: 7 });
  assert.equal(googleOnly.validateSync(), undefined);
  const json = googleOnly.toJSON();
  assert.equal(json.passwordHash, undefined);
  assert.equal(json.googleSubject, undefined);
  assert.equal(json.authVersion, undefined);
  const passwordUser = new User({ email: "password@example.test", name: "Password User" });
  await passwordUser.setPassword("StrongPassword123");
  assert.match(passwordUser.passwordHash, /^\$2[aby]\$12\$/);
  assert.equal(await passwordUser.comparePassword("StrongPassword123"), true);
  assert.equal(JSON.stringify(passwordUser).includes(passwordUser.passwordHash), false);
});

test("AuthToken schema carries hashed-token rotation and expiry fields", () => {
  const paths = AuthToken.schema.paths;
  for (const field of ["tokenHash", "expiresAt", "usedAt", "revokedAt", "familyId", "replacedBy"]) assert.ok(paths[field]);
  assert.ok(AuthToken.schema.indexes().some(([fields, options]) => fields.expiresAt === 1 && options.expireAfterSeconds === 0));
});

test("Google ID token validation verifies signature, issuer, audience, expiry, email and nonce", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" }); Object.assign(jwk, { kid: "test-key", use: "sig", alg: "RS256" });
  const fetcher = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });
  const valid = jwt.sign({ sub: "google-sub", email: "Verified@Example.test", email_verified: true,
    nonce: "expected-nonce", name: "Verified User" }, privateKey,
    { algorithm: "RS256", keyid: "test-key", issuer: "https://accounts.google.com",
      audience: process.env.GOOGLE_CLIENT_ID, expiresIn: "5m" });
  resetGoogleJwksCacheForTests();
  assert.deepEqual(await validateGoogleIdToken(valid, "expected-nonce", fetcher),
    { subject: "google-sub", email: "verified@example.test", name: "Verified User" });
  await assert.rejects(validateGoogleIdToken(valid, "wrong-nonce", fetcher), /google_identity_invalid/);
  const expired = jwt.sign({ sub: "x", email: "x@example.test", email_verified: true, nonce: "n" }, privateKey,
    { algorithm: "RS256", keyid: "test-key", issuer: "https://accounts.google.com",
      audience: process.env.GOOGLE_CLIENT_ID, expiresIn: -10 });
  await assert.rejects(validateGoogleIdToken(expired, "n", fetcher), /expired/i);
});

test("auth validators and system-only RBAC reject weak or unauthorized requests before persistence", async () => {
  const app = createApp();
  assert.equal((await request(app).post("/api/auth/register").send({ name: "A", email: "a@example.test", password: "weakpass" })).status, 400);
  assert.equal((await request(app).post("/api/auth/reset-password").send({ token: "x".repeat(43), password: "weakpass" })).status, 400);
  assert.equal((await request(app).get("/api/auth/sessions")).status, 401);
  const hospitalToken = signToken({ _id: "507f1f77bcf86cd799439011", role: "hospital_admin", email: "h@example.test", name: "H" });
  assert.equal((await request(app).get("/api/admin/users").set("Authorization", `Bearer ${hospitalToken}`)).status, 403);
  const legacyAdminToken = signToken({ _id: "507f1f77bcf86cd799439013", role: "admin", email: "a@example.test", name: "A" });
  assert.equal((await request(app).get("/api/admin/users").set("Authorization", `Bearer ${legacyAdminToken}`)).status, 403);
  const userToken = signToken({ _id: "507f1f77bcf86cd799439012", role: "user", email: "u@example.test", name: "U" });
  assert.equal((await request(app).delete("/api/auth/providers/google").set("Authorization", `Bearer ${userToken}`).send({ confirm: "no" })).status, 400);
});
