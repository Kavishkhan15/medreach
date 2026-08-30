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

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((s) => s.trim());

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

  // Brute-force protection on auth endpoints (attach to /api/auth router).
  app.locals.authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });
}
