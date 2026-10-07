import test from "node:test";
import assert from "node:assert/strict";
import { installAuthMocks, signMockToken } from "./helpers/mockAuth.js";
import { requireAuth } from "../src/middleware/auth.js";
import { User } from "../src/models/User.js";
import { AuthToken } from "../src/models/AuthToken.js";

test("authentication starts account and session checks together and still waits for both", async (t) => {
  installAuthMocks(t);
  const user = { _id: "507f1f77bcf86cd799439011", role: "user", authVersion: 0, accountStatus: "active" };
  const token = signMockToken(user);
  let finishAccount;
  let sessionStarted = false;
  let accepted = false;
  t.mock.method(User, "findById", () => ({ select: () => ({ lean: () => new Promise((resolve) => { finishAccount = resolve; }) }) }));
  t.mock.method(AuthToken, "exists", async () => { sessionStarted = true; return { _id: "valid" }; });
  const pending = requireAuth({ headers: {}, cookies: { token } }, {
    status() { throw new Error("Unexpected rejection"); },
  }, () => { accepted = true; });
  assert.equal(sessionStarted, true);
  assert.equal(accepted, false);
  finishAccount(user);
  await pending;
  assert.equal(accepted, true);
});
