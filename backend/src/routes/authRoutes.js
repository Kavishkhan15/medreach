import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { register, login, logout, me, forgotPassword, resetPassword, requestVerification, verifyEmail, updateProfile, changePassword } from "../controllers/authController.js";

const router = Router();

// Rate limiter attached in security.js (app.locals.authLimiter) — applied here.
const limiter = (req, res, next) => (req.app.locals.authLimiter ?? ((_q, _s, n) => n()))(req, res, next);

router.post(
  "/register",
  limiter,
  body("email").isEmail().withMessage("Valid email required"),
  body("password").isLength({ min: 8 }).withMessage("Password must be ≥ 8 chars"),
  body("name").trim().notEmpty().withMessage("Name required"),
  validate,
  register
);

router.post(
  "/login",
  limiter,
  body("email").isEmail(),
  body("password").notEmpty(),
  validate,
  login
);

router.post("/logout", logout);
router.get("/me", requireAuth, me);
router.post("/forgot-password", limiter, body("email").isEmail(), validate, forgotPassword);
router.post("/reset-password", limiter, body("token").isLength({ min: 64, max: 64 }), body("password").isLength({ min: 8 }), validate, resetPassword);
router.post("/request-verification", requireAuth, requestVerification);
router.post("/verify-email", body("token").isLength({ min: 64, max: 64 }), validate, verifyEmail);
router.put("/profile", requireAuth, body("name").optional().trim().notEmpty().isLength({ max: 120 }), validate, updateProfile);
router.put("/password", requireAuth, body("currentPassword").notEmpty(), body("newPassword").isLength({ min: 8 }), validate, changePassword);

export default router;
