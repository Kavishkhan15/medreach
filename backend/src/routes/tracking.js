import { Router } from "express";
import { param } from "express-validator";
import { BloodRequest } from "../models/BloodRequest.js";
import { AmbulanceBooking } from "../models/AmbulanceBooking.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
const trackingLimiter = (req, res, next) =>
  (req.app.locals.trackingLimiter ?? ((_req, _res, done) => done()))(req, res, next);

// Reference-only lookup exposes a small status summary. Personal/medical fields
// and all mutations continue to use the authorized request endpoints.
router.get("/:type/:reference", trackingLimiter,
  param("type").isIn(["blood", "ambulance"]),
  param("reference").trim().toUpperCase().custom((reference, { req }) =>
    req.params.type === "blood"
      ? /^(BR|BDP)-\d{8}-[A-F0-9]{6}$/.test(reference)
      : /^AMB-[A-Z0-9-]{8,80}$/.test(reference)),
  validate,
  asyncHandler(async (req, res) => {
    const model = req.params.type === "blood" ? BloodRequest : AmbulanceBooking;
    const record = await model.findOne({ reference: req.params.reference })
      .select("reference status updatedAt -_id").lean();
    res.set("Cache-Control", "no-store");
    if (!record) return res.status(404).json({ error: "Request not found. Check the request type and reference." });
    res.json({ record });
  }));

export default router;
