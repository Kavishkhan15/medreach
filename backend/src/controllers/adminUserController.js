import mongoose from "mongoose";
import { User } from "../models/User.js";
import { issueAuthToken, revokeAllSessions } from "../services/authTokenService.js";
import { sendEmailEvent } from "../services/emailService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { hashIp, writeAudit } from "../utils/audit.js";

const SYSTEM_ROLES = ["admin", "system_admin"];
const SAFE_ROLES = ["user", "hospital_admin", "system_admin"];
const validId = (id) => mongoose.isValidObjectId(id);
const safeUser = (user) => ({ _id: user._id, email: user.email, name: user.name, role: user.role,
  accountStatus: user.accountStatus, emailVerifiedAt: user.emailVerifiedAt, lastLogin: user.lastLogin,
  createdAt: user.createdAt, updatedAt: user.updatedAt,
  providers: { password: Boolean(user.passwordHash), google: Boolean(user.googleSubject) } });
const audit = (req, entry) => writeAudit({ ...entry, ipHash: hashIp(req.ip), requestId: req.id });

export const listUsers = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const filter = {};
  if (["active", "suspended", "pending"].includes(req.query.status)) filter.accountStatus = req.query.status;
  if ([...SAFE_ROLES, "admin"].includes(req.query.role)) filter.role = req.query.role;
  const users = await User.find(filter).select("+passwordHash +googleSubject").sort({ createdAt: -1 }).limit(limit);
  res.json({ data: users.map(safeUser) });
});

export const getUser = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid user id" });
  const user = await User.findById(req.params.id).select("+passwordHash +googleSubject");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: safeUser(user) });
});

export const setUserStatus = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid user id" });
  const user = await User.findById(req.params.id).select("+authVersion +passwordHash +googleSubject");
  if (!user) return res.status(404).json({ error: "User not found" });
  const next = req.body.status;
  if (String(user._id) === req.user.id && next !== "active") return res.status(409).json({ error: "You cannot disable your own account" });
  if (SYSTEM_ROLES.includes(user.role) && next !== "active") {
    const remaining = await User.countDocuments({ _id: { $ne: user._id }, role: { $in: SYSTEM_ROLES }, accountStatus: "active" });
    if (!remaining) return res.status(409).json({ error: "At least one active system administrator is required" });
  }
  const before = user.accountStatus;
  user.accountStatus = next;
  user.disabledAt = next === "active" ? undefined : new Date();
  user.authVersion = Number(user.authVersion || 0) + 1;
  await user.save();
  await revokeAllSessions(user._id, next === "active" ? "account_enabled" : "account_disabled");
  await sendEmailEvent({ eventKey: `account-status:${user._id}:${user.authVersion}`, to: user.email,
    template: "account_status", data: { status: next } });
  await audit(req, { user: req.user.id, action: next === "active" ? "account_enabled" : "account_disabled",
    entityType: "User", entityId: user._id, before: { accountStatus: before }, after: { accountStatus: next } });
  res.json({ user: safeUser(user) });
});

export const setUserRole = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid user id" });
  const user = await User.findById(req.params.id).select("+authVersion +passwordHash +googleSubject");
  if (!user) return res.status(404).json({ error: "User not found" });
  const next = req.body.role;
  if (!SAFE_ROLES.includes(next)) return res.status(400).json({ error: "Invalid role" });
  if (String(user._id) === req.user.id && next !== "system_admin") return res.status(409).json({ error: "You cannot remove your own system access" });
  if (SYSTEM_ROLES.includes(user.role) && !SYSTEM_ROLES.includes(next)) {
    const remaining = await User.countDocuments({ _id: { $ne: user._id }, role: { $in: SYSTEM_ROLES }, accountStatus: "active" });
    if (!remaining) return res.status(409).json({ error: "At least one active system administrator is required" });
  }
  const before = user.role;
  user.role = next;
  user.authVersion = Number(user.authVersion || 0) + 1;
  await user.save();
  await revokeAllSessions(user._id, "role_changed");
  await sendEmailEvent({ eventKey: `role-change:${user._id}:${user.authVersion}`, to: user.email,
    template: "role_changed", data: { role: next } });
  await audit(req, { user: req.user.id, action: "role_changed", entityType: "User", entityId: user._id,
    before: { role: before }, after: { role: next } });
  res.json({ user: safeUser(user) });
});

export const revokeUserSessions = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid user id" });
  const user = await User.findById(req.params.id).select("+authVersion");
  if (!user) return res.status(404).json({ error: "User not found" });
  user.authVersion = Number(user.authVersion || 0) + 1;
  await user.save();
  const result = await revokeAllSessions(user._id, "admin_revoked");
  await audit(req, { user: req.user.id, action: "revoke", entityType: "AuthSession", entityId: user._id,
    after: { revokedCount: result.modifiedCount || 0 } });
  res.json({ ok: true, revokedCount: result.modifiedCount || 0 });
});

export const triggerUserReset = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid user id" });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  await issueAuthToken(user, "reset_password");
  await audit(req, { user: req.user.id, action: "password_reset_requested", entityType: "UserPassword", entityId: user._id });
  res.json({ ok: true, message: "Password-reset instructions were prepared." });
});

export const resendUserVerification = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid user id" });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.emailVerifiedAt) await issueAuthToken(user, "verify_email");
  await audit(req, { user: req.user.id, action: "email_verification_requested", entityType: "UserEmail", entityId: user._id });
  res.json({ ok: true, alreadyVerified: Boolean(user.emailVerifiedAt) });
});

export const adminUnlinkGoogle = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid user id" });
  const user = await User.findById(req.params.id).select("+googleSubject +passwordHash +authVersion");
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.googleSubject) return res.status(404).json({ error: "Google is not linked" });
  if (!user.passwordHash) return res.status(409).json({ error: "Cannot remove the only sign-in method" });
  user.googleSubject = undefined;
  user.authVersion = Number(user.authVersion || 0) + 1;
  await user.save();
  await revokeAllSessions(user._id, "admin_provider_unlinked");
  await sendEmailEvent({ eventKey: `admin-google-unlinked:${user._id}:${user.authVersion}`,
    to: user.email, template: "google_unlinked" });
  await audit(req, { user: req.user.id, action: "provider_unlinked", entityType: "GoogleIdentity", entityId: user._id });
  res.json({ ok: true });
});
