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
