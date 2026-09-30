import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";


const { createApp } = await import("../src/app.js");
const { User } = await import("../src/models/User.js");
const { AuthToken } = await import("../src/models/AuthToken.js");
const { signToken, verifyToken } = await import("../src/utils/token.js");

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

test("User never serializes auth material", async () => {
  const legacy = new User({ email: "legacy@example.test", name: "Legacy User", authVersion: 7 });
  assert.equal(legacy.validateSync(), undefined);
  legacy.$__setValue("googleSubject", "retired-identity");
  const json = legacy.toJSON();
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
  assert.equal((await request(app).delete("/api/auth/providers/google").set("Authorization", `Bearer ${userToken}`)).status, 404);
});
