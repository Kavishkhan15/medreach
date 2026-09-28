import { createHash } from "node:crypto";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
export const IDEMPOTENCY_REPLAY_ERROR = "This Idempotency-Key was already used. Check the original request status; do not submit again.";

export const captureIdempotencyKey = (scope) => (req, res, next) => {
  const key = req.get("Idempotency-Key");
  if (!key) return next();
  if (!IDEMPOTENCY_KEY.test(key)) {
    return res.status(400).json({ error: "Invalid Idempotency-Key" });
  }
  req.idempotencyKeyHash = createHash("sha256").update(`${scope}:${key}`).digest("hex");
  next();
};
