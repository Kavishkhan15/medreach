import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { register, login, logout, refresh, me, sessionStatus, revokeOwnSession, forgotPassword,
  resetPassword, requestVerification, verifyEmail, updateProfile, changePassword } from "../controllers/authController.js";

const router = Router();

// Rate limiter attached in security.js (app.locals.authLimiter) — applied here.
const limiter = (req, res, next) => (req.app.locals.authLimiter ?? ((_q, _s, n) => n()))(req, res, next);
const namedLimiter = (name) => (req, res, next) => (req.app.locals[name] ?? limiter)(req, res, next);
const strongPassword = () => body("password").isLength({ min: 12, max: 128 })
  .matches(/[a-z]/).matches(/[A-Z]/).matches(/[0-9]/)
  .withMessage("Password must be 12–128 characters with upper, lower, and numeric characters");

router.post(
  "/register",
  namedLimiter("registerLimiter"),
  body("email").isEmail().withMessage("Valid email required"),
  strongPassword(),
  body("name").trim().notEmpty().isLength({ max: 120 }).withMessage("Name required"),
  body("region").optional().trim().notEmpty().isLength({ max: 120 }),
  body("emergencyContact").optional().trim().isLength({ max: 120 }),
  validate,
  register
);

router.post(
  "/login",
  namedLimiter("loginLimiter"),
  body("email").isEmail(),
  body("password").notEmpty(),
  validate,
  login
);

router.post("/refresh", namedLimiter("authLimiter"), refresh);
router.post("/logout", logout);
router.get("/me", requireAuth, me);
router.get("/sessions", requireAuth, sessionStatus);
router.delete("/sessions/:id", requireAuth, revokeOwnSession);
router.post("/forgot-password", namedLimiter("recoveryLimiter"), body("email").isEmail(), validate, forgotPassword);
router.post("/reset-password", namedLimiter("recoveryLimiter"), body("token").isLength({ min: 40, max: 128 }),
  strongPassword(), validate, resetPassword);
router.post("/request-verification", namedLimiter("recoveryLimiter"), requireAuth, requestVerification);
router.post("/verify-email", namedLimiter("recoveryLimiter"), body("token").isLength({ min: 40, max: 128 }), validate, verifyEmail);
router.put("/profile", requireAuth, body("name").optional().trim().notEmpty().isLength({ max: 120 }),
  body("region").optional().trim().notEmpty().isLength({ max: 120 }),
  body("emergencyContact").optional().trim().isLength({ max: 120 }), validate, updateProfile);
router.put("/password", requireAuth, body("currentPassword").notEmpty(),
  body("newPassword").isLength({ min: 12, max: 128 }).matches(/[a-z]/).matches(/[A-Z]/).matches(/[0-9]/),
  validate, changePassword);

export default router;
