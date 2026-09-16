import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listHospitals,
  getHospital,
  createHospital,
  updateHospital,
  updateBeds,
  deleteHospital,
} from "../controllers/hospitalController.js";

const router = Router();

// Public
router.get("/", listHospitals);
router.get("/:slug", getHospital);

// Admin-only
router.post(
  "/",
  requireAuth,
  requireRole("admin", "system_admin"),
  body("name").trim().notEmpty(),
  validate,
  createHospital
);
router.put("/:id", requireAuth, requireRole("admin", "system_admin", "hospital_admin"), updateHospital);
router.patch(
  "/:id/beds",
  requireAuth,
  requireRole("admin", "system_admin", "hospital_admin"),
  body("bedsAvailable").optional().isInt({ min: 0 }),
  body("emergencyStatus").optional().isIn(["available", "limited", "full", "closed"]),
  validate,
  updateBeds
);
router.delete("/:id", requireAuth, requireRole("admin", "system_admin"), deleteHospital);

export default router;
