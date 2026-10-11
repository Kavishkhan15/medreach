import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { listAlerts, createAlert, deactivateAlert } from "../controllers/alertController.js";

const router = Router();

router.get("/", listAlerts); // public

router.post(
  "/",
  requireAuth,
  requireRole("system_admin"),
  body("title").trim().notEmpty(),
  body("body").trim().notEmpty(),
  body("severity").optional().isIn(["info", "warning", "critical"]),
  validate,
  createAlert
);
router.patch("/:id/deactivate", requireAuth, requireRole("system_admin"), deactivateAlert);

export default router;
