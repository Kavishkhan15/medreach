import { sendMutationResponse } from "../utils/sendMutationResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AuthToken } from "../models/AuthToken.js";
import { User } from "../models/User.js";
import { consumeAuthToken, digestToken, revokeAllSessions } from "../services/authTokenService.js";
import { writeAudit } from "../utils/audit.js";
import { guardAdminMutation } from "../services/adminMutationGuard.js";
export const activateProvider = asyncHandler(async (req, res) => sendMutationResponse(res, guardAdminMutation(async () => {
  const snapshot = await AuthToken.findOne({ tokenHash: digestToken(req.body.token), purpose: "provider_activation" }).select("+metadata");
  const user = snapshot && await User.findOne({ _id: snapshot.user, role: "provider_admin", accountStatus: "pending" }).select("+authVersion");
  if (!user || snapshot.metadata?.notificationEmail !== user.notificationEmail) return { status: 400, body: { error: "Activation link is no longer valid" } };
  const entry = await consumeAuthToken(req.body.token, "provider_activation");
  if (!entry) return { status: 400, body: { error: "Activation link is invalid or expired" } };
  await user.setPassword(req.body.password);
  // Contact/status changes during hashing must invalidate the old invitation.
  const activated = await User.findOneAndUpdate({ _id: user._id, role: "provider_admin", accountStatus: "pending",
    notificationEmail: snapshot.metadata.notificationEmail, authVersion: Number(user.authVersion || 0) ? Number(user.authVersion) : { $in: [0, null] } },
  { $set: { passwordHash: user.passwordHash, credentialState: "custom", emailVerifiedAt: new Date(),
    notificationEmailVerifiedAt: new Date(), notificationsEnabled: true, accountStatus: "active" },
    $inc: { authVersion: 1 } }, { new: true, runValidators: true });
  if (!activated) return { status: 409, body: { error: "Account changed. Request a new activation invitation" } };
  await revokeAllSessions(user._id, "provider_activated");
  await writeAudit({ user: user._id, action: "account_enabled", entityType: "ProviderAccount", entityId: user._id });
  return { body: { ok: true, message: "Provider account activated. Sign in with your login email." } };
})));
