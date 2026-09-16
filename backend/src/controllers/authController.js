import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { AuthToken } from "../models/AuthToken.js";
import { signToken, verifyToken } from "../utils/token.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";
import { issueAuthToken, consumeAuthToken, issueSession, rotateSession, revokeSessionToken,
  revokeAllSessions, listSessions, issueOAuthState, consumeOAuthState } from "../services/authTokenService.js";
import { sendEmailEvent } from "../services/emailService.js";
import { buildGoogleAuthorizationUrl, exchangeGoogleCode, googleConfigured } from "../services/googleOidcService.js";
import { hashIp, writeAudit } from "../utils/audit.js";

const ACCESS_COOKIE_MS = 15 * 60 * 1000;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("medreach-non-account-timing-value", 12);
const cookieBase = () => ({ httpOnly: true, sameSite: env.cookieSameSite,
  secure: env.nodeEnv === "production" || env.cookieSameSite === "none" });
const context = (req) => ({ ip: req.ip, userAgent: req.get("user-agent") || "" });

function publicUser(user) {
  const raw = user?.toObject ? user.toObject() : { ...user };
  delete raw.passwordHash; delete raw.googleSubject; delete raw.authVersion; delete raw.__v;
  return raw;
}

function providerSummary(user) {
  return { password: Boolean(user.passwordHash), google: Boolean(user.googleSubject) };
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
  const { token: refreshToken, entry } = await issueSession(user, context(req));
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
    .select("+passwordHash +googleSubject +authVersion");
  const validPassword = user?.passwordHash
    ? await user.comparePassword(req.body.password)
    : await bcrypt.compare(req.body.password, DUMMY_PASSWORD_HASH);
  if (!user || !user.passwordHash || !validPassword) {
    await audit(req, { user: user?._id, action: "login_failed", entityType: "AuthSession" });
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (user.accountStatus !== "active") {
    await audit(req, { user: user._id, action: "login_failed", entityType: "AuthSession" });
    return res.status(401).json({ error: "Invalid email or password" });
  }
  user.lastLogin = new Date();
  await user.save();
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
  const user = await User.findById(req.user.id).select("+passwordHash +googleSubject +authVersion")
    .populate("savedHospitals", "name slug city emergencyStatus");
  if (!user || user.accountStatus !== "active") return res.status(401).json({ error: "Authentication required" });
  res.json({ user: publicUser(user), providers: providerSummary(user) });
});

export const sessionStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select("+passwordHash +googleSubject");
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
  if (!user || user.accountStatus !== "active") {
    await audit(req, { user: entry.user, action: "password_reset", entityType: "UserPassword",
      after: { success: false, reason: "account_unavailable" } });
    return res.status(400).json({ error: "Invalid or expired reset link" });
  }
  await user.setPassword(req.body.password);
  user.authVersion = Number(user.authVersion || 0) + 1;
  await user.save();
  await revokeAllSessions(user._id, "password_reset");
  await sendEmailEvent({ eventKey: `password-reset-complete:${entry._id}`, to: user.email,
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
  user.authVersion = Number(user.authVersion || 0) + 1;
  await user.save();
  await revokeAllSessions(user._id, "password_change");
  await sendEmailEvent({ eventKey: `password-change:${user._id}:${user.authVersion}`, to: user.email,
    template: "password_changed" });
  await audit(req, { user: user._id, action: "password_change", entityType: "UserPassword", entityId: user._id });
  clearSessionCookies(res);
  res.json({ ok: true, signedOut: true });
});

export const googleStart = asyncHandler(async (req, res) => {
  if (!googleConfigured()) {
    await audit(req, { user: req.user?.id, action: "oauth_failed", entityType: "GoogleIdentity",
      after: { reason: "not_configured" } });
    return res.status(503).json({ error: "Google sign-in is not configured" });
  }
  const flow = req.query.flow === "link" ? "link" : "login";
  let user;
  if (flow === "link") {
    if (!req.user || req.query.confirm !== "link-google") {
      await audit(req, { user: req.user?.id, action: "oauth_failed", entityType: "GoogleIdentity",
        after: { reason: "link_not_confirmed" } });
      return res.status(403).json({ error: "Confirm Google linking from your profile" });
    }
    user = await User.findById(req.user.id).select("+authVersion");
    if (!user || user.accountStatus !== "active") return res.status(401).json({ error: "Authentication required" });
  }
  const state = await issueOAuthState({ flow, user });
  await audit(req, { user: user?._id, action: "oauth_started", entityType: "GoogleIdentity" });
  res.redirect(302, buildGoogleAuthorizationUrl(state));
});

