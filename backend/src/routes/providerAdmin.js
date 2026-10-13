import { providerReport } from "../services/providerReport.js";
import { captureIdempotencyKey } from "../middleware/idempotency.js";
import { Router } from "express";
import { body, param } from "express-validator";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { PROVIDER_KINDS } from "../models/ProviderMembership.js";
import * as controller from "../controllers/providerAdminController.js";
export const providerAccountRouter = Router();
providerAccountRouter.use(requireAuth, requireRole("system_admin"));
providerAccountRouter.get("/", controller.listAccounts);
providerAccountRouter.post("/", captureIdempotencyKey("provider-account"), body("kind").isIn(PROVIDER_KINDS), body("organizationId").isMongoId(),
  body("loginEmail").optional({ checkFalsy: true }).isEmail(), body("notificationEmail").optional({ checkFalsy: true }).isEmail(),
  body("demo").optional().isBoolean().toBoolean(), validate, controller.createAccount);
providerAccountRouter.post("/:id/actions", param("id").isMongoId(), body("action").isIn(["activate", "deactivate", "invite", "reset"]), validate, controller.accountAction);
providerAccountRouter.post("/:id/assignments", param("id").isMongoId(), body("kind").isIn(PROVIDER_KINDS), body("organizationId").isMongoId(), validate, controller.assignAccount);
providerAccountRouter.patch("/:id/assignments/:membershipId", param("id").isMongoId(), param("membershipId").isMongoId(), body("active").isBoolean().toBoolean(), validate, controller.updateAssignment);
export const providerRouter = Router();
providerRouter.get("/mine", requireAuth, requireRole("provider_admin", "hospital_admin", "system_admin"), controller.myOrganizations);
providerRouter.get("/:kind/:id/report", requireAuth, requireRole("system_admin", "provider_admin"), param("kind").isIn(PROVIDER_KINDS), param("id").isMongoId(), validate, providerReport);
providerRouter.post("/applications", optionalAuth, (req, res, next) => req.app.locals.publicSubmissionLimiter(req, res, next), captureIdempotencyKey("provider-application"),
  body("contactName").if((_value, { req }) => !req.user).trim().isLength({ min: 2, max: 120 }),
  body("city").if((_value, { req }) => !req.user).trim().isLength({ min: 2, max: 100 }),
  body("phone").if((_value, { req }) => !req.user).trim().matches(/^\+?[\d\s().-]{7,40}$/),
  body("kind").isIn(PROVIDER_KINDS), body("name").trim().isLength({ min: 2, max: 180 }),
  body("address").trim().isLength({ min: 3, max: 300 }), body("contactEmail").trim().toLowerCase().isEmail(), body("phone").optional().trim().isLength({ max: 40 }), body("contactName").optional().trim().isLength({ min: 2, max: 120 }), body("city").optional().trim().isLength({ min: 2, max: 100 }),
  body("website").optional({ checkFalsy: true }).isURL({ protocols: ["https", "http"], require_protocol: true }), body("explanation").optional().isLength({ max: 1000 }), validate, controller.submitProvider);
export const providerApprovalRouter = Router();
providerApprovalRouter.use(requireAuth, requireRole("system_admin"));
providerApprovalRouter.get("/organizations", controller.listOrganizations);
providerApprovalRouter.post("/organizations/:kind/:id/approve", param("kind").isIn(PROVIDER_KINDS), param("id").isMongoId(), validate, controller.approveOrganization);
providerApprovalRouter.get("/", controller.providerApplications);
providerApprovalRouter.post("/:id/review", param("id").isMongoId(), body("decision").isIn(["approve", "reject"]), body("demo").optional().isBoolean().toBoolean(), body("loginEmail").optional({ checkFalsy: true }).isEmail(), body("note").optional().trim().isLength({ max: 1000 }), validate, controller.reviewProvider);
