// Central environment config. Reads .env once, validates, exports typed-ish object.
import dotenv from "dotenv";
dotenv.config();

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
  mongoUri: process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/medreach",
  // In test/dev we fall back to a dev secret; production MUST set its own.
  jwtSecret:
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === "production"
      ? required("JWT_SECRET")
      : "dev-only-insecure-secret"),
  accessTokenExpires: process.env.ACCESS_TOKEN_EXPIRES ?? process.env.JWT_EXPIRES ?? "15m",
  refreshTokenExpiresDays: Math.max(1, Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 30)),
  oauthStateExpiresMinutes: Math.max(1, Number(process.env.OAUTH_STATE_EXPIRES_MINUTES ?? 10)),
  cookieSameSite: ["lax", "strict", "none"].includes((process.env.COOKIE_SAME_SITE || "").toLowerCase())
    ? process.env.COOKIE_SAME_SITE.toLowerCase()
    : (process.env.NODE_ENV === "production" ? "none" : "lax"),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL ?? "http://localhost:4000/api/auth/google/callback",
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
  emailProvider: (process.env.EMAIL_PROVIDER || (process.env.RESEND_API_KEY ? "resend" : "")).toLowerCase(),
  emailEnabled: process.env.EMAIL_ENABLED === "true",
  resendApiKey: process.env.RESEND_API_KEY || "",
  brevoApiKey: process.env.BREVO_API_KEY || process.env.BRAVO_API_KEY || "",
  smtpHost:
    process.env.SMTP_HOST ||
    (((process.env.EMAIL_PROVIDER || "").toLowerCase() === "resend" || Boolean(process.env.RESEND_API_KEY))
      ? "smtp.resend.com"
      : (["brevo", "bravo"].includes((process.env.EMAIL_PROVIDER || "").toLowerCase()) ||
        Boolean(process.env.BREVO_USER || process.env.BRAVO_USER)
          ? "smtp-relay.brevo.com"
          : "")),
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser:
    process.env.SMTP_USER ||
    (((process.env.EMAIL_PROVIDER || "").toLowerCase() === "resend" || Boolean(process.env.RESEND_API_KEY))
      ? "resend"
      : (process.env.BREVO_USER || process.env.BRAVO_USER || "")),
  smtpPassword:
    process.env.SMTP_PASSWORD ||
    (((process.env.EMAIL_PROVIDER || "").toLowerCase() === "resend" || Boolean(process.env.RESEND_API_KEY))
      ? (process.env.RESEND_API_KEY || "")
      : (process.env.BREVO_PASSWORD ||
        process.env.BREVO_KEY ||
        process.env.BRAVO_KEY ||
        process.env.BREVO_SMTP_KEY ||
        process.env.BRAVO_SMTP_KEY ||
        "")),
  smtpFrom:
    process.env.SMTP_FROM ||
    process.env.RESEND_FROM ||
    process.env.BREVO_FROM ||
    process.env.BRAVO_FROM ||
    "",
  smtpFromName:
    process.env.SMTP_FROM_NAME ||
    process.env.RESEND_FROM_NAME ||
    process.env.BREVO_FROM_NAME ||
    process.env.BRAVO_FROM_NAME ||
    "MedReach",
  smtpConnectionTimeoutMs: Math.max(1000, Number(process.env.SMTP_CONNECTION_TIMEOUT_MS ?? 8000)),
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "http://localhost:3000",
  routingProvider: process.env.ROUTING_PROVIDER ?? "none",
  routingBaseUrl: process.env.ROUTING_BASE_URL ?? "",
  routingApiKey: process.env.ROUTING_API_KEY ?? "",
  schedulerEnabled: process.env.CRAWLER_SCHEDULER_ENABLED === "true",
  schedulerTickMs: Number(process.env.CRAWLER_SCHEDULER_TICK_MS ?? 180000),
  geminiRefinementEnabled: process.env.GEMINI_ENABLED === "true",
  geminiRefinementModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  geminiRefinementApiKey: process.env.GEMINI_API_KEY ?? "",
};
