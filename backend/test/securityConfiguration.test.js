import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseTrustProxy } from "../src/config/trustProxy.js";
import { env } from "../src/config/env.js";
import jwt from "jsonwebtoken";
import { verifyToken } from "../src/utils/token.js";

test("proxy trust accepts explicit IP boundaries and rejects unrestricted or malformed settings", () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy("false"), false);
  assert.equal(parseTrustProxy("1"), 1);
  assert.deepEqual(parseTrustProxy("127.0.0.1,::1,10.0.0.0/8"), ["127.0.0.1", "::1", "10.0.0.0/8"]);
  for (const value of ["true", "*", "10.0.0.0/33", "::1/129", "trusted.example", "1.2.3.4/", "-1"]) assert.throws(() => parseTrustProxy(value));
});

test("production refuses missing, weak and example JWT secrets", () => {
  const url = new URL("../src/config/env.js", import.meta.url).href;
  for (const secret of ["", "short-secret", "dev-only-insecure-secret", "change-me-to-a-long-random-string-that-is-still-an-example"]) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `import(${JSON.stringify(url)})`], {
      env: { ...process.env, NODE_ENV: "production", JWT_SECRET: secret }, encoding: "utf8", timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Production JWT_SECRET/);
  }
});

test("access verification refuses other signing algorithms and wrong issuer/audience", () => {
  const payload = { sub: "507f1f77bcf86cd799439011", typ: "access", sid: "family" };
  for (const options of [
    { algorithm: "HS384", issuer: "medreach-api", audience: "medreach-web" },
    { algorithm: "HS256", issuer: "another-api", audience: "medreach-web" },
    { algorithm: "HS256", issuer: "medreach-api", audience: "another-client" },
  ]) assert.throws(() => verifyToken(jwt.sign(payload, env.jwtSecret, options)));
});
