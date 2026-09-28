import test from "node:test";
import assert from "node:assert/strict";
import {
  generateTrackingToken,
  hashTrackingToken,
  verifyTrackingToken,
} from "../src/utils/trackingToken.js";

test("tracking tokens are opaque, unique, and verified against their hashes", () => {
  const first = generateTrackingToken();
  const second = generateTrackingToken();
  const hash = hashTrackingToken(first);

  assert.ok(first.length >= 32);
  assert.notEqual(first, second);
  assert.notEqual(hash, first);
  assert.equal(hash.length, 64);
  assert.equal(verifyTrackingToken(first, hash), true);
  assert.equal(verifyTrackingToken(second, hash), false);
  assert.equal(verifyTrackingToken(undefined, hash), false);
  assert.equal(verifyTrackingToken(first, "malformed"), false);
});
