import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
test("authentication rejects compound and oversized credentials before account queries", async t => {
  const app = createApp(); let lookups = 0;
  t.mock.method(User, "findOne", () => { lookups++; return { select: async () => null }; });
  for (const body of [
    { email: ["valid@example.test"], password: "StrongPassword123" },
    { email: "valid@example.test", password: ["StrongPassword123"] },
    { email: "valid@example.test", password: { $ne: "" } },
    { email: "valid@example.test", password: "A".repeat(129) },
  ]) {
    assert.equal((await request(app).post("/api/auth/login").send(body)).status, 400);
  }
  assert.equal(lookups, 0);
});
