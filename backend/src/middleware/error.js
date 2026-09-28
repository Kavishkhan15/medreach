// Central error handling. Normalizes Mongoose/JWT errors to clean JSON.

export function notFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation failed",
      details: Object.fromEntries(
        Object.entries(err.errors).map(([k, v]) => [k, v.message])
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
  console.error("[medreach] Unhandled error:", { name: err.name, code: err.code, requestId: req.id });
  const status = Number(err.status) >= 400 && Number(err.status) < 500 ? Number(err.status) : 500;
  res.status(status).json({ error: status === 500 ? "Internal server error" : "Request could not be completed" });
}
