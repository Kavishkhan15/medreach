import { User } from "../models/User.js";
import { signToken } from "../utils/token.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";
import { issueAuthToken, consumeAuthToken } from "../services/authTokenService.js";
import { sendEmailEvent } from "../services/emailService.js";
import { AuditLog } from "../models/AuditLog.js";

function setAuthCookie(res, token) {
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: env.nodeEnv === "production" ? "none" : "lax",
    secure: env.nodeEnv === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export const register = asyncHandler(async (req, res) => {
  const { email, password, name, region, emergencyContact } = req.body;
  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) return res.status(409).json({ error: "Email already registered" });

  const user = new User({ email, name, region, emergencyContact, role: "user" });
  await user.setPassword(password);
  await user.save();
  const verificationLink = await issueAuthToken(user, "verify_email");
  await sendEmailEvent({ eventKey: `welcome:${user._id}`, to: user.email, template: "welcome", data: { name: user.name } });

  const token = signToken(user);
  setAuthCookie(res, token);
  res.status(201).json({ user, token, ...(verificationLink ? { verificationLink } : {}) });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  if (user.accountStatus !== "active") return res.status(403).json({ error: "Account inactive" });
  user.lastLogin = new Date();
  await user.save();
  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ user, token });
});

export const logout = asyncHandler(async (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).populate("savedHospitals", "name slug city emergencyStatus");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase() });
  const resetLink = user ? await issueAuthToken(user, "reset_password") : null;
  res.json({ message: "If the account exists, password-reset instructions were prepared.",
    ...(resetLink ? { resetLink } : {}) });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const entry = await consumeAuthToken(req.body.token, "reset_password");
  if (!entry) return res.status(400).json({ error: "Invalid or expired reset link" });
  const user = await User.findById(entry.user).select("+passwordHash");
  if (!user) return res.status(400).json({ error: "Invalid reset link" });
  await user.setPassword(req.body.password);
  await user.save();
  await AuditLog.create({ user: user._id, action: "update", entityType: "UserPassword", entityId: user._id,
    requestId: req.id });
  res.json({ ok: true });
});

export const requestVerification = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.emailVerifiedAt) return res.json({ verified: true });
  const verificationLink = await issueAuthToken(user, "verify_email");
  res.json({ verified: false, ...(verificationLink ? { verificationLink } : {}) });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const entry = await consumeAuthToken(req.body.token, "verify_email");
  if (!entry) return res.status(400).json({ error: "Invalid or expired verification link" });
  const user = await User.findByIdAndUpdate(entry.user, { emailVerifiedAt: new Date() }, { new: true });
  await AuditLog.create({ user: user._id, action: "verify", entityType: "UserEmail", entityId: user._id,
    requestId: req.id });
  res.json({ verified: true });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const patch = Object.fromEntries(["name", "region", "emergencyContact"]
    .filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
  const user = await User.findByIdAndUpdate(req.user.id, patch, { new: true, runValidators: true });
  if (!user) return res.status(404).json({ error: "User not found" });
  await AuditLog.create({ user: user._id, action: "update", entityType: "UserProfile", entityId: user._id,
    requestId: req.id });
  res.json({ user });
});

export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select("+passwordHash");
  if (!user || !(await user.comparePassword(req.body.currentPassword))) {
    return res.status(400).json({ error: "Current password incorrect" });
  }
  await user.setPassword(req.body.newPassword);
  await user.save();
  await AuditLog.create({ user: user._id, action: "update", entityType: "UserPassword", entityId: user._id,
    requestId: req.id });
  res.json({ ok: true });
});
