import { Router } from "express";
import { param } from "express-validator";
import { BloodRequest } from "../models/BloodRequest.js";
import { AmbulanceBooking } from "../models/AmbulanceBooking.js";
import { DiagnosticRequest } from "../models/DiagnosticRequest.js";
import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { JobApplication } from "../models/JobApplication.js";
import { OrganizationApplication } from "../models/OrganizationApplication.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
const trackingLimiter = (req, res, next) =>
  (req.app.locals.trackingLimiter ?? ((_req, _res, done) => done()))(req, res, next);

// Reference-only lookup exposes a small status summary. Personal/medical fields
// and all mutations continue to use the authorized request endpoints.
router.get("/:type/:reference", trackingLimiter,
  param("type").isIn(["blood", "ambulance", "bed", "career", "diagnostic"]),
  param("reference").trim().toUpperCase().custom((reference, { req }) => {
    const patterns = {
      blood: /^(BR|BDP)-\d{8}-[A-F0-9]{6}$/,
      ambulance: /^AMB-[A-Z0-9-]{8,80}$/,
      diagnostic: /^DX-[A-F0-9]{20}$/,
      bed: /^MR-[A-Z0-9]{6,16}-[A-F0-9]{6}$/,
      career: /^CAR-[JO][A-F0-9]{14}$/,
    };
    return patterns[req.params.type]?.test(reference) ?? false;
  }),
  validate,
  asyncHandler(async (req, res) => {
    const { type, reference } = req.params;
    const model = { blood: BloodRequest, ambulance: AmbulanceBooking, diagnostic: DiagnosticRequest, bed: EmergencyRequest,
      career: reference.startsWith("CAR-J") ? JobApplication : OrganizationApplication }[type];
    const field = type === "bed" ? "requestId" : "reference";
    const stored = await model.findOne({ [field]: reference })
      .select(`${field} status updatedAt -_id`).lean();
    const record = stored && { reference: stored[field], status: stored.status, updatedAt: stored.updatedAt };
    res.set("Cache-Control", "no-store");
    if (!record) return res.status(404).json({ error: "Request not found. Check the request type and reference." });
    res.json({ record });
  }));

export default router;
