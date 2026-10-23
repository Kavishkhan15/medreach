import test from "node:test";
import assert from "node:assert/strict";
import { sendMutationResponse } from "../../backend/src/utils/sendMutationResponse.js";

test("mutation responses wait for cleanup and preserve success/error response contracts", async () => {
  for (const status of [undefined, 200, 201, 400, 403, 404, 409]) {
    let release;
    const cleanup = new Promise(resolve => { release = resolve; });
    const calls = [];
    const res = { status(code) { calls.push(code); return this; }, json(body) { calls.push(body); return this; } };
    const result = { status, body: (status ?? 200) < 400 ? { ok: true } : { error: "Controlled refusal" } };
    const guarded = (async () => { try { return result; } finally { await cleanup; } })();
    const response = sendMutationResponse(res, guarded);
    await Promise.resolve();
    assert.deepEqual(calls, []);
    release();
    assert.equal(await response, res);
    assert.deepEqual(calls, [status ?? 200, result.body]);
  }
});

test("failed mutation cleanup cannot send an already successful response", async () => {
  let sent = false;
  const res = { status() { sent = true; return this; }, json() { sent = true; } };
  const failed = (async () => { try { return { body: { ok: true } }; } finally { throw new Error("Controlled cleanup failure"); } })();
  await assert.rejects(sendMutationResponse(res, failed), /Controlled cleanup failure/);
  assert.equal(sent, false);
});
