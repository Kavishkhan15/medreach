import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listFacilities, getAvailability, recordObservation } from "../controllers/availabilityController.js";
import { FACILITY_TYPES, AVAILABILITY_STATUS } from "../config/constants.js";

const router = Router();

// Public reads
router.get("/:id/facilities", listFacilities);
router.get("/:id/availability", getAvailability);

// Admin: append a new observation (append-only time-series)
router.post(
  "/:id/availability",
  requireAuth,
  requireRole("admin", "system_admin", "hospital_admin"),
  body("facility").isIn(FACILITY_TYPES),
  body("status").isIn(AVAILABILITY_STATUS),
  body("quantity").optional().isInt({ min: 0 }),
  body("observedAt").optional().isISO8601(),
  validate,
  recordObservation
);

export default router;
