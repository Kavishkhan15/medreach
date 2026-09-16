import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { overview, verifyHospital, listAudit, listFacilityClaims, listDataConflicts, reviewFacilityClaim, listHospitalFieldClaims, listHospitalFieldConflicts, reviewHospitalFieldClaim } from "../controllers/adminController.js";
import { adminOwnershipClaims, adminReviewOwnershipClaim } from "../controllers/ownershipController.js";
import { VALID_DECISIONS } from "../services/verificationService.js";
import { listUsers, getUser, setUserStatus, setUserRole, revokeUserSessions, triggerUserReset,
  resendUserVerification, adminUnlinkGoogle } from "../controllers/adminUserController.js";

const router = Router();
const admin = [requireAuth, requireRole("admin", "system_admin", "hospital_admin")];
const systemAdmin = [requireAuth, requireRole("system_admin")];
router.get("/users", ...systemAdmin, listUsers);
router.get("/users/:id", ...systemAdmin, getUser);
router.patch("/users/:id/status", ...systemAdmin, body("status").isIn(["active", "suspended"]), validate, setUserStatus);
router.patch("/users/:id/role", ...systemAdmin, body("role").isIn(["user", "hospital_admin", "system_admin"]), validate, setUserRole);
router.post("/users/:id/revoke-sessions", ...systemAdmin, revokeUserSessions);
router.post("/users/:id/trigger-reset", ...systemAdmin, triggerUserReset);
router.post("/users/:id/resend-verification", ...systemAdmin, resendUserVerification);
router.delete("/users/:id/providers/google", ...systemAdmin,
  body("confirm").equals("UNLINK"), validate, adminUnlinkGoogle);
router.get("/ownership-claims", ...systemAdmin, adminOwnershipClaims);
router.post("/ownership-claims/:id/review", ...systemAdmin,
  body("decision").isIn(["approve", "reject"]), body("note").optional().isLength({ max: 500 }), validate,
  adminReviewOwnershipClaim);

router.get("/overview", ...admin, overview);
router.post(
  "/hospitals/:id/verify", ...admin,
  body("decision").isIn(VALID_DECISIONS),
  validate,
  verifyHospital
);
// Audit log is more sensitive → system admins only.
router.get("/audit", ...systemAdmin, listAudit);
router.get("/facility-claims", ...systemAdmin, listFacilityClaims);
router.get("/data-conflicts", ...systemAdmin, listDataConflicts);
router.get("/hospital-field-claims", ...systemAdmin, listHospitalFieldClaims);
router.get("/hospital-field-conflicts", ...systemAdmin, listHospitalFieldConflicts);
router.post(
  "/facility-claims/:id/review", ...systemAdmin,
  body("decision").isIn(["approve", "reject"]),
  body("note").optional().isString().isLength({ max: 500 }),
  validate,
  reviewFacilityClaim
);
router.post("/hospital-field-claims/:id/review", ...systemAdmin,
  body("decision").isIn(["approve", "reject"]),
  body("note").optional().isString().isLength({ max: 500 }),
  validate, reviewHospitalFieldClaim);

export default router;
