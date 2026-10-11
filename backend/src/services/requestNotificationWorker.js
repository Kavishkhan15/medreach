import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { BloodRequest } from "../models/BloodRequest.js";
import { AmbulanceBooking } from "../models/AmbulanceBooking.js";
import { routeRequestSafely } from "./requestNotifications.js";
import { RequestNotification } from "../models/RequestNotification.js";
import { EmailDelivery } from "../models/EmailDelivery.js";
import { retryEmailDelivery } from "./emailService.js";
let timer, running;
export async function recoverRequestNotifications() {
  for (const Model of [EmergencyRequest, BloodRequest, AmbulanceBooking]) {
    // Only new-version requests opt in. Historical data is never rebroadcast.
    const records = await Model.find({ notificationVersion: 1, notificationRoutedAt: { $exists: false } }).limit(50);
    for (const record of records) await routeRequestSafely(record, Model.modelName);
  }
  // Reconcile delivery independently of the source record's routed marker.
  // Safe failures get bounded retries; expired in-flight sends are ambiguous.
  const intents = await RequestNotification.find({ status: { $in: ["pending", "failed"] } }).sort({ recoveryCheckedAt: 1, _id: 1 }).limit(50);
  for (const intent of intents) {
    await RequestNotification.updateOne({ _id: intent._id }, { $set: { recoveryCheckedAt: new Date() } });
    const delivery = await EmailDelivery.findOne({ eventKey: intent.eventKey });
    if (!delivery) continue; // The source routing pass will prepare it.
    if (["sent", "disabled", "uncertain"].includes(delivery.status)) {
      intent.status = delivery.status; await intent.save(); await refreshBooking(intent); continue;
    }
    if (delivery.status === "pending" && delivery.attempts > 0) {
      if (!delivery.leaseUntil || delivery.leaseUntil <= new Date()) {
        const result = await EmailDelivery.updateOne({ _id: delivery._id, status: "pending",
          $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: new Date() } }] },
          { $set: { status: "uncertain", errorCode: "DELIVERY_OUTCOME_UNKNOWN", lastError: "Check the recipient inbox before sending again" }, $unset: { leaseToken: 1, leaseUntil: 1 } });
        if (result.modifiedCount) { intent.status = "uncertain"; await intent.save(); await refreshBooking(intent); }
      }
      continue;
    }
    if (delivery.attempts >= 3 || (delivery.lastAttemptAt && Date.now() - delivery.lastAttemptAt.getTime() < 30000)) continue;
    const result = await retryEmailDelivery({ deliveryId: delivery._id });
    if (result.code === "RECIPIENT_NO_LONGER_ELIGIBLE") { intent.status = "cancelled"; await intent.save(); await refreshBooking(intent); }
  }
}
export function startRequestNotificationWorker() {
  if (timer) return;
  const tick = () => {
    if (running) return;
    running = recoverRequestNotifications().catch(() => console.warn("[medreach] Notification recovery unavailable.")).finally(() => { running = null; });
  };
  tick(); timer = setInterval(tick, 30000); timer.unref();
}
export async function stopRequestNotificationWorker() { clearInterval(timer); timer = null; if (running) await running; }

async function refreshBooking(intent) {
  if (intent.sourceType !== "AmbulanceBooking") return;
  const booking = await AmbulanceBooking.findById(intent.source);
  if (booking) {
    const { refreshAmbulanceDeliveryState } = await import("./ambulanceDeliveryState.js");
    await refreshAmbulanceDeliveryState(booking); await booking.save();
  }
}
