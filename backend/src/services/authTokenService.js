import { randomBytes, randomUUID, createHash } from "node:crypto";
import { AuthToken } from "../models/AuthToken.js";
import { User } from "../models/User.js";
import { sendEmailEvent } from "./emailService.js";
import { env } from "../config/env.js";

export const digestToken = (token) => createHash("sha256").update(String(token)).digest("hex");
const opaqueToken = () => randomBytes(32).toString("base64url");
const fingerprint = (value) => value ? digestToken(value).slice(0, 32) : undefined;

export async function issueAuthToken(user, purpose) {
  const token = opaqueToken();
  const expiresAt = new Date(Date.now() + (purpose === "reset_password" ? 30 : 1440) * 60000);
  await AuthToken.updateMany({ user: user._id, purpose, usedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokeReason: "superseded" } });
  const entry = await AuthToken.create({ user: user._id, purpose, tokenHash: digestToken(token), expiresAt });
  const path = purpose === "reset_password" ? "reset-password" : "verify-email";
  const url = `${env.publicAppUrl}/${path}?token=${token}`;
  await sendEmailEvent({ eventKey: `auth:${entry._id}`, to: user.email,
    template: purpose === "reset_password" ? "password_reset" : "verify_email", data: { url } });
  // The raw token exists only in the transient email body. It is never returned
  // by the API, written to logs, or stored in either AuthToken or EmailDelivery.
  return null;
}

export async function consumeAuthToken(token, purpose) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  return AuthToken.findOneAndUpdate({ tokenHash: digestToken(token), purpose,
    usedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } }, { new: true });
}

export async function issueSession(user, { ip, userAgent, familyId = randomUUID() } = {}) {
  const token = opaqueToken();
  const entry = await AuthToken.create({ user: user._id, purpose: "refresh_session",
    tokenHash: digestToken(token), familyId,
    expiresAt: new Date(Date.now() + env.refreshTokenExpiresDays * 86400000),
    ipHash: fingerprint(ip), userAgentHash: fingerprint(userAgent),
    metadata: { authVersion: Number(user.authVersion || 0) } });
  return { token, entry };
}

export async function rotateSession(token, context = {}) {
  if (typeof token !== "string" || token.length < 40 || token.length > 128) return { error: "invalid" };
  const tokenHash = digestToken(token);
  const existing = await AuthToken.findOne({ tokenHash, purpose: "refresh_session" }).select("+metadata");
  if (!existing) return { error: "invalid" };
  if (existing.usedAt || existing.revokedAt || existing.expiresAt <= new Date()) {
    if (existing.familyId) await AuthToken.updateMany({ familyId: existing.familyId, purpose: "refresh_session" },
      { $set: { revokedAt: new Date(), revokeReason: "replay_detected" } });
    if (existing.usedAt) await User.updateOne({ _id: existing.user }, { $inc: { authVersion: 1 } });
    return { error: existing.usedAt ? "replay" : "invalid", userId: existing.user };
  }
  const claimed = await AuthToken.findOneAndUpdate({ _id: existing._id, usedAt: { $exists: false },
    revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { new: true });
  if (!claimed) {
    await AuthToken.updateMany({ familyId: existing.familyId, purpose: "refresh_session" },
      { $set: { revokedAt: new Date(), revokeReason: "replay_detected" } });
    await User.updateOne({ _id: existing.user }, { $inc: { authVersion: 1 } });
    return { error: "replay", userId: existing.user };
  }
  const user = await User.findById(existing.user).select("+authVersion +passwordHash");
  if (!user || user.accountStatus !== "active" || Number(existing.metadata?.authVersion || 0) !== Number(user.authVersion || 0)) {
    await AuthToken.updateMany({ familyId: existing.familyId, purpose: "refresh_session" },
      { $set: { revokedAt: new Date(), revokeReason: "account_changed" } });
    return { error: "invalid" };
  }
  const next = await issueSession(user, { ...context, familyId: existing.familyId });
  existing.replacedBy = next.entry._id;
  await existing.save();
  return { user, token: next.token, session: next.entry };
}

export async function revokeSessionToken(token, reason = "logout") {
  if (!token) return false;
  const existing = await AuthToken.findOne({ tokenHash: digestToken(token), purpose: "refresh_session" });
  if (!existing) return false;
  await AuthToken.updateMany({ familyId: existing.familyId, purpose: "refresh_session" },
    { $set: { revokedAt: new Date(), revokeReason: reason } });
  return true;
}

export async function revokeAllSessions(userId, reason = "security_change") {
  return AuthToken.updateMany({ user: userId, purpose: "refresh_session", revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokeReason: reason } });
}

export async function listSessions(userId) {
  const sessions = await AuthToken.find({ user: userId, purpose: "refresh_session",
    revokedAt: { $exists: false }, usedAt: { $exists: false }, expiresAt: { $gt: new Date() } })
    .select("_id createdAt expiresAt ipHash userAgentHash familyId").sort({ createdAt: -1 }).lean();
  return sessions.map(({ familyId: _familyId, ...session }) => session);
}
