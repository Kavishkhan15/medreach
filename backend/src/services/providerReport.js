import { asyncHandler } from "../utils/asyncHandler.js";
import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { BloodRequest } from "../models/BloodRequest.js";
import { AmbulanceBooking } from "../models/AmbulanceBooking.js";
import { OrganizationApplication } from "../models/OrganizationApplication.js";
import { AvailabilityObservation } from "../models/AvailabilityObservation.js";
import { findOrganization } from "./providerAccess.js";
export const providerReport = asyncHandler(async (req, res) => {
  const { kind, id } = req.params;
  const ids = kind === "hospital" ? req.user.hospitalIds : req.user.providerIds;
  if (req.user.role !== "system_admin" && !ids?.includes(id)) return res.status(403).json({ error: "Assigned organisation access required" });
  const org = await findOrganization(kind, id);
  if (!org) return res.status(404).json({ error: "Organisation not found" });
  const Model = kind === "hospital" ? EmergencyRequest : kind === "blood_bank" ? BloodRequest : kind === "ambulance" ? AmbulanceBooking : null;
  const filter = kind === "hospital" ? { hospital: org._id } : { provider: org._id };
  const [requests, applications, observations] = await Promise.all([
    Model ? Model.aggregate([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 } } }]) : [],
    OrganizationApplication.countDocuments(filter),
    kind === "hospital" ? AvailabilityObservation.countDocuments(filter) : null,
  ]);
  res.json({ data: { organizationId: id, kind, requests, applications, observations,
    availability: kind === "hospital" ? "recorded_observations" : "not_reported", generatedAt: new Date().toISOString() } });
});
