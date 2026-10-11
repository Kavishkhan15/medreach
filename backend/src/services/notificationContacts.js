import { randomBytes } from "node:crypto";
import { AuthToken } from "../models/AuthToken.js";
import { digestToken } from "./authTokenService.js";
import { sendEmailEvent } from "./emailService.js";
import { env } from "../config/env.js";
import { validContact } from "./providerAccounts.js";
import { User } from "../models/User.js";
import { revokeAllSessions } from "./authTokenService.js";
export async function configureNotificationContact(user, email, enabled) {
  if (!validContact(email)) throw Object.assign(new Error("A real notification address is required"), { status: 400 });
  const changed = email !== user.notificationEmail;
  const updated = await User.findOneAndUpdate({ _id: user._id, authVersion: Number(user.authVersion || 0) ? Number(user.authVersion) : { $in: [0, null] },
    role: user.role, notificationEmail: user.notificationEmail ?? { $exists: false } },
    { $set: { notificationEmail: email, notificationsEnabled: enabled }, ...(changed ? {
      $unset: { notificationEmailVerifiedAt: 1 }, $inc: { authVersion: 1 } } : {}) }, { new: true, runValidators: true }).select("+authVersion");
  if (!updated) throw Object.assign(new Error("Account changed; refresh before changing its contact"), { status: 409 });
  user.notificationEmail = updated.notificationEmail;
  user.notificationsEnabled = updated.notificationsEnabled;
  user.notificationEmailVerifiedAt = updated.notificationEmailVerifiedAt;
  user.authVersion = updated.authVersion;
  if (changed) {
    await AuthToken.updateMany({ user: user._id, purpose: { $in: ["provider_activation", "reset_password", "notification_email"] },
      usedAt: { $exists: false } }, { $set: { revokedAt: new Date(), revokeReason: "contact_changed" } });
    await revokeAllSessions(user._id, "contact_changed");
  }
  if (user.notificationEmailVerifiedAt) return "verified";
  const token = randomBytes(32).toString("base64url");
  await AuthToken.updateMany({ user: user._id, purpose: "notification_email", usedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  const entry = await AuthToken.create({ user: user._id, purpose: "notification_email", tokenHash: digestToken(token),
    expiresAt: new Date(Date.now() + 86400000), metadata: { notificationEmail: email } });
  const delivery = await sendEmailEvent({ eventKey: `notification-contact:${entry._id}`, to: email, template: "notification_email",
    data: { url: `${env.publicAppUrl}/verify-notification-email?token=${token}` } });
  return delivery?.status || "failed";
}
