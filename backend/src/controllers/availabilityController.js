import { Hospital } from "../models/Hospital.js";
import { HospitalFacility } from "../models/HospitalFacility.js";
import { AvailabilityObservation } from "../models/AvailabilityObservation.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { latestByFacility } from "../services/availabilityService.js";

// GET /api/hospitals/:id/facilities — current facility statuses for a hospital.
export const listFacilities = asyncHandler(async (req, res) => {
  const data = await HospitalFacility.find({ hospital: req.params.id }).lean();
  res.json({ data });
});

// GET /api/hospitals/:id/availability — latest observation per facility + history flag.
export const getAvailability = asyncHandler(async (req, res) => {
  const obs = await AvailabilityObservation.find({ hospital: req.params.id })
    .sort({ retrievedAt: -1 }).limit(200).lean();
  res.json({ latest: latestByFacility(obs), observations: obs.length });
});

// POST /api/hospitals/:id/availability — record a NEW observation (append-only).
export const recordObservation = asyncHandler(async (req, res) => {
  const hospital = await Hospital.findById(req.params.id);
  if (!hospital) return res.status(404).json({ error: "Hospital not found" });
  const { facility, status, quantity, source } = req.body;
  const obs = await AvailabilityObservation.create({
    hospital: hospital._id, facility, status, quantity, source,
    observedAt: req.body.observedAt || new Date(), retrievedAt: new Date(),
  });
  res.status(201).json({ observation: obs });
});
