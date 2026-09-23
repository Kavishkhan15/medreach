import { Router } from "express";
import { body, param } from "express-validator";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { FACILITY_TYPES } from "../config/constants.js";
import { REQUEST_STATES } from "../models/EmergencyRequest.js";
import { createRequest, listRequests, getRequest, updateRequest } from "../controllers/emergencyRequestController.js";

const router = Router();

// Listing user requests requires auth
router.get("/", requireAuth, listRequests);

// Emergency Bed Request: No login required (guest allowed)
// Routine Hospital Bed Request (isEmergency === false): Login required
router.post(
  "/",
  optionalAuth,
  body("hospitalId").isMongoId(),
  body("emergencyType").trim().isLength({ min: 2, max: 80 }),
  body("requiredFacility").isIn(FACILITY_TYPES),
  body("contactPhone").trim().isLength({ min: 7, max: 25 }),
  body("contactEmail").optional({ checkFalsy: true }).isEmail().normalizeEmail(),
  body("isEmergency").optional().isBoolean(),
  body("ambulanceRequired").optional().isBoolean(),
  body("ambulancePickupAddress").optional().isLength({ max: 300 }),
  body("patientAgeGroup").optional().isIn(["infant", "child", "adult", "older_adult", "unknown"]),
  body("patientReference").optional().isLength({ max: 80 }),
  body("patientSummary").optional().isLength({ max: 500 }),
  body("locality").optional().isLength({ max: 120 }),
  validate,
  (req, res, next) => {
    const isEmergency = req.body.isEmergency !== false;
    if (!isEmergency && !req.user) {
      return res.status(401).json({ error: "Authentication required for standard hospital bed requests" });
    }
    next();
  },
  createRequest
);

router.get("/:id", optionalAuth, param("id").isMongoId(), validate, getRequest);

router.patch(
  "/:id",
  optionalAuth,
  param("id").isMongoId(),
  body("status").isIn(REQUEST_STATES),
  body("note").optional().isLength({ max: 500 }),
  body("hospitalResponse").optional().isLength({ max: 500 }),
  validate,
  updateRequest
);

export default router;
