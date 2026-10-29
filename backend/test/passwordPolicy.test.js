import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { validateNewPassword } from "../src/validation/password.js";
import { createApp } from "../src/app.js";

test("new passwords reject common defaults, compounds and bcrypt truncation", () => {
  for (const value of [null, ["SecurePhrase123!"], { password: "SecurePhrase123!" }, "short", "Password123456!",
    "Admin@Medreach786", "Provider@Medreach786", "Aa12" + "é".repeat(35)]) {
    assert.throws(() => validateNewPassword(value));
  }
  assert.equal(validateNewPassword("Aa12" + "é".repeat(34)), true); // Exactly 72 UTF-8 bytes.
  assert.equal(validateNewPassword("A1" + "a".repeat(70)), true);
  assert.equal(validateNewPassword("Long Distinct Passphrase 73!"), true);
});

test("register, reset and provider activation share the new password policy", async () => {
  for (const path of ["register", "reset-password", "activate-provider"]) {
    const response = await request(createApp()).post(`/api/auth/${path}`).send({ email: "a@example.test", name: "Patient",
      token: "x".repeat(43), password: "Password123456!" });
    assert.equal(response.status, 400);
    assert.ok(response.body.details.some(detail => detail.field === "password" && /predictable/.test(detail.msg)));
    assert.equal(response.headers["set-cookie"], undefined);
  }
});
