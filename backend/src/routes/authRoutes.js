import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { register, login, logout, me } from "../controllers/authController.js";

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

export default router;
