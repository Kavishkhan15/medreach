import { expireReservations } from "./capacityReservations.js";
import { expireDiagnosticRequest } from "./diagnosticRequests.js";
import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { requestStatusEffect, STATUS_EFFECTS_CAPACITY } from "./requestStatusEffects.js";

export async function expireCapacityHolds({ now = new Date(), limit = 50 } = {}) {
  return expireReservations({ now, limit, onExpire: async ({ session, requestType, requestId }) => {
    if (requestType === "diagnostic") return expireDiagnosticRequest({ session, requestId, now });
    if (requestType !== "hospital") return;
    const row = await EmergencyRequest.findById(requestId).session(session);
    if (!row || row.capacityAllocation?.mode !== "held") return;
    const effect = requestStatusEffect({ previousStatus: row.status, status: "EXPIRED", now, timelineLength: row.timeline.length + 1 });
    const result = await EmergencyRequest.updateOne({ _id: row._id, status: row.status, "capacityAllocation.mode": "held",
      [`statusEffects.${STATUS_EFFECTS_CAPACITY - 1}`]: { $exists: false } }, {
      $set: { status: "EXPIRED", capacityAllocation: { mode: "expired", reason: "HOLD_EXPIRED" } },
      $push: { timeline: { status: "EXPIRED", actorRole: "system", at: now }, statusEffects: effect },
    }, { session });
    if (result.modifiedCount !== 1) throw Object.assign(new Error("Request changed during hold expiry"), { status: 409, code: "CAPACITY_CONFLICT" });
  } });
}
