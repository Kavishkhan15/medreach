import { updateProviderRequestStatus } from "../services/providerRequestStatus.js";
import { Router } from "express";
import { body, param } from "express-validator";
import { validate } from "../middleware/validate.js";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth.js";
import {
  listResources,
  getResource,
  createResource,
  updateResource,
  bookAmbulance,
  getAmbulanceBooking,
  listAmbulanceBookings,
} from "../controllers/resourceController.js";
import { captureIdempotencyKey } from "../middleware/idempotency.js";
import { PHONE_PATTERN } from "../validation/healthcare.js";

const trackingLimiter = (req, res, next) =>
  (req.app.locals.trackingLimiter ?? ((_request, _response, done) => done()))(req, res, next);
const publicSubmissionLimiter = (req, res, next) =>
  (req.app.locals.publicSubmissionLimiter ?? ((_request, _response, done) => done()))(req, res, next);

export const resourceRouter = (kind) => {
  const router = Router();
  router.get("/", listResources(kind));
  if (kind === "ambulance") {
    router.post(
      "/book",
      optionalAuth,
      publicSubmissionLimiter,
      captureIdempotencyKey("ambulance-booking"),
      body("providerId").isMongoId().withMessage("Valid ambulance provider is required"),
      body("patientName").trim().notEmpty().withMessage("Patient name is required"),
      body("patientAge").isInt({ min: 1, max: 130 }).withMessage("Patient age must be between 1 and 130"),
      body("isEmergency").optional().isBoolean().toBoolean(),
      body("ambulanceRequired").optional().isBoolean().toBoolean(),
      body("bookingPickup").optional({ checkFalsy: true }).isString().trim().isLength({ min: 2, max: 300 }),
      body("bookingPickup").custom((value, { req }) => !req.body.ambulanceRequired || (typeof value === "string" && value.trim().length >= 2))
        .withMessage("Pickup address is required when ambulance is requested"),
      body("bookingDetails").optional({ checkFalsy: true }).trim().isLength({ max: 1000 }),
      body("contactEmail").optional({ checkFalsy: true }).trim().toLowerCase().isEmail(),
      body("contactPhone").optional({ checkFalsy: true }).trim().matches(PHONE_PATTERN),
      body("contactPhone").custom((_value, { req }) => Boolean(req.body.contactPhone || req.body.contactEmail))
        .withMessage("A contact phone or email is required"),
      validate,
      bookAmbulance
    );
    router.patch("/bookings/:id/status", requireAuth, requireRole("system_admin", "provider_admin"), param("id").isMongoId(), body("status").isIn(["UNDER_REVIEW", "CONFIRMED", "REJECTED", "DISPATCHED", "CANCELLED", "COMPLETED"]), validate, updateProviderRequestStatus("ambulance"));
    router.get("/bookings", requireAuth, listAmbulanceBookings);
    router.get(
      "/bookings/:reference",
      trackingLimiter,
      optionalAuth,
      param("reference").trim().matches(/^AMB-[A-Z0-9-]{8,80}$/),
      validate,
      getAmbulanceBooking,
    );
  }
  router.get("/:id", param("id").isMongoId(), validate, getResource(kind));
  return router;
};
export const resourceAdminRouter = Router();
resourceAdminRouter.post("/", requireAuth, requireRole("system_admin"),
  body("kind").isIn(["blood_bank", "diagnostic", "ambulance"]), body("name").trim().isLength({ min: 2, max: 180 }),
  body("sourceName").trim().notEmpty(),
  body("email").optional({ checkFalsy: true }).trim().toLowerCase().isEmail(),
  validate, createResource);
resourceAdminRouter.patch("/:id", requireAuth, requireRole("system_admin", "provider_admin"),
  param("id").isMongoId(),
  body("email").optional({ checkFalsy: true }).trim().toLowerCase().isEmail(),
  validate, updateResource);
