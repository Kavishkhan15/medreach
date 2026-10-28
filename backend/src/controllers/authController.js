import { mfaRequiredForUser } from "../middleware/privilegedSecurity.js";
import { verifyAndConsumeMfa } from "../services/privilegedMfaService.js";
import { isolatedDemoEnabled, localManualCredentialsEnabled } from "../services/demoAccounts.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { AuthToken } from "../models/AuthToken.js";
import { signToken, verifyToken } from "../utils/token.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";
import { issueAuthToken, consumeAuthToken, issueSession, rotateSession, revokeSessionToken,
  revokeAllSessions, listSessions } from "../services/authTokenService.js";
import { sendEmailEvent } from "../services/emailService.js";
import { hashIp, writeAudit } from "../utils/audit.js";

const ACCESS_COOKIE_MS = 15 * 60 * 1000;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("medreach-non-account-timing-value", 12);
const cookieBase = () => ({ httpOnly: true, sameSite: env.cookieSameSite,
  secure: env.nodeEnv === "production" || env.cookieSameSite === "none" });
const context = (req) => ({ ip: req.ip, userAgent: req.get("user-agent") || "" });

function publicUser(user) {
  const raw = user?.toObject ? user.toObject() : { ...user };
  raw.regionOnboardingRequired = user?.regionOnboardingRequired
    ?? !String(raw.region || "").trim();
  delete raw.passwordHash; delete raw.googleSubject; delete raw.authVersion; delete raw.provisioningKey; delete raw.provisioningOrganization; delete raw.__v;
  return raw;
}

function providerSummary(user) {
  return { password: Boolean(user.passwordHash) };
}

function setSessionCookies(res, accessToken, refreshToken) {
  res.cookie("token", accessToken, { ...cookieBase(), maxAge: ACCESS_COOKIE_MS, path: "/" });
  res.cookie("refresh_token", refreshToken, { ...cookieBase(), maxAge: env.refreshTokenExpiresDays * 86400000,
    path: "/api/auth" });
}

function clearSessionCookies(res) {
  res.clearCookie("token", { ...cookieBase(), path: "/" });
  res.clearCookie("refresh_token", { ...cookieBase(), path: "/api/auth" });
}

async function establishSession(req, res, user) {
  const [{ token: refreshToken, entry }] = await Promise.all([
    issueSession(user, { ...context(req), mfaAuthenticated: req.mfaAuthenticated === true }),
    user.save(),
  ]);
  setSessionCookies(res, signToken(user, entry.familyId), refreshToken);
}

const audit = (req, entry) => writeAudit({ ...entry, ipHash: hashIp(req.ip), requestId: req.id });

export const register = asyncHandler(async (req, res) => {
  const email = req.body.email.trim().toLowerCase();
  const exists = await User.exists({ email });
  if (exists) {
    await bcrypt.compare(req.body.password, DUMMY_PASSWORD_HASH);
    await audit(req, { action: "register", entityType: "AuthRegistration", after: { accepted: true } });
    return res.status(202).json({ accepted: true,
      message: "If this address can be registered, verification instructions have been prepared." });
  }
  const user = new User({ email, name: req.body.name, region: req.body.region,
    emergencyContact: req.body.emergencyContact, role: "user" });
  await user.setPassword(req.body.password);
  await user.save();
  await issueAuthToken(user, "verify_email");
  await sendEmailEvent({ eventKey: `welcome:${user._id}`, to: user.email, template: "welcome", data: { name: user.name } });
  await audit(req, { user: user._id, action: "register", entityType: "User", entityId: user._id });
  res.status(202).json({ accepted: true,
    message: "If this address can be registered, verification instructions have been prepared." });
});

