// Shared security configuration — the EXPERIMENTAL CONSTANT.
// Every variant (Bootstrap / Tailwind / Skeleton) is served behind exactly this
// config. Because it is identical, app-level security scans are expected to come
// back nearly identical across variants (plan §4) — the framework signal shows up
// in dependencies, supply-chain, maintenance, and CSS-attack-surface instead.
//
// TODO(M1): finalize CSP once each variant's real asset origins are known.
// Keep the policy BYTE-IDENTICAL across variants or the comparison is invalid.

import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "../config/env.js";

// Single source of truth: config/env.js runs dotenv.config() and parses
// CORS_ORIGINS. Re-reading process.env here (with a separate default) caused a
// bug where this module loaded before dotenv ran, silently allowing only
// :3000 and blocking the tailwind (:3001) and skeleton (:3002) variants.
const ALLOWED_ORIGINS = env.corsOrigins;

function csrfOriginGuard(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || !req.headers.cookie) return next();
  const origin = req.get("origin");
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return next();
  return res.status(403).json({ error: "Request origin not allowed" });
}

const limiter = (max, windowMs = 15 * 60 * 1000) => rateLimit({ windowMs, max,
  standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: false,
  message: { error: "Too many requests. Please try again later." } });

export function applySecurity(app) {
  app.use(cookieParser());

  app.use(
    helmet({
      contentSecurityPolicy: {
        // Strict baseline. Prefer nonces over 'unsafe-inline' — record whether
        // each variant forces you to relax this (that relaxation is a finding).
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"], // NOTE: CDN-loaded framework CSS would need adding — log it
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: "no-referrer" },
    })
  );

  app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
  app.use(csrfOriginGuard);

  // Brute-force protection on auth endpoints (attach to /api/auth router).
  app.locals.authLimiter = limiter(20);
  app.locals.loginLimiter = limiter(10);
  app.locals.registerLimiter = limiter(8, 60 * 60 * 1000);
  app.locals.recoveryLimiter = limiter(6, 60 * 60 * 1000);
  app.locals.oauthLimiter = limiter(20);
  app.locals.trackingLimiter = limiter(60);
  app.locals.publicSubmissionLimiter = limiter(20);
}
