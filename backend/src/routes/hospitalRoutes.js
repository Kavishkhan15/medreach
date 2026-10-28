import { Router } from "express";
import { body, query } from "express-validator";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  listHospitals,
  getHospital,
  getEnrichedHospital,
  createHospital,
  updateHospital,
  updateBeds,
  deleteHospital,
} from "../controllers/hospitalController.js";

const router = Router();

// Public
router.get("/",
  query(["page", "limit"]).optional().isInt({ min: 1, max: Number.MAX_SAFE_INTEGER }),
  query("pagination").optional().isIn(["cursor"]),
  query("includeTotal").optional().isIn(["true", "false"]),
  query("cursor").optional().isString().isLength({ min: 1, max: 1500 }),
  query("lat").optional().isFloat({ min: -90, max: 90 }),
  query("lng").optional().isFloat({ min: -180, max: 180 }),
  validate, listHospitals);
router.get("/:idOrSlug/enriched", getEnrichedHospital);
router.get("/:slug", getHospital);

// Admin-only
router.post(
  "/",
  requireAuth,
  requireRole("system_admin"),
  body("name").trim().notEmpty(),
  validate,
  createHospital
);
router.put("/:id", requireAuth, requireRole("system_admin", "provider_admin", "hospital_admin"), updateHospital);
router.patch(
  "/:id/beds",
  requireAuth,
  requireRole("system_admin", "provider_admin", "hospital_admin"),
  body("bedsAvailable").optional().isInt({ min: 0 }),
  body("emergencyStatus").optional().isIn(["available", "limited", "full", "closed"]),
  validate,
  updateBeds
);
router.delete("/:id", requireAuth, requireRole("system_admin"), body("reason").isString().trim().isLength({ min: 3, max: 500 }), validate, deleteHospital);

export default router;
