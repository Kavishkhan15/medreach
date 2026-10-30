import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { assertProviderPermission } from "../services/providerPermissions.js";
import { configureInventoryReservations, configureDiagnosticCapacity, withCapacityTransaction, transitionReservations } from "../services/capacityReservations.js";
import { DiagnosticDailyCapacity } from "../models/DiagnosticDailyCapacity.js";
import { DIAGNOSTIC_TESTS } from "../models/DiagnosticRequest.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { organizationIsAvailable } from "../services/providerLifecycle.js";

const router = Router();
const fail = (status, message) => Object.assign(new Error(message), { status, code: "INVALID_CAPACITY_REQUEST" });
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.get("/diagnostic/:organizationId/daily", asyncHandler(async (req, res) => {
  const date = req.query.date;
  if (!mongoose.isObjectIdOrHexString(req.params.organizationId) || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(new Date(`${date}T00:00:00Z`).getTime()) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw fail(400, "Choose a valid centre and date");
  const provider = await ResourceProvider.findOne({ _id: req.params.organizationId, kind: "diagnostic", active: { $ne: false }, archivedAt: null,
    approvalStatus: { $nin: ["pending", "rejected"] } }).select("approvalStatus").lean();
  if (!provider || !await organizationIsAvailable("diagnostic", req.params.organizationId)) throw fail(404, "Centre not found");
  const rows = await DiagnosticDailyCapacity.find({ organization: req.params.organizationId, date }).select("test date capacity urgentCapacity held occupied urgentHeld urgentOccupied version enabled classification").lean();
  const policyEnabled = process.env.DIAGNOSTIC_CAPACITY_ENABLED === "true" && provider.approvalStatus === "approved";
  res.json({ data: DIAGNOSTIC_TESTS.map(test => {
    const row = rows.find(value => value.test === test);
    const known = row?.enabled && ["provider_confirmed", "platform_policy"].includes(row.classification)
      && [row.capacity, row.urgentCapacity, row.held, row.occupied, row.urgentHeld, row.urgentOccupied].every(value => Number.isSafeInteger(value) && value >= 0)
      && row.capacity <= 30 && row.urgentCapacity <= row.capacity && row.held + row.occupied <= row.capacity
      && row.urgentHeld <= row.held && row.urgentOccupied <= row.occupied
      && row.urgentHeld + row.urgentOccupied <= row.urgentCapacity
      && row.held + row.occupied - row.urgentHeld - row.urgentOccupied <= row.capacity - row.urgentCapacity;
    return { test, date, capacity: row ? row.capacity ?? null : 30, urgentCapacity: row ? row.urgentCapacity ?? null : 0, version: row?.version ?? 0,
      routineRemaining: known ? row.capacity - row.urgentCapacity - row.held - row.occupied + row.urgentHeld + row.urgentOccupied : !row && policyEnabled ? 30 : null,
      emergencyReviewAvailable: true, classification: row?.classification || "platform_policy", configured: Boolean(known || (!row && policyEnabled)),
      held: known ? row.held : null, occupied: known ? row.occupied : null };
  }), message: "Daily request capacity is not a guarantee that a centre offers a test or can confirm a specific time." });
}));
router.put("/diagnostic/:organizationId/daily", requireAuth, requireRole("provider_admin"), asyncHandler(async (req, res) => {
  res.json({ ok: true, ...await configureDiagnosticCapacity({ organizationId: req.params.organizationId, input: req.body, actor: req.user }) });
}));
router.post("/hospital/:organizationId/configure", requireAuth, requireRole("provider_admin"), asyncHandler(async (req, res) => {
  const { resourceKey, ...input } = req.body || {};
  res.json({ ok: true, ...await configureInventoryReservations({ kind: "hospital", organizationId: req.params.organizationId, resourceKey, input, actor: req.user }) });
}));
router.post("/requests/EmergencyRequest/:requestId/:action", requireAuth, requireRole("provider_admin"), asyncHandler(async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.requestId) || !["admit", "discharge"].includes(req.params.action)
    || Object.keys(req.body || {}).some(key => key !== "expectedStatus") || typeof req.body?.expectedStatus !== "string") throw fail(400, "Invalid admission or discharge action");
  const row = await EmergencyRequest.findById(req.params.requestId);
  if (!row) throw fail(404, "Request not found");
  await assertProviderPermission({ actor: req.user, kind: "hospital", organizationId: row.hospital, permission: "inventory:write" });
  const action = req.params.action;
  if (row.status !== req.body.expectedStatus || !["ACCEPTED", "COMPLETED"].includes(row.status)) throw fail(409, "Refresh the accepted request before updating admission");
  const expected = action === "admit" ? "confirmed" : "admitted";
  const next = action === "admit" ? "admitted" : "discharged";
  if (row.capacityAllocation?.mode === next) return res.json({ ok: true, capacityAllocation: row.capacityAllocation });
  if (row.capacityAllocation?.mode !== expected) throw fail(409, "This bed allocation no longer permits the action");
  const result = await withCapacityTransaction(async session => {
    const updated = await EmergencyRequest.findOneAndUpdate({ _id: row._id, status: row.status, "capacityAllocation.mode": expected }, {
      $set: { capacityAllocation: { mode: next } },
    }, { new: true, session });
    if (!updated) throw fail(409, "Request changed; refresh before retrying");
    await transitionReservations({ session, requestType: "hospital", requestId: row._id, action, actorId: req.user.id });
    return updated.capacityAllocation;
  });
  res.json({ ok: true, capacityAllocation: result });
}));
export default router;
