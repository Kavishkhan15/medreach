import test from "node:test";
import assert from "node:assert/strict";
import { runEmailBatch } from "../src/services/emailBatch.js";

test("email batches overlap independent sends, cap concurrency and await every send", async () => {
  const releases = [];
  let active = 0;
  let peak = 0;
  const completed = [];
  const batch = runEmailBatch(Array.from({ length: 7 }, (_, index) => async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => releases.push(resolve));
    active--;
    completed.push(index);
    return index;
  }));
  assert.equal(active, 3);
  assert.equal(releases.length, 3);
  // Let one task finish: its worker must take the next queued task.
  releases.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(active, 3);
  assert.deepEqual(completed, [0]);
  while (completed.length < 7) {
    releases.splice(0).forEach(resolve => resolve());
    await new Promise(resolve => setImmediate(resolve));
  }
  const results = await batch;
  assert.equal(peak, 3);
  assert.equal(active, 0);
  assert.deepEqual(results, Array.from({ length: 7 }, (_, value) => ({ status: "fulfilled", value })));
});

test("one rejected or synchronously throwing email task does not drop remaining recipients", async (t) => {
  t.mock.method(console, "warn", () => {});
  const failure = Object.assign(new Error("private SMTP details"), { code: "ETIMEDOUT" });
  const attempts = [];
  const results = await runEmailBatch(Array.from({ length: 6 }, (_, index) => () => {
    attempts.push(index);
    if (index === 0) throw failure;
    if (index === 1) return Promise.reject(failure);
    return index;
  }));
  assert.deepEqual(attempts.sort(), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(results.map(result => result.status), ["rejected", "rejected", "fulfilled", "fulfilled", "fulfilled", "fulfilled"]);
  assert.equal(console.warn.mock.callCount(), 2);
  assert.ok(console.warn.mock.calls.every(call => !call.arguments[0].includes(failure.message)));
});

test("an empty email batch completes without starting work", async () => {
  assert.deepEqual(await runEmailBatch([]), []);
});
