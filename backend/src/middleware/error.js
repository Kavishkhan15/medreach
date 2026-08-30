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
    return res.status(400).json({ error: `Invalid ${err.path}: ${err.value}` });
  }
  if (err.code === 11000) {
    return res.status(409).json({
      error: "Duplicate value",
      fields: Object.keys(err.keyValue ?? {}),
    });
  }
  console.error("[medreach] Unhandled error:", err);
  res.status(err.status ?? 500).json({ error: err.message ?? "Internal server error" });
}
