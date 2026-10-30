import { sendMutationResponse } from "../utils/sendMutationResponse.js";
import { guardSystemAdminMutation } from "../services/adminMutationGuard.js";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { issueAuthToken, revokeAllSessions } from "../services/authTokenService.js";
import { sendEmailEvent } from "../services/emailService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { hashIp, writeAudit } from "../utils/audit.js";

const SYSTEM_ROLES = ["system_admin"];
const SAFE_ROLES = ["user", "provider_admin", "system_admin"];
const validId = (id) => mongoose.isValidObjectId(id);
const safeUser = (user) => ({ _id: user._id, email: user.email, name: user.name, role: user.role,
  accountStatus: user.accountStatus, emailVerifiedAt: user.emailVerifiedAt, lastLogin: user.lastLogin,
  createdAt: user.createdAt, updatedAt: user.updatedAt,
  notificationEmail: user.notificationEmail || "", notificationsEnabled: Boolean(user.notificationsEnabled), notificationContactVerified: Boolean(user.notificationEmailVerifiedAt), providers: { password: Boolean(user.passwordHash) } });
const audit = (req, entry) => writeAudit({ ...entry, ipHash: hashIp(req.ip), requestId: req.id });

export const listUsers = asyncHandler(async (req, res) => {
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return res.status(400).json({ error: "Invalid account page" });
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const filter = {};
  if (["active", "suspended", "pending"].includes(req.query.status)) filter.accountStatus = req.query.status;
  if (req.user.role === "system_admin" && [...SAFE_ROLES, "admin", "hospital_admin", "user_admin"].includes(req.query.role)) filter.role = req.query.role;
  if (req.query.roleGroup !== undefined) {
    if (!SAFE_ROLES.includes(req.query.roleGroup)) return res.status(400).json({ error: "Invalid account role group" });
    filter.role = req.query.roleGroup === "provider_admin" ? { $in: ["provider_admin", "hospital_admin"] }
      : req.query.roleGroup === "user" ? { $in: ["user", "admin", "user_admin"] } : "system_admin";
  }
  const users = await User.find(filter).select("+passwordHash").sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit + 1);
  res.json({ data: users.slice(0, limit).map(safeUser), pagination: { page, limit, hasMore: users.length > limit } });
});

export const getUser = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid user id" });
  const user = await User.findById(req.params.id).select("+passwordHash");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: safeUser(user) });
});

export const setUserStatus = asyncHandler(async (req, res) => sendMutationResponse(res, guardSystemAdminMutation(req.user.id, async (assertHeld) => {
  if (!validId(req.params.id)) return { status: 400, body: { error: "Invalid user id" } };
  const user = await User.findById(req.params.id).select("+authVersion +passwordHash");
  if (!user) return { status: 404, body: { error: "User not found" } };
  const next = req.body.status;
  if (user.role === "provider_admin" && next === "active" && (!user.passwordHash || !user.emailVerifiedAt)) return { status: 409, body: { error: "The representative must accept the activation invitation first" } };
  if (String(user._id) === req.user.id && next !== "active") return { status: 409, body: { error: "You cannot disable your own account" } };
  if (SYSTEM_ROLES.includes(user.role) && next !== "active") {
    const remaining = await User.countDocuments({ _id: { $ne: user._id }, role: { $in: SYSTEM_ROLES }, accountStatus: "active" });
    if (!remaining) return { status: 409, body: { error: "At least one active system administrator is required" } };
  }
  const before = user.accountStatus;
  user.accountStatus = next;
  user.disabledAt = next === "active" ? undefined : new Date();
  user.authVersion = Number(user.authVersion || 0) + 1;
  await assertHeld();
  await user.save();
  await revokeAllSessions(user._id, next === "active" ? "account_enabled" : "account_disabled");
  await sendEmailEvent({ eventKey: `account-status:${user._id}:${user.authVersion}`, to: user.email,
    template: "account_status", data: { status: next } });
  await audit(req, { user: req.user.id, action: next === "active" ? "account_enabled" : "account_disabled",
    entityType: "User", entityId: user._id, before: { accountStatus: before }, after: { accountStatus: next } });
  return { body: { user: safeUser(user) } };
})));

