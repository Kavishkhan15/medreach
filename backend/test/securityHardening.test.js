import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { signToken } from "../src/utils/token.js";
const app = createApp();
const user = { _id: "507f1f77bcf86cd799439011", role: "system_admin", email: "admin@example.test", name: "Admin" };

for (const path of ["/api/email/status", "/api/blood-banks/campaigns"]) {
  test(`database outage does not authorize a signed token on ${path}`, async () => {
    const res = await request(app).get(path).set("Authorization", `Bearer ${signToken(user, "session-family")}`);
    assert.equal(res.status, 503);
    assert.equal(res.body.error, "Authentication temporarily unavailable");
  });
  test(`sessionless access token is rejected on ${path}`, async () => {
    assert.equal((await request(app).get(path).set("Authorization", `Bearer ${signToken(user)}`)).status, 401);
  });
}

test("forged forwarded IPs cannot evade login rate limits on direct connections", async () => {
  const localApp = createApp();
  for (let index = 0; index < 10; index++) {
    const response = await request(localApp).post("/api/auth/login").set("X-Forwarded-For", `93.184.216.${index + 1}`)
      .send({ email: "invalid", password: "invalid" });
    assert.equal(response.status, 400);
  }
  assert.equal((await request(localApp).post("/api/auth/login").set("X-Forwarded-For", "93.184.216.11")
    .send({ email: "invalid", password: "invalid" })).status, 429);
});
