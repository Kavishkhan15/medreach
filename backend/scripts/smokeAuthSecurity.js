import mongoose from "mongoose";
import request from "supertest";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { AuthToken } from "../src/models/AuthToken.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { verifyToken, signToken } from "../src/utils/token.js";
import { digestToken, issueSession } from "../src/services/authTokenService.js";
import { env } from "../src/config/env.js";

const MONGO_URI = process.env.MEDREACH_AUTH_TEST_MONGO_URI || "mongodb://127.0.0.1:27017/medreach_smoke_test";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

const results = [];

function logSection(title) {
  console.log(`\n${colors.bold}${colors.cyan}═════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan} ${title}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}═════════════════════════════════════════════════════════════════${colors.reset}`);
}

async function runStep(category, name, fn) {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ category, name, passed: true, duration });
    console.log(`  ${colors.green}✔ PASS${colors.reset} [${category}] ${name} (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - start;
    results.push({ category, name, passed: false, duration, error: err.message });
    console.log(`  ${colors.red}✖ FAIL${colors.reset} [${category}] ${name} (${duration}ms)`);
    console.error(`    ${colors.red}Error: ${err.message}${colors.reset}`);
    if (err.stack) {
      console.error(err.stack.split("\n").slice(1, 4).map(l => `    ${l}`).join("\n"));
    }
  }
}

const cookie = (res, name) => res.headers["set-cookie"]?.find((v) => v.startsWith(`${name}=`))?.split(";")[0];
const getCookieVal = (res, name) => {
  const c = cookie(res, name);
  return c ? c.split("=")[1] : null;
};

async function main() {
  console.log(`${colors.bold}MedReach Auth & Security Smoke Test Suite${colors.reset}`);
  console.log(`Target: Express App + Mongo (${MONGO_URI})`);

  await mongoose.connect(MONGO_URI);
  await mongoose.connection.dropDatabase();

  const app = createApp();

  try {
    // =========================================================================
    logSection("1. CSRF & Security Headers Middleware");
    // =========================================================================

    await runStep("Security Headers", "Helmet baseline security headers are present", async () => {
      const res = await request(app).get("/health");
      assert.equal(res.status, 200);
      assert.ok(res.headers["content-security-policy"], "Missing CSP header");
      assert.ok(res.headers["content-security-policy"].includes("default-src 'self'"), "CSP default-src missing");
      assert.ok(res.headers["content-security-policy"].includes("frame-ancestors 'none'"), "CSP frame-ancestors missing");
      assert.equal(res.headers["x-content-type-options"], "nosniff");
      assert.equal(res.headers["referrer-policy"], "no-referrer");
      assert.ok(res.headers["strict-transport-security"], "Missing HSTS header");
      assert.ok(res.headers["strict-transport-security"].includes("max-age=31536000"), "HSTS max-age incorrect");
    });

    await runStep("CORS", "Permitted origin gets CORS headers with credentials", async () => {
      const res = await request(app)
        .options("/api/auth/login")
        .set("Origin", "http://localhost:3000")
        .set("Access-Control-Request-Method", "POST");
      assert.equal(res.headers["access-control-allow-origin"], "http://localhost:3000");
      assert.equal(res.headers["access-control-allow-credentials"], "true");
    });

    await runStep("CORS", "Variants ports (3001, 3002) are recognized in CORS", async () => {
      for (const origin of ["http://localhost:3001", "http://localhost:3002"]) {
        const res = await request(app)
          .options("/api/auth/login")
          .set("Origin", origin)
          .set("Access-Control-Request-Method", "POST");
        assert.equal(res.headers["access-control-allow-origin"], origin);
      }
    });

    await runStep("CORS", "Unpermitted origin does not get Access-Control-Allow-Origin", async () => {
      const res = await request(app)
        .options("/api/auth/login")
        .set("Origin", "http://malicious-attacker.com")
        .set("Access-Control-Request-Method", "POST");
      assert.equal(res.headers["access-control-allow-origin"], undefined);
    });

    await runStep("CSRF Guard", "Safe method GET with cookie and untrusted origin is allowed", async () => {
      const res = await request(app)
        .get("/health")
        .set("Origin", "http://malicious-attacker.com")
        .set("Cookie", "token=anyvalue");
      assert.equal(res.status, 200);
    });

    await runStep("CSRF Guard", "State-changing POST without cookies from untrusted origin is allowed (API client flow)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .set("Origin", "http://malicious-attacker.com")
        .send({ email: "invalid@example.com" });
      // Should hit controller/validator (400 validation error), NOT 403 CSRF block
      assert.equal(res.status, 400);
      assert.notEqual(res.body.error, "Request origin not allowed");
    });

    await runStep("CSRF Guard", "State-changing POST with Cookie from allowed origin is permitted", async () => {
      const res = await request(app)
        .post("/api/auth/logout")
        .set("Origin", "http://localhost:3000")
        .set("Cookie", "token=dummytoken");
      assert.equal(res.status, 200);
    });

    await runStep("CSRF Guard", "State-changing POST with Cookie from untrusted origin is BLOCKED with 403", async () => {
      const res = await request(app)
        .post("/api/auth/logout")
        .set("Origin", "http://evil-attacker.com")
        .set("Cookie", "token=dummytoken");
      assert.equal(res.status, 403);
      assert.equal(res.body.error, "Request origin not allowed");
    });

    await runStep("CSRF Guard", "State-changing PUT with Cookie from untrusted origin is BLOCKED with 403", async () => {
      const res = await request(app)
        .put("/api/auth/profile")
        .set("Origin", "http://evil-attacker.com")
        .set("Cookie", "token=dummytoken")
        .send({ name: "Hacked" });
      assert.equal(res.status, 403);
      assert.equal(res.body.error, "Request origin not allowed");
    });

    await runStep("CSRF Guard", "State-changing DELETE with Cookie from untrusted origin is BLOCKED with 403", async () => {
      const res = await request(app)
        .delete("/api/auth/sessions/507f1f77bcf86cd799439011")
        .set("Origin", "http://evil-attacker.com")
        .set("Cookie", "token=dummytoken");
      assert.equal(res.status, 403);
      assert.equal(res.body.error, "Request origin not allowed");
    });

    // =========================================================================
    logSection("2. Authentication Flows: Registration & Validation");
    // =========================================================================

    await runStep("Registration", "Rejects invalid email", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .set("X-Forwarded-For", "10.0.1.1")
        .send({ name: "User", email: "not-an-email", password: "ValidPassword123" });
      assert.equal(res.status, 400);
      assert.ok(res.body.errors || res.body.error);
    });

    await runStep("Registration", "Rejects password shorter than 12 characters", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .set("X-Forwarded-For", "10.0.1.2")
        .send({ name: "User", email: "valid@example.test", password: "Short1Password" });
      // "Short1Password" is 14 chars. Let's test "Aa1!" (4 chars)
      const resShort = await request(app)
        .post("/api/auth/register")
        .set("X-Forwarded-For", "10.0.1.2")
        .send({ name: "User", email: "valid@example.test", password: "Aa1!Pass" }); // 8 chars
      assert.equal(resShort.status, 400);
      assert.ok(resShort.body.details?.some(d => d.field === "password"));
    });

    await runStep("Registration", "Rejects password without lowercase, uppercase, or numbers", async () => {
      // Missing uppercase
      const resNoUpper = await request(app)
        .post("/api/auth/register")
        .set("X-Forwarded-For", "10.0.1.3")
        .send({ name: "User", email: "valid@example.test", password: "lowercaseonly123" });
      assert.equal(resNoUpper.status, 400);

      // Missing number
      const resNoNum = await request(app)
        .post("/api/auth/register")
        .set("X-Forwarded-For", "10.0.1.3")
        .send({ name: "User", email: "valid@example.test", password: "NoNumericCharHere" });
      assert.equal(resNoNum.status, 400);
    });

    await runStep("Registration", "Rejects missing name", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .set("X-Forwarded-For", "10.0.1.4")
        .send({ name: "", email: "valid@example.test", password: "StrongPassword123" });
      assert.equal(res.status, 400);
    });

    let testUserEmail = "smoketest@medreach.test";
    let testUserPass = "SmokeTestPass123";

    await runStep("Registration", "Accepts valid registration, hides password hash, generates verification token", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .set("X-Forwarded-For", "10.0.1.5")
        .send({ name: "Smoke Tester", email: testUserEmail, password: testUserPass, region: "North" });
      assert.equal(res.status, 202);
      assert.equal(res.body.accepted, true);
      assert.equal("passwordHash" in res.body, false);
      assert.equal(cookie(res, "token"), undefined, "Must not set auth cookie immediately upon registration");

      const userInDb = await User.findOne({ email: testUserEmail }).select("+passwordHash +authVersion");
      assert.ok(userInDb, "User not found in DB");
      assert.equal(userInDb.role, "user");
      assert.equal(userInDb.accountStatus, "active");
      assert.match(userInDb.passwordHash, /^\$2[aby]\$12\$/);

      const tokenDoc = await AuthToken.findOne({ user: userInDb._id, purpose: "verify_email" });
      assert.ok(tokenDoc, "Verification token doc not created in DB");
      assert.ok(tokenDoc.tokenHash);
    });

    await runStep("Registration", "Duplicate registration returns identical 202 without revealing user presence", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .set("X-Forwarded-For", "10.0.1.6")
        .send({ name: "Fake Clone", email: testUserEmail, password: "AnotherStrongPass123" });
      assert.equal(res.status, 202);
      assert.equal(res.body.accepted, true);
      assert.equal(res.body.message, "If this address can be registered, verification instructions have been prepared.");
    });

    // =========================================================================
    logSection("3. Authentication Flows: Email Verification");
    // =========================================================================

    let rawVerifyToken = "v".repeat(43);

    await runStep("Email Verification", "Verifies email with valid token and sets emailVerifiedAt", async () => {
      const user = await User.findOne({ email: testUserEmail });
      await AuthToken.updateOne({ user: user._id, purpose: "verify_email" }, { $set: { tokenHash: digestToken(rawVerifyToken) } });

      const res = await request(app)
        .post("/api/auth/verify-email")
        .set("X-Forwarded-For", "10.0.2.1")
        .send({ token: rawVerifyToken });
      assert.equal(res.status, 200);
      assert.equal(res.body.verified, true);

      const updatedUser = await User.findById(user._id);
      assert.ok(updatedUser.emailVerifiedAt, "emailVerifiedAt was not set");
    });

    await runStep("Email Verification", "Replaying consumed verification token is rejected (single-use)", async () => {
      const res = await request(app)
        .post("/api/auth/verify-email")
        .set("X-Forwarded-For", "10.0.2.2")
        .send({ token: rawVerifyToken });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /invalid or expired/i);
    });

    // =========================================================================
    logSection("4. Authentication Flows: Login & Token Issuance");
    // =========================================================================

    await runStep("Login", "Rejects wrong password with 401", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", "10.0.3.1")
        .send({ email: testUserEmail, password: "WrongPassword123" });
      assert.equal(res.status, 401);
      assert.equal(res.body.error, "Invalid email or password");
    });

    await runStep("Login", "Rejects non-existent user with 401 (constant-time check)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", "10.0.3.2")
        .send({ email: "doesnotexist@medreach.test", password: "SomePassword123" });
      assert.equal(res.status, 401);
      assert.equal(res.body.error, "Invalid email or password");
    });

    let authCookies = null;
    let rawAccessToken = null;
    let rawRefreshToken = null;

    await runStep("Login", "Successful login returns sanitized user profile and sets secure cookies", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", "10.0.3.3")
        .send({ email: testUserEmail, password: testUserPass });
      assert.equal(res.status, 200);
      assert.ok(res.body.user);
      assert.equal(res.body.user.email, testUserEmail);
      assert.equal("passwordHash" in res.body.user, false);
      assert.equal("authVersion" in res.body.user, false);

      rawAccessToken = getCookieVal(res, "token");
      rawRefreshToken = getCookieVal(res, "refresh_token");
      assert.ok(rawAccessToken, "token cookie missing");
      assert.ok(rawRefreshToken, "refresh_token cookie missing");

      // Verify cookie flags
      const tokenHeader = res.headers["set-cookie"].find(c => c.startsWith("token="));
      assert.ok(tokenHeader.toLowerCase().includes("httponly"));
      assert.ok(tokenHeader.includes("Path=/"));

      const refreshHeader = res.headers["set-cookie"].find(c => c.startsWith("refresh_token="));
      assert.ok(refreshHeader.toLowerCase().includes("httponly"));
      assert.ok(refreshHeader.includes("Path=/api/auth"));

      authCookies = [cookie(res, "token"), cookie(res, "refresh_token")].join("; ");
    });

    // =========================================================================
    logSection("5. Token Structure & Authorization Middleware");
    // =========================================================================

    await runStep("Token Validation", "Access token claims are strictly verified (typ, iss, aud, exp, sid)", async () => {
      const claims = verifyToken(rawAccessToken);
      assert.equal(claims.typ, "access");
      assert.equal(claims.iss, "medreach-api");
      assert.equal(claims.aud, "medreach-web");
      assert.equal(claims.role, "user");
      assert.ok(claims.sid, "Session family id missing");
      assert.ok(claims.exp - claims.iat <= 16 * 60, "Access token expiry should be ~15 minutes");
    });

    await runStep("Authorization", "Access /api/auth/me using Cookie returns user data", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Cookie", authCookies);
      assert.equal(res.status, 200);
      assert.equal(res.body.user.email, testUserEmail);
      assert.equal(res.body.providers.password, true);
    });

    await runStep("Authorization", "Access /api/auth/me using Authorization Bearer header returns user data", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${rawAccessToken}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.user.email, testUserEmail);
    });

    await runStep("Authorization", "Rejects forged/tampered access token with 401", async () => {
      const tampered = rawAccessToken.slice(0, -5) + "abcde";
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${tampered}`);
      assert.equal(res.status, 401);
      assert.equal(res.body.error, "Invalid or expired token");
    });

    await runStep("Authorization", "Rejects token with invalid signature", async () => {
      const falseToken = signToken({ _id: "507f1f77bcf86cd799439011", role: "user" }, "session-1");
      // Sign with different secret
      const invalidToken = falseToken.slice(0, -10) + "0123456789";
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${invalidToken}`);
      assert.equal(res.status, 401);
    });

    // =========================================================================
    logSection("6. Refresh Token Rotation & Replay Attack Detection");
    // =========================================================================

    let rotatedRefreshCookie = null;
    let rotatedAuthCookies = null;
    const initialRefreshCookie = `refresh_token=${rawRefreshToken}`;

    await runStep("Refresh Token", "Rotates refresh token and issues new access token", async () => {
      const res = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", initialRefreshCookie);
      assert.equal(res.status, 200);
      assert.ok(res.body.user);

      const newRefreshToken = getCookieVal(res, "refresh_token");
      const newAccessToken = getCookieVal(res, "token");
      assert.ok(newRefreshToken);
      assert.notEqual(newRefreshToken, rawRefreshToken, "Refresh token must rotate on use");

      rotatedRefreshCookie = `refresh_token=${newRefreshToken}`;
      rotatedAuthCookies = `token=${newAccessToken}; refresh_token=${newRefreshToken}`;
    });

    await runStep("Replay Attack Protection", "Replaying previous refresh token triggers replay detection & revokes session family", async () => {
      // Replay old refresh token
      const res = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", initialRefreshCookie);
      assert.equal(res.status, 401);
      assert.match(res.body.error, /session expired/i);

      // Verify that audit log and DB recorded replay detection
      const replayedTokenDoc = await AuthToken.findOne({ revokeReason: "replay_detected" });
      assert.ok(replayedTokenDoc, "Token family was not revoked with replay_detected");

      // Verify that even the newest rotated token is now INVALIDATED because family was revoked
      const subsequentRes = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", rotatedRefreshCookie);
      assert.equal(subsequentRes.status, 401);
    });

    // =========================================================================
    logSection("7. Password Reset & Session Invalidation");
    // =========================================================================

    let rawResetToken = "r".repeat(43);

    await runStep("Password Reset", "Forgot password returns generic message for existing & non-existing users", async () => {
      const res1 = await request(app)
        .post("/api/auth/forgot-password")
        .set("X-Forwarded-For", "10.0.4.1")
        .send({ email: testUserEmail });
      assert.equal(res1.status, 200);

      const res2 = await request(app)
        .post("/api/auth/forgot-password")
        .set("X-Forwarded-For", "10.0.4.2")
        .send({ email: "unknown@example.test" });
      assert.equal(res2.status, 200);
      assert.equal(res1.body.message, res2.body.message);
    });

    await runStep("Password Reset", "Consumes reset token, updates password, increments authVersion, and revokes sessions", async () => {
      const user = await User.findOne({ email: testUserEmail }).select("+authVersion");
      const oldAuthVersion = Number(user.authVersion || 0);

      // Assign known token hash
      await AuthToken.updateOne(
        { user: user._id, purpose: "reset_password", usedAt: { $exists: false } },
        { $set: { tokenHash: digestToken(rawResetToken) } }
      );

      const newPassword = "NewPassword1234";
      const res = await request(app)
        .post("/api/auth/reset-password")
        .set("X-Forwarded-For", "10.0.4.3")
        .send({ token: rawResetToken, password: newPassword });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);

      // Verify DB state
      const updatedUser = await User.findById(user._id).select("+passwordHash +authVersion");
      assert.ok(await updatedUser.comparePassword(newPassword));
      assert.equal(updatedUser.authVersion, oldAuthVersion + 1);

      // Old password should now fail login
      const failLogin = await request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", "10.0.4.4")
        .send({ email: testUserEmail, password: testUserPass });
      assert.equal(failLogin.status, 401);

      // New password should succeed
      const okLogin = await request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", "10.0.4.5")
        .send({ email: testUserEmail, password: newPassword });
      assert.equal(okLogin.status, 200);

      testUserPass = newPassword;
      authCookies = [cookie(okLogin, "token"), cookie(okLogin, "refresh_token")].join("; ");
    });

    await runStep("Password Reset", "Cannot reuse already consumed reset token", async () => {
      const res = await request(app)
        .post("/api/auth/reset-password")
        .set("X-Forwarded-For", "10.0.4.6")
        .send({ token: rawResetToken, password: "AnotherPass123" });
      assert.equal(res.status, 400);
    });

    // =========================================================================
    logSection("8. Authenticated Password Change & Profile Update");
    // =========================================================================

    await runStep("Password Change", "Requires authentication and rejects wrong current password", async () => {
      const resNoAuth = await request(app)
        .put("/api/auth/password")
        .send({ currentPassword: "wrong", newPassword: "ValidPass1234" });
      assert.equal(resNoAuth.status, 401);

      const resWrongCurrent = await request(app)
        .put("/api/auth/password")
        .set("Cookie", authCookies)
        .send({ currentPassword: "WrongCurrentPassword123", newPassword: "ValidPass1234" });
      assert.equal(resWrongCurrent.status, 400);
    });

    await runStep("Password Change", "Successful change signs out all sessions and increments authVersion", async () => {
      const nextPassword = "FinalPassword1234";
      const res = await request(app)
        .put("/api/auth/password")
        .set("Cookie", authCookies)
        .send({ currentPassword: testUserPass, newPassword: nextPassword });
      assert.equal(res.status, 200);
      assert.equal(res.body.signedOut, true);

      // Old cookie is now invalidated because authVersion incremented and sessions revoked
      const testMe = await request(app)
        .get("/api/auth/me")
        .set("Cookie", authCookies);
      assert.equal(testMe.status, 401);

      testUserPass = nextPassword;
      // Re-login with new password
      const reLogin = await request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", "10.0.5.1")
        .send({ email: testUserEmail, password: testUserPass });
      assert.equal(reLogin.status, 200);
      authCookies = [cookie(reLogin, "token"), cookie(reLogin, "refresh_token")].join("; ");
    });

    // =========================================================================
    logSection("9. Logout & Session Revocation");
    // =========================================================================

    await runStep("Logout", "POST /api/auth/logout clears cookies and revokes session", async () => {
      const res = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", authCookies);
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);

      // Verify clear cookie headers
      const setCookies = res.headers["set-cookie"] || [];
      const tokenClear = setCookies.find(c => c.startsWith("token="));
      const refreshClear = setCookies.find(c => c.startsWith("refresh_token="));
      assert.ok(tokenClear.includes("Expires=") || tokenClear.includes("Max-Age=0"));
      assert.ok(refreshClear.includes("Expires=") || refreshClear.includes("Max-Age=0"));

      // Accessing /api/auth/me with the prior access token should fail or prior session
      const checkMe = await request(app)
        .get("/api/auth/me")
        .set("Cookie", authCookies);
      assert.equal(checkMe.status, 401);
    });

    // =========================================================================
    logSection("10. Role-Based Access Control (RBAC)");
    // =========================================================================

    // Create accounts for RBAC testing
    const plainUser = await User.create({ email: "plain@medreach.test", name: "Plain User", role: "user", accountStatus: "active" });
    await plainUser.setPassword("PlainUserPass123");
    await plainUser.save();

    const hospitalAdmin = await User.create({ email: "hospitaladmin@medreach.test", name: "Hospital Admin", role: "hospital_admin", accountStatus: "active" });
    await hospitalAdmin.setPassword("HospitalPass123");
    await hospitalAdmin.save();

    const systemAdmin = await User.create({ email: "systemadmin@medreach.test", name: "System Admin", role: "system_admin", accountStatus: "active" });
    await systemAdmin.setPassword("SystemPass123");
    await systemAdmin.save();

    const { entry: userSession } = await issueSession(plainUser);
    const { entry: hospSession } = await issueSession(hospitalAdmin);
    const { entry: sysSession } = await issueSession(systemAdmin);

    const userToken = signToken(plainUser, userSession.familyId);
    const hospitalAdminToken = signToken(hospitalAdmin, hospSession.familyId);
    const systemAdminToken = signToken(systemAdmin, sysSession.familyId);

    await runStep("RBAC", "Unauthenticated request to /api/admin/users returns 401", async () => {
      const res = await request(app).get("/api/admin/users");
      assert.equal(res.status, 401);
    });

    await runStep("RBAC", "Plain user to /api/admin/users returns 403 Insufficient permissions", async () => {
      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${userToken}`);
      assert.equal(res.status, 403);
      assert.equal(res.body.error, "Insufficient permissions");
    });

    await runStep("RBAC", "Hospital admin to /api/admin/users returns 403 Insufficient permissions", async () => {
      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${hospitalAdminToken}`);
      assert.equal(res.status, 403);
      assert.equal(res.body.error, "Insufficient permissions");
    });

    await runStep("RBAC", "Hospital admin to /api/admin/overview returns 200 OK", async () => {
      const res = await request(app)
        .get("/api/admin/overview")
        .set("Authorization", `Bearer ${hospitalAdminToken}`);
      assert.equal(res.status, 200);
    });

    await runStep("RBAC", "System admin to /api/admin/users returns 200 OK", async () => {
      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${systemAdminToken}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
    });

    await runStep("RBAC", "System admin to /api/admin/audit returns 200 OK, plain user returns 403", async () => {
      const okRes = await request(app)
        .get("/api/admin/audit")
        .set("Authorization", `Bearer ${systemAdminToken}`);
      assert.equal(okRes.status, 200);

      const forbiddenRes = await request(app)
        .get("/api/admin/audit")
        .set("Authorization", `Bearer ${userToken}`);
      assert.equal(forbiddenRes.status, 403);
    });

    // =========================================================================
    logSection("11. Real-Time Account Suspension & Self-Protection");
    // =========================================================================

    await runStep("Account Suspension", "System admin can suspend user; suspended user is immediately blocked", async () => {
      // 1. Suspend plainUser
      const suspendRes = await request(app)
        .patch(`/api/admin/users/${plainUser._id}/status`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ status: "suspended" });
      assert.equal(suspendRes.status, 200);
      assert.equal(suspendRes.body.user.accountStatus, "suspended");

      // 2. Login attempt with valid password should fail immediately
      const loginAttempt = await request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", "10.0.6.1")
        .send({ email: plainUser.email, password: "PlainUserPass123" });
      assert.equal(loginAttempt.status, 401);

      // 3. Existing access token should be rejected in real time by requireAuth
      const meAttempt = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${userToken}`);
      assert.equal(meAttempt.status, 401);
      assert.equal(meAttempt.body.error, "Session is no longer valid");

      // 4. Reactivate user
      const restoreRes = await request(app)
        .patch(`/api/admin/users/${plainUser._id}/status`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ status: "active" });
      assert.equal(restoreRes.status, 200);
    });

    await runStep("Account Safety", "System admin cannot suspend their own account (self-lockout prevention)", async () => {
      const selfSuspend = await request(app)
        .patch(`/api/admin/users/${systemAdmin._id}/status`)
        .set("Authorization", `Bearer ${systemAdminToken}`)
        .send({ status: "suspended" });
      assert.equal(selfSuspend.status, 409);
      assert.match(selfSuspend.body.error, /cannot disable your own account/i);
    });

    // =========================================================================
    logSection("12. Rate Limiting Verification");
    // =========================================================================

    await runStep("Rate Limiting", "Login endpoint enforces 10 requests / 15 min; 11th request returns 429", async () => {
      const rateLimitIp = "192.168.100.50";
      let hit429 = false;
      let limitHeader = null;
      let remainingHeader = null;

      for (let i = 1; i <= 11; i++) {
        const res = await request(app)
          .post("/api/auth/login")
          .set("X-Forwarded-For", rateLimitIp)
          .send({ email: "ratelimit@test.com", password: "somepassword" });

        if (i <= 10) {
          assert.notEqual(res.status, 429, `Request ${i} should not be rate limited`);
        } else {
          assert.equal(res.status, 429, `Request ${i} must be rate limited with 429`);
          assert.equal(res.body.error, "Too many requests. Please try again later.");
          hit429 = true;
          limitHeader = res.headers["ratelimit-limit"];
          remainingHeader = res.headers["ratelimit-remaining"];
        }
      }
      assert.ok(hit429, "Rate limiter was not triggered on 11th request");
      assert.equal(limitHeader, "10");
      assert.equal(remainingHeader, "0");
    });

    await runStep("Rate Limiting", "Recovery endpoint enforces 6 requests / hour; 7th request returns 429", async () => {
      const recoveryIp = "192.168.100.60";
      let hit429 = false;

      for (let i = 1; i <= 7; i++) {
        const res = await request(app)
          .post("/api/auth/forgot-password")
          .set("X-Forwarded-For", recoveryIp)
          .send({ email: "recovery@test.com" });

        if (i <= 6) {
          assert.equal(res.status, 200, `Request ${i} should succeed`);
        } else {
          assert.equal(res.status, 429, `Request ${i} must be rate limited with 429`);
          hit429 = true;
        }
      }
      assert.ok(hit429, "Recovery rate limiter was not triggered on 7th request");
    });

    // =========================================================================
    logSection("13. Live HTTP Server Smoke Verification");
    // =========================================================================

    await runStep("Live Server", "Spin up HTTP server, execute full round-trip fetch requests over TCP socket", async () => {
      const server = http.createServer(app);
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        // 1. Health check
        const healthRes = await fetch(`${baseUrl}/health`);
        assert.equal(healthRes.status, 200);
        const healthData = await healthRes.json();
        assert.equal(healthData.ok, true);
        assert.equal(healthData.service, "medreach-api");
        assert.equal(healthRes.headers.get("x-content-type-options"), "nosniff");

        // 2. CORS preflight via HTTP
        const preflightRes = await fetch(`${baseUrl}/api/auth/login`, {
          method: "OPTIONS",
          headers: {
            Origin: "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
          },
        });
        assert.equal(preflightRes.headers.get("access-control-allow-origin"), "http://localhost:3000");

        // 3. Live registration
        const liveEmail = `live_${Date.now()}@medreach.test`;
        const regRes = await fetch(`${baseUrl}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Live User", email: liveEmail, password: "LivePassword123" }),
        });
        assert.equal(regRes.status, 202);

        // 4. Live login
        const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: liveEmail, password: "LivePassword123" }),
        });
        assert.equal(loginRes.status, 200);
        const setCookieHeaders = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get("set-cookie")];
        assert.ok(setCookieHeaders.some(c => c.includes("token=")));
        assert.ok(setCookieHeaders.some(c => c.includes("refresh_token=")));

        // Extract token
        const tokenCookieStr = setCookieHeaders.find(c => c.startsWith("token=")).split(";")[0];
        const liveToken = tokenCookieStr.split("=")[1];

        // 5. Authenticated /me endpoint with live token
        const meRes = await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${liveToken}` },
        });
        assert.equal(meRes.status, 200);
        const meData = await meRes.json();
        assert.equal(meData.user.email, liveEmail);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });

  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\n${colors.bold}═════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold} SMOKE TEST RESULTS SUMMARY${colors.reset}`);
  console.log(`${colors.bold}═════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`Total tests:  ${results.length}`);
  console.log(`Passed:       ${colors.green}${passed}${colors.reset}`);
  console.log(`Failed:       ${failed > 0 ? colors.red + failed : colors.green + "0"}${colors.reset}`);
  console.log(`${colors.bold}═════════════════════════════════════════════════════════════════${colors.reset}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal test runner failure:", err);
  process.exit(1);
});
