import { Router } from "express";
import { body, param } from "express-validator";
import { PHONE_PATTERN } from "../validation/healthcare.js";
import { validate } from "../middleware/validate.js";
import { requireAuth, optionalAuth, requireRole } from "../middleware/auth.js";
import {
  listCampaigns,
  createCampaign,
  getCampaign,
  updateCampaign,
  updateCampaignStatus,
} from "../controllers/bloodCampaignController.js";

const router = Router();

// Public list & detail (optionalAuth allows admins to view pending via ?status=pending)
router.get("/", optionalAuth, listCampaigns);
router.get("/:id", optionalAuth, param("id").isMongoId(), validate, getCampaign);

// Campaign proposal or creation: open to everyone (guests & users propose pending; admins create active)
const campaignFields = (partial = false) => [
  ...["name", "organizer", "location", "contact", "date"].map((field) => {
    let chain = body(field);
    if (partial) chain = chain.optional();
    chain = chain.isString().bail().trim().notEmpty().bail();
    if (field === "date") return chain.isISO8601();
    if (field === "contact") return chain.matches(PHONE_PATTERN);
    return chain.isLength({ max: field === "location" ? 300 : 200 });
  }),
  body("endDate").optional({ checkFalsy: true }).isISO8601(),
  body("email").optional({ checkFalsy: true }).isString().bail().trim().isEmail(),
  body("description").optional().isString().bail().isLength({ max: 1000 }),
  body("targetDonors").optional({ checkFalsy: true }).isInt({ min: 0, max: 1000000 }),
  body("bloodGroups").optional().custom((value) => {
    const groups = Array.isArray(value) ? value : [value];
    return groups.length > 0 && groups.length <= 10 && groups.every((group) =>
      ["All", "ALL", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].includes(group));
  }),
  body("status").optional().isIn(["pending", "active", "upcoming", "completed", "cancelled", "rejected"]),
  validate,
];
const proposalLimit = (req, res, next) => req.app.locals.publicSubmissionLimiter(req, res, next);
router.post("/", proposalLimit, optionalAuth, ...campaignFields(), createCampaign);
router.post("/propose", proposalLimit, optionalAuth, ...campaignFields(), createCampaign);

// Admin-only status approval/rejection endpoint
router.patch("/:id/status", requireAuth, requireRole("system_admin"), param("id").isMongoId(), validate, updateCampaignStatus);

// Update campaign: authenticated creator or admin
router.patch("/:id", requireAuth, param("id").isMongoId(), ...campaignFields(true), updateCampaign);

export default router;
