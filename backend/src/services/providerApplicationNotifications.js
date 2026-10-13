import { EmailDelivery } from "../models/EmailDelivery.js";
import { ProviderApplication } from "../models/ProviderApplication.js";
import { notificationRecipients } from "./requestNotifications.js";
import { sendEmailEvent } from "./emailService.js";

// Only newly opted-in applications are recovered; historical contacts are untouched.
async function deliver(event) {
  const previous = await EmailDelivery.findOne({ eventKey: event.eventKey });
  if (previous?.status === "failed" && (previous.attempts >= 3 || (previous.lastAttemptAt && Date.now() - previous.lastAttemptAt.getTime() < 30000))) return previous;
  return sendEmailEvent(event);
}
export async function notifyProviderApplicationSafely(application) {
  if (application.notificationVersion !== 1 || application.notificationCompletedAt) return;
  try {
    const deliveries = [await deliver({ eventKey: `provider-application:${application._id}:${application.status}:applicant`,
      to: application.contactEmail, template: "provider_application", data: { name: application.name, status: application.status, note: application.reviewNote } })];
    if (application.status === "pending") {
      const recipients = await notificationRecipients(null, null, true);
      for (const { user } of recipients) deliveries.push(await deliver({
        eventKey: `provider-application:${application._id}:admin:${user._id}`, to: user.notificationEmail,
        template: "provider_application_review", data: { name: application.name, kind: application.kind },
      }));
    }
    // Failed or in-flight messages remain eligible for reconciliation. Ambiguous
    // sends are never replayed by sendEmailEvent; operators verify them manually.
    if (deliveries.every((d) => ["sent", "disabled", "uncertain"].includes(d?.status))) {
      await ProviderApplication.updateOne({ _id: application._id, status: application.status }, { $set: { notificationCompletedAt: new Date() } });
    }
  } catch { console.warn("[medreach] Provider application saved; notification confirmation unavailable."); }
}
export async function recoverProviderApplicationNotifications() {
  const rows = await ProviderApplication.find({ notificationVersion: 1, notificationCompletedAt: { $exists: false } }).sort({ updatedAt: 1 }).limit(25);
  for (const application of rows) await notifyProviderApplicationSafely(application);
}
