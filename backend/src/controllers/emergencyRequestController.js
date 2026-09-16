import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { Hospital } from "../models/Hospital.js";
import { canManageHospital } from "../services/hospitalAccess.js";
import { createEmergencyRequest, changeEmergencyRequest, listVisibleEmergencyRequests } from "../services/emergencyRequestService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const createRequest = asyncHandler(async (req, res) => {
  const result = await createEmergencyRequest(req.body, req.user);
  res.status(result.status || 201).json(result.error ? { error: result.error } : { request: result.request });
});
export const listRequests = asyncHandler(async (req, res) => res.json({ data: await listVisibleEmergencyRequests(req.user) }));
export const getRequest = asyncHandler(async (req, res) => {
  const request = await EmergencyRequest.findById(req.params.id).populate("hospital", "name slug admins").lean();
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (String(request.user) !== req.user.id && !canManageHospital(req.user, request.hospital)) return res.status(403).json({ error: "Access denied" });
  res.json({ request });
});
export const updateRequest = asyncHandler(async (req, res) => {
  const result = await changeEmergencyRequest({ requestId: req.params.id, actor: req.user,
    nextStatus: req.body.status, note: req.body.note, hospitalResponse: req.body.hospitalResponse });
  res.status(result.status || 200).json(result.error ? { error: result.error } : { request: result.request });
});
