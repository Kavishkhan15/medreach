import { redactOperationalValue } from "../utils/logRedaction.js";
import { recordRequestMetrics } from "../services/backendMetrics.js";
// Minimal structured request logging. Records method/route/status/duration/reqId
// only — NEVER request bodies, tokens, passwords, or personal data (privacy §25).
export function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    recordRequestMetrics(req, res, durationMs);
    const line = {
      t: new Date().toISOString(),
      reqId: req.id,
      method: req.method,
      route: req.route?.path || "<unmatched>",
      status: res.statusCode,
      durationMs: +durationMs.toFixed(1),
      responseBytes: Number(res.getHeader("content-length")) || null,
      ...(res.locals.performance ? { stages: res.locals.performance } : {}),
    };
    // Single-line JSON; test env stays quiet.
    if (process.env.NODE_ENV !== "test") console.log(JSON.stringify(redactOperationalValue(line)));
  });
  next();
}
