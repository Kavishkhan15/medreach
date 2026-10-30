import mongoose from "mongoose";
import { ResourceInventory } from "../models/ResourceInventory.js";
import { withCapacityTransaction, holdInventory, transitionReservations } from "./capacityReservations.js";

export function bedResourceKey(facility) {
  return ({ ICU: "icu_beds", NICU: "nicu_beds", PICU: "picu_beds", CCU: "ccu_beds", "Trauma ICU": "trauma_icu_beds" })[facility] || "general_beds";
}
export async function createRequestWithInventory(Model, values, allocation) {
  const _id = new mongoose.Types.ObjectId();
  const configured = allocation?.resourceKey && allocation.organizationId && await ResourceInventory.exists({
    kind: allocation.kind, organization: allocation.organizationId, resourceKey: allocation.resourceKey, reservationsEnabled: true,
  });
  if (!configured) return Model.create({ ...values, _id, capacityAllocation: { mode: "coordination", reason: values.isEmergency ? "EMERGENCY_COORDINATION" : "CAPACITY_NOT_CONFIGURED" } });
  return withCapacityTransaction(async session => {
    const result = await holdInventory({ ...allocation, session, requestType: "hospital", requestId: _id });
    const [request] = await Model.create([{ ...values, _id, capacityAllocation: {
      mode: result.mode, reason: result.reason, expiresAt: result.reservation?.expiresAt || result.expiresAt,
    } }], { session });
    request.$session(null);
    return request;
  });
}
export const hasCapacityAllocation = row => ["held", "confirmed", "admitted"].includes(row.capacityAllocation?.mode);

// Request state and inventory transition share a transaction; notifications are
// drained only after commit by the existing durable status-effect machinery.
export async function updateRequestWithInventory({ Model, row, filter, update, status, actorId }) {
  if (!hasCapacityAllocation(row)) return Model.findOneAndUpdate(filter, update, { new: true, runValidators: true });
  if (row.capacityAllocation.mode === "admitted" && status === "COMPLETED") {
    throw Object.assign(new Error("Record the actual discharge before completing this request"), { status: 409, code: "CAPACITY_ADMISSION_OPEN" });
  }
  return withCapacityTransaction(async session => {
    const action = ["CANCELLED", "REJECTED", "EXPIRED", "DECLINED"].includes(status) ? "release"
      : ["ACCEPTED", "CONFIRMED"].includes(status) ? "confirm"
      : status === "COMPLETED" ? (row.capacityAllocation.mode === "admitted" ? "discharge" : Model.modelName === "BloodRequest" ? "issue" : "release") : null;
    const allocation = action ? { ...row.capacityAllocation.toObject?.() || row.capacityAllocation,
      mode: ({ release: "released", confirm: "confirmed", discharge: "completed", issue: "issued" })[action] } : row.capacityAllocation;
    const updated = await Model.findOneAndUpdate(filter, { ...update, $set: { ...update.$set, capacityAllocation: allocation } }, { new: true, runValidators: true, session });
    if (!updated) return null;
    if (action) await transitionReservations({ session, requestType: "hospital", requestId: row._id, action, actorId });
    updated.$session(null);
    return updated;
  });
}
