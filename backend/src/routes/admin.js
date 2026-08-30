import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { overview, verifyHospital, listAudit } from "../controllers/adminController.js";
import { VALID_DECISIONS } from "../services/verificationService.js";

const router = Router();
const admin = [requireAuth, requireRole("admin", "system_admin", "hospital_admin")];
const systemAdmin = [requireAuth, requireRole("admin", "system_admin")];

router.get("/overview", ...admin, overview);
router.post(
  "/hospitals/:id/verify", ...admin,
  body("decision").isIn(VALID_DECISIONS),
  validate,
  verifyHospital
);
// Audit log is more sensitive → system admins only.
router.get("/audit", ...systemAdmin, listAudit);

export default router;
