import { createHash, randomBytes } from "node:crypto";
import { DiagnosticRequest } from "../models/DiagnosticRequest.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { canManageResource } from "./providerAccess.js";
import { organizationIsAvailable } from "./providerLifecycle.js";
import { routeRequestSafely } from "./requestNotifications.js";
import { requestStatusEffect, drainRequestStatusEffects, STATUS_EFFECTS_CAPACITY } from "./requestStatusEffects.js";
import { generateTrackingToken, hashTrackingToken, trackingTokenForIdempotency, verifyTrackingToken, TRACKING_TOKEN_HEADER } from "../utils/trackingToken.js";

export const DIAGNOSTIC_TRANSITIONS = {
  REQUESTED: ["UNDER_REVIEW", "CONFIRMED", "DECLINED", "CANCELLED"],
  UNDER_REVIEW: ["CONFIRMED", "DECLINED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"], COMPLETED: [], DECLINED: [], CANCELLED: [],
};
const fail = (status, message) => Object.assign(new Error(message), { status, code: "DIAGNOSTIC_REQUEST_REJECTED" });
export const indiaDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);
export function validPreferredDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && value > indiaDate() && value <= indiaDate(new Date(Date.now() + 180 * 86400000));
}
export function privateDiagnosticRequest(record) {
  const value = record.toJSON();
  delete value.consentAt;
  delete value.user;
  delete value.notificationVersion;
  value.history = value.history.map(({ actor, ...event }) => event);
  return value;
}
export function canReadDiagnostic(req, record) {
  return Boolean(canManageResource(req.user, { _id: record.provider })
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
  const provider = await ResourceProvider.findOne({ _id: body.providerId, kind: "diagnostic", approvalStatus: "approved", active: true, archivedAt: null }).select("name");
  if (!provider || !await organizationIsAvailable("diagnostic", body.providerId)) throw fail(409, "This centre is not currently approved to receive test requests.");
  const effect = requestStatusEffect({ previousStatus: "NONE", status: "REQUESTED", actor: req.user });
  let record;
  try {
    record = await DiagnosticRequest.create({ reference: `DX-${randomBytes(10).toString("hex").toUpperCase()}`,
      provider: provider._id, providerName: provider.name, user: req.user?.id, tests: payload.tests,
      requestSnapshot: { patientName: payload.patientName, contactPhone: payload.contactPhone,
        contactEmail: payload.contactEmail || undefined, notes: payload.notes || undefined },
      preferredDate: payload.preferredDate, preferredTime: payload.preferredTime, consentAt: new Date(),
      payloadHash, ...(idempotencyKeyHash ? { idempotencyKeyHash } : {}), trackingTokenHash: hashTrackingToken(token),
      history: [{ status: "REQUESTED", at: new Date(), actor: req.user?.id }], statusEffects: [effect] });
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
  if (!cancel && !await organizationIsAvailable("diagnostic", row.provider)) throw fail(409, "This centre is no longer active");
  const status = cancel ? "CANCELLED" : req.body.status;
  if (row.version !== req.body.expectedVersion || !DIAGNOSTIC_TRANSITIONS[row.status]?.includes(status)) throw fail(409, "This request changed. Refresh before trying again.");
  const changes = { status };
  if (status === "CONFIRMED") {
    const tests = req.body.acceptedTests;
    const at = new Date(req.body.appointmentAt);
    if (!Array.isArray(tests) || !tests.length || new Set(tests).size !== tests.length || tests.some(test => !row.tests.includes(test))
      || !Number.isFinite(at.getTime()) || at <= new Date() || at.getTime() > Date.now() + 180 * 86400000) {
      throw fail(400, "Confirm at least one requested test and a future appointment time within 180 days.");
    }
    Object.assign(changes, { acceptedTests: tests, appointmentAt: at });
  }
  if (!cancel && req.body.providerResponse !== undefined) changes.providerResponse = req.body.providerResponse;
  const effect = requestStatusEffect({ previousStatus: row.status, status, actor: req.user });
  const updated = await DiagnosticRequest.findOneAndUpdate({ _id: row._id, version: req.body.expectedVersion, status: row.status,
    [`statusEffects.${STATUS_EFFECTS_CAPACITY - 1}`]: { $exists: false } }, {
    $set: changes, $inc: { version: 1 }, $push: { statusEffects: effect,
      history: { status, at: effect.recordedAt, actor: req.user?.id,
        acceptedTests: changes.acceptedTests, appointmentAt: changes.appointmentAt } },
  }, { new: true, runValidators: true });
  if (!updated) throw fail(409, "Another administrator updated this request. Refresh before trying again.");
  await drainRequestStatusEffects("DiagnosticRequest", updated._id).catch(() => {});
  return updated;
}
