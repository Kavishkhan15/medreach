import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import express from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";
import { MongoRateLimitStore } from "../src/services/sharedRateLimitStore.js";

const uri = process.env.MEDREACH_SCALING_TEST_MONGO_URI;
const isolated = (() => {
  try { const u = new URL(uri); return ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) && u.pathname === "/medreach_scaling_test"; }
  catch { return false; }
})();

test("shared rate counters survive app recreation and coordinate replicas", { skip: !isolated }, async () => {
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 2000 });
  try {
    await mongoose.connection.dropDatabase();
    const make = (namespace = "login") => {
      const app = express();
      app.use(rateLimit({ windowMs: 60000, limit: 3, store: new MongoRateLimitStore({ namespace }), validate: false }));
      app.get("/", (_req, res) => res.json({ ok: true }));
      return app;
    };
    const [a,b] = [make(),make()];
    const results = await Promise.all([a,b,a,b,a,b].map(app => request(app).get("/")));
    assert.equal(results.filter(r => r.status === 200).length,3);
    assert.equal(results.filter(r => r.status === 429).length,3);
    await request(make()).get("/").expect(429);
    await request(make("registration")).get("/").expect(200);
    const rows = await mongoose.connection.collection("ratelimitbuckets").find({}).toArray();
    assert.equal(rows.length,2);
    assert.ok(rows.every(row => !row._id.includes("127.0.0.1") && row.expiresAt instanceof Date));
  } finally { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
});

test("rate store reports database failures rather than allowing a request", async () => {
  const store = new MongoRateLimitStore({ namespace:"unavailable", collection: { findOneAndUpdate: async () => { throw new Error("db unavailable"); } } });
  store.init({ windowMs: 60000 });
  await assert.rejects(() => store.increment("client"), /Rate limiting temporarily unavailable/);
});
