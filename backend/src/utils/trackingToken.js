import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const TRACKING_TOKEN_HEADER = "X-MedReach-Tracking-Token";

export function generateTrackingToken() {
  return randomBytes(32).toString("base64url");
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