function googleResult(res, status) {
  const url = new URL("/auth/google/callback", env.publicAppUrl);
  url.searchParams.set("status", status);
  res.redirect(302, url.toString());
}

export const googleCallback = asyncHandler(async (req, res) => {
  const state = await consumeOAuthState(req.query.state);
  if (!state) {
    await audit(req, { action: "oauth_failed", entityType: "GoogleIdentity", after: { reason: "invalid_state" } });
    return googleResult(res, "invalid_state");
  }
  if (req.query.error) {
    await audit(req, { action: "oauth_failed", entityType: "GoogleIdentity", after: { reason: "denied" } });
    return googleResult(res, "denied");
  }
  try {
    const identity = await exchangeGoogleCode(req.query.code, state.metadata.nonce);
    if (state.metadata.flow === "link") {
      const user = await User.findById(state.user).select("+googleSubject +passwordHash +authVersion");
      if (!user || user.accountStatus !== "active" || Number(user.authVersion || 0) !== Number(state.metadata.authVersion || 0)) {
        await audit(req, { user: state.user, action: "oauth_failed", entityType: "GoogleIdentity", after: { reason: "link_session_expired" } });
        return googleResult(res, "link_session_expired");
      }
      if (identity.email !== user.email) {
        await audit(req, { user: user._id, action: "oauth_failed", entityType: "GoogleIdentity", after: { reason: "link_email_mismatch" } });
        return googleResult(res, "link_email_mismatch");
      }
      const collision = await User.exists({ googleSubject: identity.subject, _id: { $ne: user._id } });
      if (collision) {
        await audit(req, { user: user._id, action: "oauth_failed", entityType: "GoogleIdentity", after: { reason: "identity_in_use" } });
        return googleResult(res, "identity_in_use");
      }
      user.googleSubject = identity.subject;
      user.emailVerifiedAt ||= new Date();
      await user.save();
      await sendEmailEvent({ eventKey: `google-linked:${user._id}:${Date.now()}`, to: user.email, template: "google_linked" });
      await audit(req, { user: user._id, action: "provider_linked", entityType: "GoogleIdentity", entityId: user._id });
      return googleResult(res, "linked");
    }
    let user = await User.findOne({ googleSubject: identity.subject }).select("+googleSubject +passwordHash +authVersion");
    if (!user) {
      const emailOwner = await User.findOne({ email: identity.email }).select("+passwordHash +googleSubject");
      if (emailOwner) {
        await audit(req, { user: emailOwner._id, action: "oauth_failed", entityType: "GoogleIdentity" });
        return googleResult(res, "email_exists");
      }
      user = await User.create({ email: identity.email, name: identity.name, googleSubject: identity.subject,
        emailVerifiedAt: new Date(), role: "user" });
    }
    if (user.accountStatus !== "active") {
      await audit(req, { user: user._id, action: "oauth_failed", entityType: "GoogleIdentity",
        after: { reason: "account_unavailable" } });
      return googleResult(res, "account_unavailable");
    }
    user.lastLogin = new Date();
    await user.save();
    await establishSession(req, res, user);
    await audit(req, { user: user._id, action: "oauth_login", entityType: "GoogleIdentity", entityId: user._id });
    return googleResult(res, "success");
  } catch {
    await audit(req, { action: "oauth_failed", entityType: "GoogleIdentity" });
    return googleResult(res, "provider_error");
  }
});

export const unlinkGoogle = asyncHandler(async (req, res) => {
  if (req.body.confirm !== "UNLINK") return res.status(400).json({ error: "Type UNLINK to confirm" });
  const user = await User.findById(req.user.id).select("+googleSubject +passwordHash +authVersion");
  if (!user?.googleSubject) {
    await audit(req, { user: req.user.id, action: "provider_unlinked", entityType: "GoogleIdentity",
      after: { success: false, reason: "not_linked" } });
    return res.status(404).json({ error: "Google is not linked" });
  }
  if (!user.passwordHash) {
    await audit(req, { user: user._id, action: "provider_unlinked", entityType: "GoogleIdentity",
      after: { success: false, reason: "only_auth_method" } });
    return res.status(409).json({ error: "Set a password before removing your only sign-in method" });
  }
  user.googleSubject = undefined;
  user.authVersion = Number(user.authVersion || 0) + 1;
  await user.save();
  await revokeAllSessions(user._id, "provider_unlinked");
  await sendEmailEvent({ eventKey: `google-unlinked:${user._id}:${user.authVersion}`, to: user.email, template: "google_unlinked" });
  await audit(req, { user: user._id, action: "provider_unlinked", entityType: "GoogleIdentity", entityId: user._id });
  clearSessionCookies(res);
  res.json({ ok: true, signedOut: true });
});
