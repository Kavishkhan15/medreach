import { requireRecentPrivilegedAuthentication } from "../middleware/privilegedSecurity.js";
import { mfaEnabled } from "../config/mfaPolicy.js";
import { mfaStatus, beginMfaEnrollment, confirmMfaEnrollment, reauthenticate, rotateRecoveryCodes } from "../controllers/privilegedSecurityController.js";
import { activateProvider } from "../controllers/providerActivationController.js";
import { verifyNotificationContact } from "../controllers/notificationContactController.js";
import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { validateNewPassword } from "../validation/password.js";
import { register, login, logout, refresh, me, sessionStatus, revokeOwnSession, forgotPassword,
  resetPassword, requestVerification, verifyEmail, updateProfile, changePassword } from "../controllers/authController.js";

const router = Router();

// Rate limiter attached in security.js (app.locals.authLimiter) — applied here.
const limiter = (req, res, next) => (req.app.locals.authLimiter ?? ((_q, _s, n) => n()))(req, res, next);
const namedLimiter = (name) => (req, res, next) => (req.app.locals[name] ?? limiter)(req, res, next);
const strongPassword = (field = "password") => body(field).custom(validateNewPassword);
const credentialLimiter = namedLimiter("credentialAccountLimiter");
router.use(["/mfa", "/reauthenticate"], (req, res, next) => {
  if (req.method === "GET" || mfaEnabled()) return next();
  return res.status(410).json({ error: "Two-factor authentication is disabled" });
});

router.post(
  "/register",
  namedLimiter("registerLimiter"),
  body("email").isString().bail().isEmail().withMessage("Valid email required"),
  strongPassword(),
  body("name").isString().bail().trim().notEmpty().isLength({ max: 120 }).withMessage("Name required"),
  body("region").optional().isString().bail().trim().notEmpty().isLength({ max: 120 }),
  body("emergencyContact").optional().isString().bail().trim().isLength({ max: 120 }),
  validate,
  register
);

router.post(
  "/login",
  namedLimiter("loginLimiter"),
  body("email").isString().bail().isEmail(),
  body("password").isString().bail().isLength({ min: 1, max: 128 }),
  validate,
  namedLimiter("loginAccountLimiter"),
  login
);

router.get("/mfa", requireAuth, mfaStatus);
router.post("/mfa/enroll", namedLimiter("recoveryLimiter"), requireAuth, credentialLimiter, body("password").isString().bail().isLength({ min: 1, max: 128 }), validate, beginMfaEnrollment);
router.post("/mfa/confirm", namedLimiter("recoveryLimiter"), requireAuth, credentialLimiter, body("password").isString().bail().isLength({ min: 1, max: 128 }), body("code").isString().bail().matches(/^\d{6}$/), validate, confirmMfaEnrollment);
router.post("/mfa/recovery-codes", namedLimiter("recoveryLimiter"), requireAuth, credentialLimiter, body("password").isString().bail().isLength({ min: 1, max: 128 }), validate, rotateRecoveryCodes);
router.post("/reauthenticate", namedLimiter("loginLimiter"), requireAuth, credentialLimiter, body("password").isString().bail().isLength({ min: 1, max: 128 }), validate, reauthenticate);
router.post("/refresh", namedLimiter("authLimiter"), refresh);
router.post("/logout", logout);
router.get("/me", requireAuth, me);
router.get("/sessions", requireAuth, sessionStatus);
router.delete("/sessions/:id", requireAuth, revokeOwnSession);
router.post("/forgot-password", namedLimiter("recoveryLimiter"), body("email").isString().bail().isEmail(), validate, namedLimiter("recoveryAccountLimiter"), forgotPassword);
router.post("/reset-password", namedLimiter("recoveryLimiter"), body("token").isString().bail().isLength({ min: 40, max: 128 }),
  strongPassword(), validate, resetPassword);
router.post("/request-verification", namedLimiter("recoveryLimiter"), requireAuth, requestVerification);
router.post("/verify-email", namedLimiter("recoveryLimiter"), body("token").isString().bail().isLength({ min: 40, max: 128 }), validate, verifyEmail);
router.put("/profile", requireAuth, body("name").optional().isString().bail().trim().notEmpty().isLength({ max: 120 }),
  body("region").optional().isString().bail().trim().notEmpty().isLength({ max: 120 }),
  body("emergencyContact").optional().isString().bail().trim().isLength({ max: 120 }), validate, updateProfile);
router.put("/password", namedLimiter("loginLimiter"), requireAuth, credentialLimiter, requireRecentPrivilegedAuthentication, body("currentPassword").isString().bail().isLength({ min: 1, max: 128 }),
  strongPassword("newPassword"),
  validate, changePassword);

router.post("/activate-provider", namedLimiter("recoveryLimiter"), body("token").isString().bail().isLength({ min: 40, max: 128 }), strongPassword(), validate, activateProvider);
router.post("/verify-notification-email", namedLimiter("recoveryLimiter"), body("token").isString().bail().isLength({ min: 40, max: 128 }), validate, verifyNotificationContact);
export default router;
