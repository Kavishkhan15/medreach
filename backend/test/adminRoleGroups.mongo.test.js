import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { signSessionToken } from "./helpers/session.js";

let uri;
try {
  const target = new URL(process.env.MEDREACH_AUTH_TEST_MONGO_URI);
  if (["127.0.0.1", "localhost"].includes(target.hostname) && target.pathname === "/medreach_auth_test") {
    target.pathname = `/medreach_auth_test_${randomUUID().replaceAll("-", "")}`; uri = target.toString();
  }
} catch { /* Require the explicitly isolated auth-test target. */ }

test("admin role groups paginate accounts without disclosing credential material", { skip: !uri }, async t => {
  await mongoose.connect(uri);
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  const records = [];
  for (const [index, role] of ["user", "provider_admin", "hospital_admin", "system_admin", "admin"].entries()) {
    const user = new User({ name: `Role fixture ${index}`, email: `role-${index}@isolated.example`, role, accountStatus: "active" });
    await user.setPassword("IsolatedFixturePassword123!"); await user.save(); records.push(user);
  }
  const app = createApp(), token = await signSessionToken(records[3]);
  const ordinaryAccounts = await request(app).get("/api/admin/users?role=user").set("Authorization", `Bearer ${token}`);
  assert.equal(ordinaryAccounts.status, 200);
  assert.equal(ordinaryAccounts.body.data.length, 1);
  assert.ok(ordinaryAccounts.body.data.every(user => user.role === "user"));
  for (const [group, roles] of [["user", ["user", "admin", "user_admin"]], ["provider_admin", ["provider_admin", "hospital_admin"]], ["system_admin", ["system_admin"]]]) {
    const response = await request(app).get(`/api/admin/users?roleGroup=${group}`).set("Authorization", `Bearer ${token}`);
    assert.equal(response.status, 200);
    assert.ok(response.body.data.length > 0);
    assert.ok(response.body.data.every(user => roles.includes(user.role)));
    assert.ok(response.body.data.every(user => user.providers.password === true));
    assert.ok(response.body.data.every(user => !Object.hasOwn(user, "passwordHash") && !Object.hasOwn(user, "password")));
    assert.ok(!JSON.stringify(response.body).includes("IsolatedFixturePassword123!"));
  }
  const first = await request(app).get("/api/admin/users?roleGroup=provider_admin&limit=1&page=1").set("Authorization", `Bearer ${token}`);
  const second = await request(app).get("/api/admin/users?roleGroup=provider_admin&limit=1&page=2").set("Authorization", `Bearer ${token}`);
  assert.equal(first.body.pagination.hasMore, true); assert.equal(second.body.pagination.hasMore, false);
  assert.notEqual(first.body.data[0]._id, second.body.data[0]._id);
  assert.equal((await request(app).get("/api/admin/users?roleGroup=forged").set("Authorization", `Bearer ${token}`)).status, 400);
  assert.equal((await request(app).get("/api/admin/users?page=1.5").set("Authorization", `Bearer ${token}`)).status, 400);
  const ordinary = await signSessionToken(records[0]);
  assert.equal((await request(app).get("/api/admin/users?roleGroup=system_admin").set("Authorization", `Bearer ${ordinary}`)).status, 403);
});