export const login = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email.trim().toLowerCase() })
    .select("+passwordHash +authVersion");
  const validPassword = user?.passwordHash
    ? await user.comparePassword(req.body.password)
    : await bcrypt.compare(req.body.password, DUMMY_PASSWORD_HASH);
  if (!user || !user.passwordHash || !validPassword) {
    await audit(req, { user: user?._id, action: "login_failed", entityType: "AuthSession" });
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (user.accountStatus !== "active" || (user.demoAccount && !isolatedDemoEnabled()) || (user.credentialDelivery === "manual" && !localManualCredentialsEnabled())) {
    await audit(req, { user: user._id, action: "login_failed", entityType: "AuthSession" });
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (await mfaRequiredForUser(user)) {
    if (!await verifyAndConsumeMfa(user._id, req.body)) {
      await audit(req, { user: user._id, action: "login_failed", entityType: "AuthSession", after: { reason: "mfa_required" } });
      return res.status(401).json({ error: "MFA verification required", code: "MFA_REQUIRED" });
    }
    req.mfaAuthenticated = true;
  }
  user.lastLogin = new Date();
  await establishSession(req, res, user);
  await audit(req, { user: user._id, action: "login", entityType: "AuthSession", entityId: user._id });
  res.json({ user: publicUser(user) });
});

export const refresh = asyncHandler(async (req, res) => {
  const result = await rotateSession(req.cookies?.refresh_token, context(req));
  if (result.error) {
    clearSessionCookies(res);
    if (result.error === "replay") await audit(req, { user: result.userId, action: "revoke", entityType: "AuthSession",
      after: { reason: "refresh_replay" } });
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }
  setSessionCookies(res, signToken(result.user, result.session.familyId), result.token);
  await audit(req, { user: result.user._id, action: "refresh", entityType: "AuthSession", entityId: result.session._id });
  res.json({ user: publicUser(result.user) });
});

export const logout = asyncHandler(async (req, res) => {
  await revokeSessionToken(req.cookies?.refresh_token, "logout");
  let actor = req.user?.id;
  try { actor ||= verifyToken(req.cookies?.token).sub; } catch { /* expired access cookie is still logout-able */ }
  clearSessionCookies(res);
  await audit(req, { user: actor, action: "logout", entityType: "AuthSession" });
  res.json({ ok: true });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select("+passwordHash +authVersion")
    .populate("savedHospitals", "name slug city emergencyStatus");
  if (!user || user.accountStatus !== "active") return res.status(401).json({ error: "Authentication required" });
  res.json({ user: publicUser(user), providers: providerSummary(user) });
});

export const sessionStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select("+passwordHash");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ sessions: await listSessions(user._id), providers: providerSummary(user),
    emailVerified: Boolean(user.emailVerifiedAt) });
});

export const revokeOwnSession = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid session id" });
  const session = await AuthToken.findOneAndUpdate({ _id: req.params.id, user: req.user.id,
    purpose: "refresh_session", revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokeReason: "user_revoked" } }, { new: true });
  if (!session) return res.status(404).json({ error: "Session not found" });
  await audit(req, { user: req.user.id, action: "revoke", entityType: "AuthSession", entityId: session._id });
  if (String(req.accessClaims?.sid) === String(session.familyId)) clearSessionCookies(res);
  res.json({ ok: true });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email.trim().toLowerCase(), accountStatus: "active" });
  if (user) await issueAuthToken(user, "reset_password");
  await audit(req, { user: user?._id, action: "password_reset_requested", entityType: "UserPassword" });
  res.json({ message: "If the account exists, password-reset instructions were prepared." });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const entry = await consumeAuthToken(req.body.token, "reset_password");
  if (!entry) {
    await audit(req, { action: "password_reset", entityType: "UserPassword", after: { success: false } });
    return res.status(400).json({ error: "Invalid or expired reset link" });
  }
  const user = await User.findById(entry.user).select("+passwordHash +authVersion");
  if (!user || user.accountStatus !== "active" || (user.role === "provider_admin" && (!user.notificationEmailVerifiedAt || entry.metadata?.notificationEmail !== user.notificationEmail))) {
    await audit(req, { user: entry.user, action: "password_reset", entityType: "UserPassword",
      after: { success: false, reason: "account_unavailable" } });
    return res.status(400).json({ error: "Invalid or expired reset link" });
  }
  await user.setPassword(req.body.password);
  const updated = await User.findOneAndUpdate({ _id: user._id, role: user.role, accountStatus: "active",
    authVersion: Number(user.authVersion || 0) ? Number(user.authVersion) : { $in: [0, null] }, ...(user.role === "provider_admin" ? {
      notificationEmail: entry.metadata.notificationEmail, notificationEmailVerifiedAt: user.notificationEmailVerifiedAt } : {}) },
    { $set: { passwordHash: user.passwordHash, credentialState: "custom" }, $inc: { authVersion: 1 } },
    { new: true, runValidators: true });
  if (!updated) return res.status(409).json({ error: "Account changed. Request a new password recovery link" });
  await revokeAllSessions(user._id, "password_reset");
  await sendEmailEvent({ eventKey: `password-reset-complete:${entry._id}`, to: user.role === "provider_admin" ? user.notificationEmail : user.email,
    template: "password_changed" });
  await audit(req, { user: user._id, action: "password_reset", entityType: "UserPassword", entityId: user._id });
  clearSessionCookies(res);
  res.json({ ok: true });
});

