import { Router } from "express";
import { body, param } from "express-validator";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { FACILITY_TYPES } from "../config/constants.js";
import { REQUEST_STATES } from "../models/EmergencyRequest.js";
import { createRequest, listRequests, getRequest, updateRequest } from "../controllers/emergencyRequestController.js";
const router = Router();
router.use(requireAuth);
router.get("/", listRequests);
router.post("/", body("hospitalId").isMongoId(), body("emergencyType").trim().isLength({ min: 2, max: 80 }),
  body("requiredFacility").isIn(FACILITY_TYPES), body("contactPhone").trim().isLength({ min: 7, max: 25 }),
  body("patientAgeGroup").optional().isIn(["infant", "child", "adult", "older_adult", "unknown"]),
  body("patientReference").optional().isLength({ max: 80 }), body("patientSummary").optional().isLength({ max: 500 }),
  body("locality").optional().isLength({ max: 120 }), validate, createRequest);
router.get("/:id", param("id").isMongoId(), validate, getRequest);
router.patch("/:id", param("id").isMongoId(), body("status").isIn(REQUEST_STATES),
  body("note").optional().isLength({ max: 500 }), body("hospitalResponse").optional().isLength({ max: 500 }), validate, updateRequest);
export default router;
