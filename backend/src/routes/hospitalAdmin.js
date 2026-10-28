import { requireRecentPrivilegedAuthentication } from "../middleware/privilegedSecurity.js";
import { Router } from "express";
import { body, param } from "express-validator";
import { FACILITY_TYPES } from "../config/constants.js";
import { listStaffFacilityClaims, submitStaffFacilityClaim } from "../controllers/hospitalFacilityClaimController.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { myHospitals, myOwnershipClaims, submitOwnershipClaim } from "../controllers/ownershipController.js";

const router = Router();
router.get("/hospitals", requireAuth, myHospitals);
router.get("/hospitals/:id/facility-claims", requireAuth, param("id").isMongoId(), validate, listStaffFacilityClaims);
router.post("/hospitals/:id/facility-claims", requireAuth, requireRecentPrivilegedAuthentication, param("id").isMongoId(),
  body("facility").isIn(FACILITY_TYPES), body("capability").isIn(["yes", "no", "unknown"]),
  body("evidenceText").isString().trim().isLength({ min: 8, max: 200 }), validate, submitStaffFacilityClaim);
router.get("/ownership-claims", requireAuth, myOwnershipClaims);
router.post("/ownership-claims", requireAuth,
  body("hospitalId").isMongoId(), body("hospitalEmail").isEmail(),
  body("officialDomain").optional().isLength({ max: 120 }),
  body("documentReference").optional().isLength({ max: 200 }),
  body("explanation").optional().isLength({ max: 500 }), validate, submitOwnershipClaim);
export default router;