export const requestVerification = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.emailVerifiedAt) return res.json({ verified: true });
  await issueAuthToken(user, "verify_email");
  await audit(req, { user: user._id, action: "email_verification_requested", entityType: "UserEmail", entityId: user._id });
  res.json({ verified: false });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const entry = await consumeAuthToken(req.body.token, "verify_email");
  if (!entry) {
    await audit(req, { action: "email_verified", entityType: "UserEmail", after: { success: false } });
    return res.status(400).json({ error: "Invalid or expired verification link" });
  }
  const user = await User.findByIdAndUpdate(entry.user, { $set: { emailVerifiedAt: new Date() } }, { new: true });
  if (!user) return res.status(400).json({ error: "Invalid or expired verification link" });
  await audit(req, { user: user._id, action: "email_verified", entityType: "UserEmail", entityId: user._id });
  res.json({ verified: true });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const patch = Object.fromEntries(["name", "region", "emergencyContact"]
    .filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
  const user = await User.findByIdAndUpdate(req.user.id, patch, { new: true, runValidators: true });
  if (!user) return res.status(404).json({ error: "User not found" });
  await audit(req, { user: user._id, action: "update", entityType: "UserProfile", entityId: user._id });
  res.json({ user: publicUser(user) });
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select("+passwordHash +authVersion");
  if (!user || !user.passwordHash || !(await user.comparePassword(req.body.currentPassword))) {
    await audit(req, { user: req.user.id, action: "password_change", entityType: "UserPassword",
      after: { success: false } });
    return res.status(400).json({ error: "Current password incorrect" });
  }
  await user.setPassword(req.body.newPassword);
  const updated = await User.findOneAndUpdate({ _id: user._id, accountStatus: "active", role: user.role,
    authVersion: Number(user.authVersion || 0) ? Number(user.authVersion) : { $in: [0, null] } },
    { $set: { passwordHash: user.passwordHash, credentialState: "custom" }, $inc: { authVersion: 1 } }, { new: true });
  if (!updated) return res.status(409).json({ error: "Account changed. Sign in again before changing its password" });
  user.authVersion = updated.authVersion;
  await revokeAllSessions(user._id, "password_change");
  await sendEmailEvent({ eventKey: `password-change:${user._id}:${user.authVersion}`, to: user.role === "provider_admin" ? user.notificationEmail : user.email,
    template: "password_changed" });
  await audit(req, { user: user._id, action: "password_change", entityType: "UserPassword", entityId: user._id });
  clearSessionCookies(res);
  res.json({ ok: true, signedOut: true });
});
