// Shared security configuration — the EXPERIMENTAL CONSTANT.
// Every variant (Bootstrap / Tailwind / Skeleton) is served behind exactly this
// config. Because it is identical, app-level security scans are expected to come
// back nearly identical across variants (plan §4) — the framework signal shows up
// in dependencies, supply-chain, maintenance, and CSS-attack-surface instead.
//
// TODO(M1): finalize CSP once each variant's real asset origins are known.
// Keep the policy BYTE-IDENTICAL across variants or the comparison is invalid.

import helmet from "helmet";
import { sharedLimiter } from "./sharedLimiter.js";
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

export function applySecurity(app, { rateLimitStoreFactory } = {}) {
  const limiter = (name, max, windowMs) => sharedLimiter(name, max, windowMs, { storeFactory: rateLimitStoreFactory });
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
      xFrameOptions: { action: "deny" },
      referrerPolicy: { policy: "no-referrer" },
    })
  );
  app.use((_req, res, next) => {
    res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
    next();
  });

  app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
  app.use(csrfOriginGuard);
  // Filters in this API are scalars. Reject parsed Mongo operators and repeated/nested values.
  app.use((req, res, next) => {
    if (Object.entries(req.query).some(([key, value]) => typeof value !== "string" || /[.$[\]]/.test(key))) {
      return res.status(400).json({ error: "Query parameters must be plain values" });
    }
    if (req.headers.authorization || req.cookies?.token || req.get("X-MedReach-Tracking-Token") ||
        req.path.startsWith("/api/auth/") || /^\/api\/(emergency-requests|blood-requests|tracking)(?:\/|$)/.test(req.path) ||
        /^\/api\/ambulances\/(?:book|bookings)(?:\/|$)/.test(req.path)) {
      res.set("Cache-Control", "no-store");
    }
    next();
  });


  // Brute-force protection on auth endpoints (attach to /api/auth router).
  app.locals.authLimiter = limiter("auth", 20);
  app.locals.loginLimiter = limiter("login", 10);
  app.locals.registerLimiter = limiter("register", 8, 60 * 60 * 1000);
  app.locals.recoveryLimiter = limiter("recovery", 6, 60 * 60 * 1000);
  app.locals.trackingLimiter = limiter("tracking", 60);
  // The browser suite runs all three variants through one loopback IP. Keep
  // the production limit while allowing its controlled, isolated E2E fixture.
  app.locals.publicSubmissionLimiter = limiter("public-submission",
    env.nodeEnv === "test" && process.env.MEDREACH_E2E_MONGO_URI ? 100 : 20
  );
}
