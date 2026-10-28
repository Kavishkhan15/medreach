import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { signToken } from "../src/utils/token.js";
import { validateResume } from "../src/validation/healthcare.js";
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

test("missing routes do not reflect a sensitive query token", async () => {
  const res = await request(app).get("/missing?token=private-test-token");
  assert.equal(res.status, 404);
  assert.equal(JSON.stringify(res.body).includes("private-test-token"), false);
});

test("API responses deny framing and restrict unused browser capabilities", async () => {
  const response = await request(app).get("/missing");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["permissions-policy"], "camera=(), microphone=(), geolocation=(self)");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.match(response.headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal(response.headers["x-powered-by"], undefined);
});

for (const url of ["javascript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "data:image/svg+xml;base64,PHN2Zz4=", "file:///etc/passwd", "https://user:secret@example.test/cv.pdf", "data:application/pdf;base64,broken..."]) {
  test(`reject unsafe resume ${url.split(':')[0]} content`, () => {
    assert.equal(validateResume(url), false);
    for (const field of ["fileUrl", "url", "dataUrl", "data"]) assert.equal(validateResume({ [field]: url }), false);
  });
}

test("valid resume links and PDF/Word uploads retain support", () => {
  for (const url of ["https://example.test/cv.pdf", "http://example.test/cv.docx", "data:application/pdf;base64,JVBERi0xLjQK", "data:application/msword;base64,Y3Y=", "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,Y3Y="]) {
    assert.equal(validateResume(url), true);
  }
  assert.equal(validateResume({ fileUrl: { $ne: null } }), false);
  assert.equal(validateResume(["https://example.test/cv.pdf"]), false);
});

for (const path of ["/api/hospitals?city[$ne]=Mumbai", "/api/jobs?category[$regex]=.*", "/api/alerts?region[$ne]=private", "/api/blood-requests?status[$ne]=REQUESTED"]) {
  test(`reject structured query injection ${path.split("?")[0]}`, async () => {
    assert.equal((await request(app).get(path)).status, 400);
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

test("private request responses disable caching even on authorization failures", async () => {
  for (const path of ["/api/auth/me", "/api/blood-requests/BR-20261003-AABBCC", "/api/ambulances/bookings/AMB-20261003-AABBCC"]) {
    const response = await request(app).get(path).set("Authorization", "Bearer invalid");
    assert.equal(response.headers["cache-control"], "no-store");
  }
});

for (const query of ["limit=-1000000", "limit=garbage", "page=-1", "page=1.5", "lat=91&lng=72", "lat=19&lng=181"]) {
  test(`hospital query refuses unsafe pagination/coordinates: ${query}`, async () => {
    assert.equal((await request(app).get(`/api/hospitals?${query}`)).status, 400);
  });
}
