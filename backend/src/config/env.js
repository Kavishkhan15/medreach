// Central environment config. Reads .env once, validates, exports typed-ish object.
import dotenv from "dotenv";
import { parseTrustProxy } from "./trustProxy.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boundedInteger } from "./runtimeOptions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const required = (key, fallback) => {
  const v = process.env[key] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  mongoUri: process.env.MONGODB_URI ?? process.env.MONGO_URI ??
    (process.env.NODE_ENV === "production" ? required("MONGODB_URI") :
      process.env.NODE_ENV === "test" ? "mongodb://127.0.0.1:27017/medreach_test" : "mongodb://127.0.0.1:27017/medreach"),
  // In test/dev we fall back to a dev secret; production MUST set its own.
  jwtSecret:
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === "production"
      ? required("JWT_SECRET")
      : "dev-only-insecure-secret"),
  accessTokenExpires: process.env.ACCESS_TOKEN_EXPIRES ?? process.env.JWT_EXPIRES ?? "15m",
  refreshTokenExpiresDays: Math.max(1, Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 30)),
  cookieSameSite: ["lax", "strict", "none"].includes((process.env.COOKIE_SAME_SITE || "").toLowerCase())
    ? process.env.COOKIE_SAME_SITE.toLowerCase()
    : (process.env.NODE_ENV === "production" ? "none" : "lax"),
  // Default allows all three variant dev ports so the shared backend serves
  // every framework variant identically out of the box (bootstrap :3000,
  // tailwind :3001, skeleton :3002). Override with CORS_ORIGINS in production.
  corsOrigins: (process.env.CORS_ORIGINS ??
    "http://localhost:3000,http://localhost:3001,http://localhost:3002")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // AI assistant provider — defaults to the zero-config, deterministic rule-based
  // provider so the assistant works with no external service configured at all.
  // Swapping AI_PROVIDER (+ AI_API_KEY/AI_MODEL) never requires touching the UI.
  aiProvider: process.env.AI_PROVIDER ?? "rule_based",
  aiApiKey: process.env.AI_API_KEY ?? "",
  aiModel: process.env.AI_MODEL ?? "",
  emailProvider: (process.env.EMAIL_PROVIDER || "").toLowerCase(),
  emailEnabled: process.env.EMAIL_ENABLED === "true",
  resendApiKey: process.env.RESEND_API_KEY || "",
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET || "",
  emailMaxAttempts: boundedInteger("EMAIL_MAX_ATTEMPTS", process.env.EMAIL_MAX_ATTEMPTS, 3, 1, 10),
  emergencyAckTimeoutMs: boundedInteger("EMERGENCY_ACK_TIMEOUT_MS", process.env.EMERGENCY_ACK_TIMEOUT_MS, 300000, 60000, 3600000),
  emailEnvelopeKey: process.env.EMAIL_ENVELOPE_KEY || "",
  emailEnvelopePreviousKey: process.env.EMAIL_ENVELOPE_PREVIOUS_KEY || "",
  resendFrom: process.env.RESEND_FROM || process.env.EMAIL_FROM || process.env.SMTP_FROM || "",
  smtpHost:
    process.env.SMTP_HOST ||
    (["google", "gmail"].includes((process.env.EMAIL_PROVIDER || "").toLowerCase()) ||
    Boolean(process.env.GOOGLE_SMTP_USER || (process.env.SMTP_USER && process.env.SMTP_USER.includes("@gmail.com")))
      ? "smtp.gmail.com"
      : ""),
  smtpPort: Number(process.env.SMTP_PORT ?? (process.env.SMTP_SECURE === "true" ? 465 : 587)),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER || process.env.GOOGLE_SMTP_USER || process.env.GMAIL_USER || "",
  smtpPassword:
    process.env.SMTP_PASSWORD ||
    process.env.GOOGLE_APP_PASSWORD ||
    process.env.GMAIL_APP_PASSWORD ||
    "",
  smtpFrom:
    process.env.SMTP_FROM ||
    process.env.GOOGLE_SMTP_USER ||
    process.env.GMAIL_USER ||
    process.env.SMTP_USER ||
    "medreachforyou@gmail.com",
  smtpFromName: process.env.SMTP_FROM_NAME || "MedReach",
  smtpConnectionTimeoutMs: Math.max(1000, Number(process.env.SMTP_CONNECTION_TIMEOUT_MS ?? 8000)),
  systemEmail: process.env.SYSTEM_EMAIL || "medreachforyou@gmail.com",
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "http://localhost:3000",
  routingProvider: process.env.ROUTING_PROVIDER ?? "none",
  routingBaseUrl: process.env.ROUTING_BASE_URL ?? "",
  routingApiKey: process.env.ROUTING_API_KEY ?? "",
  geminiRefinementEnabled: process.env.GEMINI_ENABLED === "true",
  geminiRefinementModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  geminiRefinementApiKey: process.env.GEMINI_API_KEY ?? "",
};

if (env.nodeEnv === "production" && (env.jwtSecret.length < 32 ||
    /^(?:dev-only-insecure-secret|change-me.*|changeme.*)$/i.test(env.jwtSecret))) {
  throw new Error("Production JWT_SECRET must be a unique random secret of at least 32 characters");
}
if (env.nodeEnv === "production" && env.emailEnabled && (env.emailEnvelopeKey.length < 32 ||
    /(?:change.?me|example|demo|your.?key)/i.test(env.emailEnvelopeKey) || env.emailEnvelopeKey === env.jwtSecret)) {
  throw new Error("Production EMAIL_ENVELOPE_KEY must be a distinct random secret of at least 32 characters");
}
