import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { sendEmailEvent } from "./emailService.js";

export async function notifyUser({ recipient, eventKey, type, title, message, relatedType, relatedId, emailTemplate, emailData }) {
  const notification = await Notification.findOneAndUpdate({ eventKey },
    { $setOnInsert: { recipient, eventKey, type, title, message, relatedType, relatedId } },
    { upsert: true, new: true, runValidators: true });
  if (emailTemplate) {
    const user = await User.findById(recipient).select("email").lean();
    if (user?.email) await sendEmailEvent({ eventKey: `mail:${eventKey}`, to: user.email, template: emailTemplate, data: emailData });
  }
  return notification;
}

// Use after a primary record has already been committed. A notification-store or
// email-delivery failure must not turn a successful request into an HTTP 500 and
// prompt the caller to submit the primary record again.
export async function notifyUserSafely(event) {
  try {
    return { notification: await notifyUser(event), status: "recorded" };
  } catch (error) {
    const errorCode = String(error?.code || "NOTIFICATION_FAILED")
      .replace(/[^A-Z0-9_-]/gi, "_")
      .slice(0, 80);
    console.warn(`[medreach] notification ${event?.eventKey || "unknown"} failed: ${errorCode}`);
    return { notification: null, status: "failed", errorCode };
  }
}
