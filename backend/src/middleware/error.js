import { safeErrorMetadata } from "../utils/logRedaction.js";
// Central error handling. Normalizes Mongoose/JWT errors to clean JSON.

export function notFound(req, res) {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(err, req, res, _next) {
  if (err.name === "VersionError") return res.status(409).json({ error: "This record changed. Refresh before saving.", code: "RECORD_VERSION_CONFLICT" });
  if (/^(?:CAPACITY_|INVALID_CAPACITY_|INVALID_DIAGNOSTIC_CAPACITY|HOLD_EXPIRED|URGENT_CAPACITY_FULL|VERIFIED_CAPACITY_REQUIRED|ACTIVE_RESERVATIONS|INVALID_RESERVATION_|DEMO_CAPACITY_ONLY)/.test(err.code || "") && [400, 403, 404, 409, 503].includes(err.status)) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err.code === "DIAGNOSTIC_REQUEST_REJECTED" && [400, 403, 404, 409].includes(err.status)) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err.status === 503 && err.code !== "RATE_LIMIT_UNAVAILABLE") {
    return res.status(503).json({ error: "Service temporarily unavailable. Please retry." });
  }
  if (err.code === "RATE_LIMIT_UNAVAILABLE") {
    res.set("Retry-After", "1");
    return res.status(503).json({ error: "Request protection temporarily unavailable. Please retry." });
  }
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation failed",
      details: Object.fromEntries(
        Object.keys(err.errors).map((k) => [k, "Invalid value"])
      ),
    });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ error: `Invalid ${err.path}` });
  }
  if (err.code === 11000) {
    if (Object.hasOwn(err.keyValue ?? {}, "idempotencyKeyHash")) {
      return res.status(409).json({
        error: "This Idempotency-Key was already used. Check the original request status; do not submit again.",
        code: "IDEMPOTENCY_KEY_REUSED",
      });
    }
    return res.status(409).json({
      error: "Duplicate value",
      fields: Object.keys(err.keyValue ?? {}),
    });
  }
  console.error("[medreach] Unhandled error:", safeErrorMetadata(err, req.id));
  const status = Number(err.status) >= 400 && Number(err.status) < 500 ? Number(err.status) : 500;
  res.status(status).json({ error: status === 500 ? "Internal server error" : "Request could not be completed" });
}
