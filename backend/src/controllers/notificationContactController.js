import { asyncHandler } from "../utils/asyncHandler.js";
import { AuthToken } from "../models/AuthToken.js";
import { User } from "../models/User.js";
import { digestToken, consumeAuthToken } from "../services/authTokenService.js";
import { configureNotificationContact } from "../services/notificationContacts.js";
import { writeAudit } from "../utils/audit.js";
import { guardSystemAdminMutation } from "../services/adminMutationGuard.js";
export const configureContact = asyncHandler(async (req, res) => guardSystemAdminMutation(req.user.id, async () => {
  const user = await User.findOne({ _id: req.params.id, role: { $in: ["system_admin", "provider_admin", "hospital_admin"] } }).select("+authVersion");
  if (!user) return res.status(404).json({ error: "Notification account not found" });
  const delivery = await configureNotificationContact(user, req.body.email.toLowerCase().trim(), req.body.enabled);
  await writeAudit({ user: req.user.id, action: "update", entityType: "NotificationContact", entityId: user._id,
    after: { enabled: user.notificationsEnabled, verified: Boolean(user.notificationEmailVerifiedAt) } });
  res.json({ ok: true, delivery, verified: Boolean(user.notificationEmailVerifiedAt) });
}));
export const verifyNotificationContact = asyncHandler(async (req, res) => {
  const snapshot = await AuthToken.findOne({ tokenHash: digestToken(req.body.token), purpose: "notification_email" }).select("+metadata");
  const user = snapshot && await User.findById(snapshot.user).select("+authVersion");
  if (!user || user.notificationEmail !== snapshot.metadata?.notificationEmail || !await consumeAuthToken(req.body.token, "notification_email")) return res.status(400).json({ error: "Notification verification link is invalid or expired" });
  // Conditional update prevents an old link from verifying a newly changed address.
  const updated = await User.updateOne({ _id: user._id, notificationEmail: snapshot.metadata.notificationEmail, authVersion: Number(user.authVersion || 0) ? Number(user.authVersion) : { $in: [0, null] } }, { $set: { notificationEmailVerifiedAt: new Date() } });
  if (!updated.modifiedCount) return res.status(409).json({ error: "Notification contact changed. Request a new link" });
  await writeAudit({ user: user._id, action: "email_verified", entityType: "NotificationContact", entityId: user._id });
  res.json({ ok: true });
});
