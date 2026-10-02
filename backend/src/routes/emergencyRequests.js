import { Router } from "express";
import { body, param } from "express-validator";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { FACILITY_TYPES } from "../config/constants.js";
import { REQUEST_STATES } from "../models/EmergencyRequest.js";
import { createRequest, listRequests, getRequest, updateRequest } from "../controllers/emergencyRequestController.js";
import { captureIdempotencyKey } from "../middleware/idempotency.js";
import { PHONE_PATTERN } from "../validation/healthcare.js";

const router = Router();
const trackingLimiter = (req, res, next) =>
  (req.app.locals.trackingLimiter ?? ((_request, _response, done) => done()))(req, res, next);
const publicSubmissionLimiter = (req, res, next) =>
  (req.app.locals.publicSubmissionLimiter ?? ((_request, _response, done) => done()))(req, res, next);

const requestValidation = () => [
  body("hospitalId").isMongoId(),
  body("emergencyType").trim().isLength({ min: 2, max: 80 }),
  body("requiredFacility").isIn(FACILITY_TYPES),
  body("contactPhone").trim().matches(PHONE_PATTERN).withMessage("Valid contact phone is required"),
  body("contactEmail").optional({ checkFalsy: true }).trim().toLowerCase().isEmail(),
  body("ambulanceRequired").optional().isBoolean().toBoolean(),
  body("ambulancePickupAddress").optional().isLength({ max: 300 }),
  body("patientAgeGroup").optional().isIn(["infant", "child", "adult", "older_adult", "unknown"]),
  body("patientReference").optional().isLength({ max: 80 }),
  body("patientSummary").optional().isLength({ max: 500 }),
  body("locality").optional().isLength({ max: 120 }),
  validate,
];

const useEmergencyMode = (isEmergency) => (req, _res, next) => {
  req.body.isEmergency = isEmergency;
  next();
};

// Listing user requests requires auth
router.get("/", requireAuth, listRequests);

// Explicit creation contracts. Emergency creation remains public; standard
// hospital-bed requests require an authenticated account.
router.post(
  "/emergency",
  optionalAuth,
  publicSubmissionLimiter,
  captureIdempotencyKey("bed-request"),
  ...requestValidation(),
  useEmergencyMode(true),
  createRequest
);

router.post(
  "/standard",
  requireAuth,
  publicSubmissionLimiter,
  captureIdempotencyKey("bed-request"),
  ...requestValidation(),
  useEmergencyMode(false),
  createRequest
);

// Compatibility contract for existing clients. The flow flag is mandatory so
// an omitted boolean can never silently become an emergency request.
router.post(
  "/",
  optionalAuth,
  publicSubmissionLimiter,
  captureIdempotencyKey("bed-request"),
  body("isEmergency")
    .exists({ checkNull: true })
    .withMessage("isEmergency is required; use /emergency or /standard for explicit flows")
    .isBoolean()
    .toBoolean(),
  ...requestValidation(),
  (req, res, next) => {
    const isEmergency = req.body.isEmergency !== false;
    if (!isEmergency && !req.user) {
      return res.status(401).json({ error: "Authentication required for standard hospital bed requests" });
    }
    next();
  },
  createRequest
);

router.get("/:id", trackingLimiter, optionalAuth, param("id").isMongoId(), validate, getRequest);

router.patch(
  "/:id",
  trackingLimiter,
  optionalAuth,
  param("id").isMongoId(),
  body("status").isIn(REQUEST_STATES),
  body("expectedStatus").optional().isIn(REQUEST_STATES),
  body("expectedTimelineLength").optional().isInt({ min: 1 }).toInt(),
  body("note").optional().isString().bail().trim().isLength({ max: 500 }),
  body("hospitalResponse").optional().isString().bail().trim().isLength({ max: 500 }),
  validate,
  updateRequest
);

export default router;
