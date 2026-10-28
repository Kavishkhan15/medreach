import { User } from "../models/User.js";
import { sendEmailEvent } from "./emailService.js";

export async function sendUserEmail({ recipient, eventKey, emailTemplate, emailData }) {
  if (!emailTemplate) return null;
  const user = await User.findById(recipient).select("email").lean();
  if (!user?.email) return null;
  return sendEmailEvent({ eventKey: `mail:${eventKey}`, to: user.email, recipientUser: user._id,
    recipientContactPolicy: "account", template: emailTemplate, data: emailData });
}

// Email failures after a saved primary record must not encourage resubmission.
export async function sendUserEmailSafely(event) {
  try {
    return { delivery: await sendUserEmail(event), status: "recorded" };
  } catch (error) {
    const errorCode = String(error?.code || "EMAIL_FAILED").replace(/[^A-Z0-9_-]/gi, "_").slice(0, 80);
    console.warn(`[medreach] user email ${event?.eventKey || "unknown"} failed: ${errorCode}`);
    return { delivery: null, status: "failed", errorCode };
  }
}
