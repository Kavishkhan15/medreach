import { Router } from "express";
import { body, param, query } from "express-validator";
import { DiagnosticRequest, DIAGNOSTIC_TESTS, DIAGNOSTIC_STATES } from "../models/DiagnosticRequest.js";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { captureIdempotencyKey } from "../middleware/idempotency.js";
import { PHONE_PATTERN } from "../validation/healthcare.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createDiagnosticRequest, transitionDiagnosticRequest, canReadDiagnostic, privateDiagnosticRequest, validPreferredDate } from "../services/diagnosticRequests.js";

const router = Router();
const limiter = name => (req, res, next) => (req.app.locals[name] || ((_req, _res, done) => done()))(req, res, next);
const reference = param("reference").matches(/^DX-[A-F0-9]{20}$/);
const version = body("expectedVersion").isInt({ min: 0 }).toInt();
const onlyFields = fields => (req, res, next) => {
  if (!req.body || Array.isArray(req.body) || Object.keys(req.body).some(key => !fields.includes(key))) return res.status(400).json({ error: "Unsupported request fields" });
  next();
};
router.post("/", optionalAuth, limiter("publicSubmissionLimiter"), captureIdempotencyKey("diagnostic-request"),
  onlyFields(["providerId", "tests", "patientName", "contactPhone", "contactEmail", "preferredDate", "preferredTime", "notes", "consent"]),
  body("providerId").isMongoId(),
  body("tests").isArray({ min: 1, max: 4 }).bail().custom(value => new Set(value).size === value.length).withMessage("Select between one and four different tests"),
  body("tests.*").isString().isIn(DIAGNOSTIC_TESTS).withMessage("Choose a test from the available request options"),
  body("patientName").isString().bail().trim().isLength({ min: 2, max: 150 }).withMessage("Enter a patient name between 2 and 150 characters"),
  body("contactPhone").isString().bail().trim().matches(PHONE_PATTERN).withMessage("Enter a valid contact number, including country code if needed"),
  body("contactEmail").optional({ checkFalsy: true }).isString().bail().trim().toLowerCase().isEmail().isLength({ max: 150 }).withMessage("Enter a valid email address or leave it blank"),
  body("notes").optional().isString().bail().trim().isLength({ max: 1000 }).withMessage("Keep additional notes within 1,000 characters"),
  body("preferredDate").custom(validPreferredDate).withMessage("Choose a date from tomorrow through the next 180 days"),
  body("preferredTime").isIn(["MORNING", "AFTERNOON", "EVENING"]).withMessage("Select a preferred time"),
  body("consent").custom(value => value === true).withMessage("Consent to share request details with the centre is required"), validate,
  asyncHandler(async (req, res) => {
    const { record, token, replayed } = await createDiagnosticRequest(req);
    res.set("Cache-Control", "no-store").status(replayed ? 200 : 201).json({ ok: true, reference: record.reference,
      request: privateDiagnosticRequest(record), trackingToken: token, replayed,
      message: "Request recorded. Test availability and your appointment must be confirmed by the diagnostic centre." });
  }));
router.get("/", requireAuth,
  query("limit").optional().isInt({ min: 1, max: 100 }), query("before").optional().isMongoId(),
  query("followup").optional().isIn(["true"]), query("providerId").optional().isMongoId(), validate,
  asyncHandler(async (req, res) => {
    const filter = req.user.role === "system_admin" ? {} : req.user.role === "provider_admin"
      ? { provider: { $in: req.user.providerIds || [] }, centreApprovalPending: { $ne: true } } : { user: req.user.id };
    if (req.query.providerId) {
      if (req.user.role !== "system_admin" && !(req.user.role === "provider_admin" && req.user.providerIds?.includes(req.query.providerId))) return res.status(403).json({ error: "Assigned centre access required" });
      filter.provider = req.query.providerId;
    }
    if (req.query.followup) {
      if (req.user.role !== "system_admin") return res.status(403).json({ error: "System Admin access required" });
      filter.notificationRouting = "no_eligible_recipients";
      filter.status = { $in: ["REQUESTED", "UNDER_REVIEW"] };
    }
    if (req.query.before) filter._id = { $lt: req.query.before };
    const limit = Number(req.query.limit || 30);
    const records = await DiagnosticRequest.find(filter).sort({ _id: -1 }).limit(limit + 1);
    const data = records.slice(0, limit).map(privateDiagnosticRequest);
    res.set("Cache-Control", "no-store").json({ data, nextCursor: records.length > limit ? String(records[limit - 1]._id) : null });
  }));
router.patch("/:id/status", requireAuth, requireRole("system_admin", "provider_admin"),
  onlyFields(["expectedVersion", "status", "acceptedTests", "appointmentAt", "providerResponse"]),
  param("id").isMongoId(), version, body("status").isIn(DIAGNOSTIC_STATES.filter(state => state !== "REQUESTED")),
  body("acceptedTests").optional().isArray({ min: 1, max: 4 }), body("acceptedTests.*").isIn(DIAGNOSTIC_TESTS),
  body("appointmentAt").optional().isISO8601({ strict: true }),
  body("providerResponse").optional().isString().bail().trim().isLength({ max: 500 }), validate,
  asyncHandler(async (req, res) => res.json({ ok: true, data: privateDiagnosticRequest(await transitionDiagnosticRequest(req)) })));
router.patch("/:reference/cancel", optionalAuth, limiter("publicSubmissionLimiter"), onlyFields(["expectedVersion"]), reference, version, validate,
  asyncHandler(async (req, res) => res.json({ ok: true, data: privateDiagnosticRequest(await transitionDiagnosticRequest(req, { cancel: true })) })));
router.get("/:reference", limiter("trackingLimiter"), optionalAuth, reference, validate,
  asyncHandler(async (req, res) => {
    const record = await DiagnosticRequest.findOne({ reference: req.params.reference }).select("+trackingTokenHash");
    if (!record) return res.status(404).json({ error: "Diagnostic request not found" });
    if (!canReadDiagnostic(req, record)) return res.status(403).json({ error: "Use your private tracking link or sign in to view this request" });
    res.set("Cache-Control", "no-store").json({ request: privateDiagnosticRequest(record) });
  }));
export default router;
