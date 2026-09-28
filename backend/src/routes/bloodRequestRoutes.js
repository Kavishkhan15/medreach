import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import {
  createBloodRequest,
  listBloodRequests,
  getBloodRequest,
} from "../controllers/bloodRequestController.js";
import { captureIdempotencyKey } from "../middleware/idempotency.js";
import { PHONE_PATTERN } from "../validation/healthcare.js";

const router = Router();
const trackingLimiter = (req, res, next) =>
  (req.app.locals.trackingLimiter ?? ((_request, _response, done) => done()))(req, res, next);
const publicSubmissionLimiter = (req, res, next) =>
  (req.app.locals.publicSubmissionLimiter ?? ((_request, _response, done) => done()))(req, res, next);

export const URGENT_BLOOD_URGENCY = [
  "within 6 hours",
  "12 hours",
  "18 hours",
  "24 hours",
  "up to 2 days",
];
export const STANDARD_BLOOD_URGENCY = ["3 days", "1 week"];

const useUrgentMode = (isUrgent) => (req, _res, next) => {
  req.body.isUrgent = isUrgent;
  next();
};

const requestValidation = () => [
  body("type")
    .isIn(["REQUEST", "DONATION"])
    .withMessage("Type must be either 'REQUEST' or 'DONATION'"),
  body("bloodBankName")
    .custom((val, { req }) => {
      if (req.body.isUrgent) return true;
      if (!val || !val.trim()) throw new Error("Blood bank name is required");
      return true;
    }),
  body("bloodGroup")
    .isIn(["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"])
    .withMessage("Valid blood group is required"),
  body("patientOrDonorName").trim().notEmpty().withMessage("Name is required"),
  body("contactPhone").trim().matches(PHONE_PATTERN).withMessage("Valid contact phone is required"),
  body("contactEmail").optional({ checkFalsy: true }).trim().toLowerCase().isEmail(),
  body("providerId").optional({ checkFalsy: true }).isMongoId(),
  body("units").if(body("type").equals("REQUEST")).optional().isInt({ min: 1, max: 50 }).toInt(),
  body("age").if(body("type").equals("DONATION")).optional().isInt({ min: 18, max: 65 }).toInt(),
  body("weight").if(body("type").equals("DONATION")).optional().isFloat({ min: 45, max: 200 }).toFloat(),
  body("preferredDate").if(body("type").equals("DONATION")).optional().isISO8601().toDate(),
  validate,
];

const urgencyValidation = (allowed) =>
  body("urgency")
    .if(body("type").equals("REQUEST"))
    .isIn(allowed)
    .withMessage(`Urgency must be one of: ${allowed.join(", ")}`);

router.post(
  "/urgent",
  optionalAuth,
  publicSubmissionLimiter,
  captureIdempotencyKey("blood-request"),
  useUrgentMode(true),
  body("type").equals("REQUEST").withMessage("Urgent blood flow only accepts blood requests"),
  urgencyValidation(URGENT_BLOOD_URGENCY),
  ...requestValidation(),
  createBloodRequest
);

router.post(
  "/standard",
  optionalAuth,
  publicSubmissionLimiter,
  captureIdempotencyKey("blood-request"),
  useUrgentMode(false),
  urgencyValidation(STANDARD_BLOOD_URGENCY),
  ...requestValidation(),
  createBloodRequest
);

// Compatibility contract. Existing clients must explicitly select urgent or
// normal handling; omitted flags are rejected instead of defaulting silently.
router.post(
  "/",
  optionalAuth,
  publicSubmissionLimiter,
  captureIdempotencyKey("blood-request"),
  body("isUrgent")
    .exists({ checkNull: true })
    .withMessage("isUrgent is required; use /urgent or /standard for explicit flows")
    .isBoolean()
    .toBoolean(),
  body("isUrgent").custom((value, { req }) => {
    if (req.body.type === "DONATION" && value) {
      throw new Error("Donation pledges cannot use the urgent blood request flow");
    }
    return true;
  }),
  body("urgency").custom((value, { req }) => {
    if (req.body.type !== "REQUEST") return true;
    const allowed = req.body.isUrgent ? URGENT_BLOOD_URGENCY : STANDARD_BLOOD_URGENCY;
    if (!allowed.includes(value)) throw new Error(`Urgency must be one of: ${allowed.join(", ")}`);
    return true;
  }),
  ...requestValidation(),
  createBloodRequest
);

// Listing requires authentication (admins see all; users see own)
router.get("/", requireAuth, listBloodRequests);

// Get by reference or ID
router.get("/:reference", trackingLimiter, optionalAuth, getBloodRequest);

export default router;
