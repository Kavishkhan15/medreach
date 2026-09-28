import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { Hospital } from "../models/Hospital.js";
import { canManageHospital } from "../services/hospitalAccess.js";
import { createEmergencyRequest, changeEmergencyRequest, listVisibleEmergencyRequests } from "../services/emergencyRequestService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { TRACKING_TOKEN_HEADER, verifyTrackingToken } from "../utils/trackingToken.js";

export const createRequest = asyncHandler(async (req, res) => {
  const result = await createEmergencyRequest({ ...req.body, idempotencyKeyHash: req.idempotencyKeyHash }, req.user);
  res.status(result.status || 201).json(result.error
    ? { error: result.error }
    : { request: result.request, ...(result.trackingToken ? { trackingToken: result.trackingToken } : {}) });
});
export const listRequests = asyncHandler(async (req, res) => res.json({ data: await listVisibleEmergencyRequests(req.user) }));
export const getRequest = asyncHandler(async (req, res) => {
  const request = await EmergencyRequest.findById(req.params.id)
    .select("+trackingTokenHash")
    .populate("hospital", "name slug admins");
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.user) {
    if (!req.user || (String(request.user) !== req.user.id && !canManageHospital(req.user, request.hospital) && !["admin", "system_admin"].includes(req.user.role))) {
      return res.status(403).json({ error: "Access denied" });
    }
  } else if (!canManageHospital(req.user, request.hospital)
    && !verifyTrackingToken(req.get(TRACKING_TOKEN_HEADER), request.trackingTokenHash)) {
    return res.status(403).json({ error: "Access denied" });
  }
  const safeRequest = request.toJSON();
  if (safeRequest.hospital && typeof safeRequest.hospital === "object") {
    delete safeRequest.hospital.admins;
  }
  res.json({ request: safeRequest });
});
export const updateRequest = asyncHandler(async (req, res) => {
  const result = await changeEmergencyRequest({ requestId: req.params.id, actor: req.user,
    trackingToken: req.get(TRACKING_TOKEN_HEADER),
    nextStatus: req.body.status, note: req.body.note, hospitalResponse: req.body.hospitalResponse });
  res.status(result.status || 200).json(result.error ? { error: result.error } : { request: result.request });
});
