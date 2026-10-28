import test from "node:test";
import assert from "node:assert/strict";
import { boundedInteger, connectionOptions } from "../src/config/runtimeOptions.js";

test("connection options remain bounded and production cannot auto-create indexes", () => {
  const defaults = connectionOptions({}, "production");
  assert.equal(defaults.maxPoolSize,10);
  assert.equal(defaults.autoIndex,false);
  assert.equal(defaults.autoCreate,false);
  assert.equal(connectionOptions({ MONGO_MAX_POOL_SIZE:"20",MONGO_MIN_POOL_SIZE:"2" },"development").maxPoolSize,20);
  for (const value of ["0","101","NaN","1.5","-1"]) assert.throws(() => connectionOptions({MONGO_MAX_POOL_SIZE:value},"production"));
  assert.throws(() => connectionOptions({MONGO_MIN_POOL_SIZE:"11",MONGO_MAX_POOL_SIZE:"10"},"production"));
  assert.throws(() => boundedInteger("RETRY","",3,1,10));
});
