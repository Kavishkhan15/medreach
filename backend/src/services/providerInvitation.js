import { randomBytes } from "node:crypto";
import { User } from "../models/User.js";
import { AuthToken } from "../models/AuthToken.js";
import { digestToken } from "./authTokenService.js";
import { sendEmailEvent } from "./emailService.js";
import { env } from "../config/env.js";
export async function issueProviderActivation(user) {
  const token = randomBytes(32).toString("base64url");
  await AuthToken.updateMany({ user: user._id, purpose: "provider_activation", usedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokeReason: "superseded" } });
  const entry = await AuthToken.create({ user: user._id, purpose: "provider_activation", tokenHash: digestToken(token),
    expiresAt: new Date(Date.now() + 86400000), metadata: { notificationEmail: user.notificationEmail } });
  await User.updateOne({ _id: user._id }, { $set: { activationDeliveryStatus: "pending" } });
  const delivery = await sendEmailEvent({ eventKey: `provider-activation:${entry._id}`, to: user.notificationEmail || user.email,
    template: "provider_activation", data: { url: `${env.publicAppUrl}/activate-provider?token=${token}` } });
  user.activationDeliveryStatus = delivery?.status || "failed";
  await User.updateOne({ _id: user._id }, { $set: { activationDeliveryStatus: user.activationDeliveryStatus } });
  return { status: user.activationDeliveryStatus };
}
