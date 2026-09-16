import { randomBytes, createHash } from "node:crypto";
import { AuthToken } from "../models/AuthToken.js";
import { sendEmailEvent } from "./emailService.js";
import { env } from "../config/env.js";

const digest = (token) => createHash("sha256").update(token).digest("hex");

export async function issueAuthToken(user, purpose) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + (purpose === "reset_password" ? 30 : 1440) * 60000);
  const entry = await AuthToken.create({ user: user._id, purpose, tokenHash: digest(token), expiresAt });
  const path = purpose === "reset_password" ? "reset-password" : "verify-email";
  const url = `${env.publicAppUrl}/${path}?token=${token}`;
  await sendEmailEvent({ eventKey: `auth:${entry._id}`, to: user.email,
    template: purpose === "reset_password" ? "password_reset" : "verify_email", data: { url } });
  return env.nodeEnv !== "production" && !env.emailEnabled ? url : null;
}

export async function consumeAuthToken(token, purpose) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  return AuthToken.findOneAndUpdate({ tokenHash: digest(token), purpose,
    usedAt: { $exists: false }, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } }, { new: true });
}
