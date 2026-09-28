import test from "node:test";
import assert from "node:assert/strict";
import { profileDestination, safeReturnTo } from "../../packages/core/src/authNavigation.js";

test("safeReturnTo accepts local paths and rejects redirect targets", () => {
  assert.equal(safeReturnTo("/requests/new?flow=standard"), "/requests/new?flow=standard");
  assert.equal(safeReturnTo("https://evil.example/path"), "/");
  assert.equal(safeReturnTo("//evil.example/path"), "/");
  assert.equal(safeReturnTo("/\\evil.example/path"), "/");
  assert.equal(safeReturnTo(null, "/dashboard"), "/dashboard");
});

test("profileDestination preserves returnTo for completed profiles", () => {
  assert.equal(
    profileDestination({ region: "Western Suburbs" }, "/careers?category=nursing"),
    "/careers?category=nursing",
  );
});

test("profileDestination sends missing-region accounts through onboarding", () => {
  assert.equal(
    profileDestination({ region: "" }, "/requests/new?flow=standard"),
    "/profile?onboarding=1&returnTo=%2Frequests%2Fnew%3Fflow%3Dstandard",
  );
  assert.equal(
    profileDestination({}, "https://evil.example"),
    "/profile?onboarding=1&returnTo=%2F",
  );
});
