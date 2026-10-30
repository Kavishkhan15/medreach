import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { DiagnosticRequest } from "../models/DiagnosticRequest.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { canManageResource } from "./providerAccess.js";
import { organizationIsAvailable } from "./providerLifecycle.js";
import { routeRequestSafely } from "./requestNotifications.js";
import { requestStatusEffect, drainRequestStatusEffects, STATUS_EFFECTS_CAPACITY } from "./requestStatusEffects.js";
import { generateTrackingToken, hashTrackingToken, trackingTokenForIdempotency, verifyTrackingToken, TRACKING_TOKEN_HEADER } from "../utils/trackingToken.js";
import { getDiagnosticCapacityMode, getRequestReservationMode, holdDiagnosticTests,
  transitionReservations, withCapacityTransaction } from "./capacityReservations.js";

export const DIAGNOSTIC_TRANSITIONS = {
  REQUESTED: ["UNDER_REVIEW", "CONFIRMED", "DECLINED", "CANCELLED"],
  UNDER_REVIEW: ["CONFIRMED", "DECLINED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"], COMPLETED: [], DECLINED: [], CANCELLED: [], EXPIRED: [],
};
const fail = (status, message) => Object.assign(new Error(message), { status, code: "DIAGNOSTIC_REQUEST_REJECTED" });
export const indiaDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);
export function validPreferredDate(value, { allowToday = false } = {}) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && (allowToday ? value >= indiaDate() : value > indiaDate()) && value <= indiaDate(new Date(Date.now() + 180 * 86400000));
}
function allocationSummary(result) {
  const expiries = (result.reservations || []).map(row => row.expiresAt).filter(Boolean).map(value => new Date(value));
  return { mode: result.mode, ...(result.reason ? { reason: result.reason } : {}),
    ...(expiries.length ? { expiresAt: new Date(Math.min(...expiries.map(value => value.getTime()))) } : {}) };
}
export function privateDiagnosticRequest(record) {
  const value = record.toJSON();
  delete value.consentAt;
  delete value.user;
  delete value.notificationVersion;
  delete value.coordinationVersion;
  delete value.coordinationRecordedAt;
  value.history = value.history.map(({ actor, ...event }) => event);
  return value;
}
export function canReadDiagnostic(req, record) {
  return Boolean((canManageResource(req.user, { _id: record.provider })
      && (!record.centreApprovalPending || req.user?.role === "system_admin"))
    || (record.user && String(record.user) === String(req.user?.id))
    || verifyTrackingToken(req.get(TRACKING_TOKEN_HEADER), record.trackingTokenHash));
}
function canCancelDiagnostic(req, record) {
  // Administrator cancellation uses the privileged status endpoint. This path
  // grants only patient ownership or delegated private-link access.
  return Boolean((record.user && String(record.user) === String(req.user?.id))
    || verifyTrackingToken(req.get(TRACKING_TOKEN_HEADER), record.trackingTokenHash));
}
export async function createDiagnosticRequest(req) {
  const body = req.body;
  // Build the payload explicitly. Client-supplied status, owner and organisation fields never enter storage.
  const payload = { providerId: body.providerId, tests: [...body.tests].sort(),
    patientName: body.patientName, contactPhone: body.contactPhone,
    contactEmail: body.contactEmail || "", notes: body.notes || "",
    preferredDate: body.preferredDate, preferredTime: body.preferredTime, consent: true };
  // Keep historical routine idempotency hashes stable when urgency was absent.
  if (body.urgency === "URGENT") payload.urgency = "URGENT";
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const idempotencyKeyHash = req.idempotencyKeyHash && createHash("sha256")
    .update(`${req.user?.id || "guest"}:${req.idempotencyKeyHash}`).digest("hex");
  const token = trackingTokenForIdempotency(idempotencyKeyHash) || generateTrackingToken();
  const replay = async () => {
    const previous = await DiagnosticRequest.findOne({ idempotencyKeyHash }).select("+payloadHash +trackingTokenHash");
    if (!previous || previous.payloadHash !== payloadHash) throw fail(409, "This submission key was already used for a different request.");
    return { record: previous, token, replayed: true };
  };
  if (idempotencyKeyHash && await DiagnosticRequest.exists({ idempotencyKeyHash })) return replay();
  const provider = await ResourceProvider.findOne({ _id: body.providerId, kind: "diagnostic", approvalStatus: { $nin: ["pending", "rejected"] }, active: { $ne: false }, archivedAt: null }).select("name approvalStatus");
  if (!provider || !await organizationIsAvailable("diagnostic", body.providerId)) throw fail(409, "This centre is not currently accepting test requests.");
  // Legacy directory listings collect coordination requests for MedReach review;
  // they are never silently approved or allowed to confirm appointments.
  const centreApprovalPending = provider.approvalStatus !== "approved";
  const effect = requestStatusEffect({ previousStatus: "NONE", status: "REQUESTED", actor: req.user });
  let record;
  try {
    const id = new mongoose.Types.ObjectId();
    const configured = !centreApprovalPending && await getDiagnosticCapacityMode({ organizationId: provider._id, tests: payload.tests, date: payload.preferredDate });
    const save = async session => {
      const allocation = configured ? await holdDiagnosticTests({ session, requestId: id,
        organizationId: provider._id, tests: payload.tests, date: payload.preferredDate,
        urgency: body.urgency === "URGENT" ? "urgent" : "routine", actorId: req.user?.id })
        : { mode: "coordination", reason: centreApprovalPending ? "CENTRE_APPROVAL_PENDING" : "CAPACITY_NOT_CONFIGURED" };
      const document = new DiagnosticRequest({ _id: id, reference: `DX-${randomBytes(10).toString("hex").toUpperCase()}`,
      provider: provider._id, providerName: provider.name, user: req.user?.id, tests: payload.tests, centreApprovalPending,
      requestSnapshot: { patientName: payload.patientName, contactPhone: payload.contactPhone,
        contactEmail: payload.contactEmail || undefined, notes: payload.notes || undefined },
      preferredDate: payload.preferredDate, preferredTime: payload.preferredTime, consentAt: new Date(),
      urgency: body.urgency || "ROUTINE", capacityAllocation: allocationSummary(allocation),
      payloadHash, ...(idempotencyKeyHash ? { idempotencyKeyHash } : {}), trackingTokenHash: hashTrackingToken(token),
      history: [{ status: "REQUESTED", at: new Date(), actor: req.user?.id }], statusEffects: [effect] });
      await document.save({ ...(session ? { session } : {}) });
      return document;
    };
    record = configured ? await withCapacityTransaction(save) : await save();
    record.$session(null);
  } catch (error) {
    if (error.code === 11000 && idempotencyKeyHash) return replay();
    throw error;
  }
  // The request itself is the durable routing intent. Recovery handles crashes after this save.
  await routeRequestSafely(record, "DiagnosticRequest");
  await drainRequestStatusEffects("DiagnosticRequest", record._id).catch(() => {});
  return { record, token, replayed: false };
}
export async function transitionDiagnosticRequest(req, { cancel = false } = {}) {
  const row = await DiagnosticRequest.findOne(cancel ? { reference: req.params.reference } : { _id: req.params.id }).select("+trackingTokenHash");
  if (!row) throw fail(404, "Diagnostic request not found");
  if (cancel ? !canCancelDiagnostic(req, row) : !canManageResource(req.user, { _id: row.provider })) throw fail(403, "Access to this request is required");
  if (!cancel && row.centreApprovalPending && req.user.role !== "system_admin") throw fail(403, "MedReach must review this request before handing it to the centre");
  if (!cancel && !await organizationIsAvailable("diagnostic", row.provider)) throw fail(409, "This centre is no longer active");
  const status = cancel ? "CANCELLED" : req.body.status;
  const reviewHandoff = row.centreApprovalPending && row.status === "UNDER_REVIEW" && status === "UNDER_REVIEW";
  if (row.version !== req.body.expectedVersion || (!DIAGNOSTIC_TRANSITIONS[row.status]?.includes(status) && !reviewHandoff)) throw fail(409, "This request changed. Refresh before trying again.");
  const changes = { status };
  let releaseToCentre = false;
  if (!cancel) {
    const provider = await ResourceProvider.findById(row.provider).select("approvalStatus").lean();
    const approved = provider?.approvalStatus === "approved";
    if ((["CONFIRMED", "COMPLETED"].includes(status) || reviewHandoff) && !approved) throw fail(409, "The centre must be approved before an appointment can be confirmed or handed to it");
    releaseToCentre = Boolean(row.centreApprovalPending && approved && ["UNDER_REVIEW", "CONFIRMED"].includes(status));
    if (releaseToCentre) changes.centreApprovalPending = false;
  }
  if (status === "CONFIRMED") {
    const tests = req.body.acceptedTests;
    const at = new Date(req.body.appointmentAt);
    if (!Array.isArray(tests) || !tests.length || new Set(tests).size !== tests.length || tests.some(test => !row.tests.includes(test))
      || !Number.isFinite(at.getTime()) || at <= new Date() || at.getTime() > Date.now() + 180 * 86400000) {
      throw fail(400, "Confirm at least one requested test and a future appointment time within 180 days.");
    }
    if (row.capacityAllocation?.mode === "held" && (tests.length !== row.tests.length
      || indiaDate(at) !== row.preferredDate)) {
      throw fail(409, "Confirm every held test on the requested date, or decline this request and arrange a new one.");
    }
    Object.assign(changes, { acceptedTests: tests, appointmentAt: at });
  }
  if (!cancel && req.body.providerResponse !== undefined) changes.providerResponse = req.body.providerResponse;
  const emergencyException = status === "CONFIRMED" && row.urgency === "URGENT"
    && row.capacityAllocation?.reason === "EMERGENCY_CAPACITY_REVIEW_REQUIRED";
  if (emergencyException && (!req.body.providerResponse || req.body.providerResponse.trim().length < 20)) {
    throw fail(400, "Record how the centre can accommodate this emergency outside routine capacity (at least 20 characters).");
  }
  const effect = requestStatusEffect({ previousStatus: row.status, status, actor: req.user });
  const reserved = await getRequestReservationMode({ requestType: "diagnostic", requestId: row._id });
  const configureAtConfirmation = status === "CONFIRMED" && !reserved && !emergencyException
    && await getDiagnosticCapacityMode({ organizationId: row.provider, tests: changes.acceptedTests, date: indiaDate(changes.appointmentAt) });
  const save = async session => {
    const nextChanges = { ...changes };
    if (configureAtConfirmation) {
      const allocation = await holdDiagnosticTests({ session, requestId: row._id, organizationId: row.provider,
        tests: changes.acceptedTests, date: indiaDate(changes.appointmentAt),
        urgency: row.urgency === "URGENT" ? "urgent" : "routine", actorId: req.user?.id });
      if (allocation.mode !== "held") throw fail(409, "Verified test capacity is required before confirming this appointment.");
    }
    const action = status === "CONFIRMED" ? "confirm" : status === "COMPLETED" ? "complete"
      : ["DECLINED", "CANCELLED"].includes(status) ? "release" : null;
    if ((reserved || configureAtConfirmation) && action) {
      await transitionReservations({ session, requestType: "diagnostic", requestId: row._id, action, actorId: req.user?.id });
      nextChanges.capacityAllocation = { mode: action === "confirm" ? "confirmed" : action === "complete" ? "completed" : "released" };
    }
    return DiagnosticRequest.findOneAndUpdate({ _id: row._id, version: req.body.expectedVersion, status: row.status,
      [`statusEffects.${STATUS_EFFECTS_CAPACITY - 1}`]: { $exists: false } }, {
      $set: nextChanges, $inc: { version: 1 }, ...(releaseToCentre ? { $unset: { notificationRoutedAt: 1, notificationRouting: 1 } } : {}), $push: { statusEffects: effect,
        history: { status, at: effect.recordedAt, actor: req.user?.id,
          acceptedTests: changes.acceptedTests, appointmentAt: changes.appointmentAt } },
    }, { new: true, runValidators: true, ...(session ? { session } : {}) });
  };
  // A failed version check must also roll back allocation changes.
  const write = async session => {
    const result = await save(session);
    if (!result) throw fail(409, "Another administrator updated this request. Refresh before trying again.");
    return result;
  };
  const updated = reserved || configureAtConfirmation ? await withCapacityTransaction(write) : await write();
  updated.$session(null);
  if (!updated) throw fail(409, "Another administrator updated this request. Refresh before trying again.");
  if (releaseToCentre) await routeRequestSafely(updated, "DiagnosticRequest");
  await drainRequestStatusEffects("DiagnosticRequest", updated._id).catch(() => {});
  return updated;
}

// Called by the capacity worker inside the same transaction that releases all
// expired holds. Confirmed appointments are deliberately outside this path.
export async function expireDiagnosticRequest({ session, requestId, now = new Date() }) {
  const row = await DiagnosticRequest.findOne({ _id: requestId,
    status: { $in: ["REQUESTED", "UNDER_REVIEW"] }, "capacityAllocation.mode": "held" }).session(session);
  if (!row) return null;
  const effect = requestStatusEffect({ previousStatus: row.status, status: "EXPIRED", actor: undefined });
  effect.recordedAt = now;
  const updated = await DiagnosticRequest.findOneAndUpdate({ _id: row._id, status: row.status, version: row.version,
    [`statusEffects.${STATUS_EFFECTS_CAPACITY - 1}`]: { $exists: false } }, {
    $set: { status: "EXPIRED", capacityAllocation: { mode: "expired", reason: "HOLD_EXPIRED" } },
    $inc: { version: 1 }, $push: { statusEffects: effect, history: { status: "EXPIRED", at: now } },
  }, { new: true, runValidators: true, session });
  if (!updated) throw fail(409, "Diagnostic expiry conflicted with another update; retry safely.");
  return updated;
}
