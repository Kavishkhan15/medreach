import { RequestNotification } from "../models/RequestNotification.js";
import { EmailDelivery } from "../models/EmailDelivery.js";
export async function refreshAmbulanceDeliveryState(booking) {
  for (const [channel, field] of [["system", "admin"], ["provider", "provider"]]) {
    const intents = await RequestNotification.find({ sourceType: "AmbulanceBooking", source: booking._id, channel, status: { $ne: "cancelled" } }).lean();
    const deliveries = await EmailDelivery.find({ eventKey: { $in: intents.map((i) => i.eventKey) } }).lean();
    const states = deliveries.map((d) => d.status);
    const failed = deliveries.find((d) => ["failed", "uncertain"].includes(d.status));
    booking.delivery[field].status = !intents.length ? "not_available" : states.includes("uncertain") ? "uncertain" : states.includes("failed") ? "failed" : states.length < intents.length || states.includes("pending") ? "pending" : states.includes("disabled") ? "disabled" : "sent";
    booking.delivery[field].attempted = deliveries.some((d) => d.attempts > 0);
    booking.delivery[field].attemptedAt = deliveries.find((d) => d.lastAttemptAt)?.lastAttemptAt;
    booking.delivery[field].sentAt = states.length && states.every((s) => s === "sent") ? deliveries.at(-1)?.sentAt : undefined;
    booking.delivery[field].errorCode = failed?.errorCode;
  }
}