export const setUserRole = asyncHandler(async (req, res) => sendMutationResponse(res, guardSystemAdminMutation(req.user.id, async (assertHeld) => {
  if (!validId(req.params.id)) return { status: 400, body: { error: "Invalid user id" } };
  const user = await User.findById(req.params.id).select("+authVersion +passwordHash");
  if (!user) return { status: 404, body: { error: "User not found" } };
  const next = req.body.role;
  if (!SAFE_ROLES.includes(next)) return { status: 400, body: { error: "Invalid role" } };
  if (String(user._id) === req.user.id && next !== "system_admin") return { status: 409, body: { error: "You cannot remove your own system access" } };
  if (SYSTEM_ROLES.includes(user.role) && !SYSTEM_ROLES.includes(next)) {
    const remaining = await User.countDocuments({ _id: { $ne: user._id }, role: { $in: SYSTEM_ROLES }, accountStatus: "active" });
    if (!remaining) return { status: 409, body: { error: "At least one active system administrator is required" } };
  }
  const before = user.role;
  user.role = next;
  user.authVersion = Number(user.authVersion || 0) + 1;
  await assertHeld();
  await user.save();
  await revokeAllSessions(user._id, "role_changed");
  await sendEmailEvent({ eventKey: `role-change:${user._id}:${user.authVersion}`, to: user.email,
    template: "role_changed", data: { role: next } });
  await audit(req, { user: req.user.id, action: "role_changed", entityType: "User", entityId: user._id,
    before: { role: before }, after: { role: next } });
  return { body: { user: safeUser(user) } };
})));

export const revokeUserSessions = asyncHandler(async (req, res) => sendMutationResponse(res, guardSystemAdminMutation(req.user.id, async (assertHeld) => {
  if (!validId(req.params.id)) return { status: 400, body: { error: "Invalid user id" } };
  const user = await User.findById(req.params.id).select("+authVersion");
  if (!user) return { status: 404, body: { error: "User not found" } };
  user.authVersion = Number(user.authVersion || 0) + 1;
  await assertHeld();
  await user.save();
  const result = await revokeAllSessions(user._id, "admin_revoked");
  await audit(req, { user: req.user.id, action: "revoke", entityType: "AuthSession", entityId: user._id,
    after: { revokedCount: result.modifiedCount || 0 } });
  return { body: { ok: true, revokedCount: result.modifiedCount || 0 } };
})));

export const triggerUserReset = asyncHandler(async (req, res) => sendMutationResponse(res, guardSystemAdminMutation(req.user.id, async (assertHeld) => {
  if (!validId(req.params.id)) return { status: 400, body: { error: "Invalid user id" } };
  const user = await User.findById(req.params.id);
  if (!user) return { status: 404, body: { error: "User not found" } };
  if (user.accountStatus !== "active") return { status: 409, body: { error: "Activate the account before preparing password recovery" } };
  if (user.role === "provider_admin" && (!user.notificationEmailVerifiedAt || !user.notificationEmail)) return { status: 409, body: { error: "Verify a real recovery contact before preparing a reset" } };
  await issueAuthToken(user, "reset_password");
  await audit(req, { user: req.user.id, action: "password_reset_requested", entityType: "UserPassword", entityId: user._id });
  return { body: { ok: true, message: "Password-reset instructions were prepared." } };
})));

export const resendUserVerification = asyncHandler(async (req, res) => sendMutationResponse(res, guardSystemAdminMutation(req.user.id, async (assertHeld) => {
  if (!validId(req.params.id)) return { status: 400, body: { error: "Invalid user id" } };
  const user = await User.findById(req.params.id);
  if (!user) return { status: 404, body: { error: "User not found" } };
  if (!user.emailVerifiedAt) await issueAuthToken(user, "verify_email");
  await audit(req, { user: req.user.id, action: "email_verification_requested", entityType: "UserEmail", entityId: user._id });
  return { body: { ok: true, alreadyVerified: Boolean(user.emailVerifiedAt) } };
})));
