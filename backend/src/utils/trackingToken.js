import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export const TRACKING_TOKEN_HEADER = "X-MedReach-Tracking-Token";

export function generateTrackingToken() {
  return randomBytes(32).toString("base64url");
}

// A retry with the same private idempotency key must recover the guest's token.
// Only its hash is stored on the record; the raw token remains reconstructible
// by the server from its secret and the opaque key hash.
export function trackingTokenForIdempotency(keyHash) {
  if (!keyHash) return null;
  return createHmac("sha256", env.jwtSecret)
    .update(`medreach:guest-tracking:v1:${keyHash}`)
    .digest("base64url");
}

export function hashTrackingToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function verifyTrackingToken(token, expectedHash) {
  if (typeof token !== "string" || !token || typeof expectedHash !== "string") return false;
  const actual = Buffer.from(hashTrackingToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
