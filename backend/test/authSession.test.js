import test from "node:test";
import assert from "node:assert/strict";
import { createAuthSession } from "../../packages/core/src/authSession.js";

test("session bootstrap is shared and login publishes without another request", async () => {
  let calls = 0;
  let resolve;
  const session = createAuthSession({ me: () => {
    calls += 1;
    return new Promise((done) => { resolve = done; });
  } });
  const first = session.refresh();
  assert.equal(session.refresh(), first);
  resolve({ user: null });
  await first;
  const notifications = [];
  const unsubscribe = session.subscribe(() => notifications.push(session.getSnapshot()));
  session.setUser({ id: "signed-in" });
  await session.refresh();
  assert.equal(calls, 1);
  assert.equal(notifications[0].user.id, "signed-in");
  unsubscribe();
});

test("late session reads cannot overwrite login or resurrect logout", async () => {
  const completions = [];
  const session = createAuthSession({ me: () => new Promise((resolve) => completions.push(resolve)) });
  const initial = session.refresh();
  session.setUser({ id: "new-login" });
  completions[0]({ user: null });
  await initial;
  assert.equal(session.getSnapshot().user.id, "new-login");
  const stale = session.refresh(true);
  session.setUser(null);
  completions[1]({ user: { id: "old-login" } });
  await stale;
  assert.deepEqual(session.getSnapshot(), { user: null, ready: true });
});

test("external session invalidation refreshes once and failures settle readiness", async () => {
  let calls = 0;
  const session = createAuthSession({ me: async () => { calls += 1; throw new Error("expired"); } });
  session.setUser({ id: "old" });
  await Promise.all([session.refresh(true), session.refresh(true)]);
  assert.equal(calls, 1);
  assert.deepEqual(session.getSnapshot(), { user: null, ready: true });
});

test("an external logout event supersedes an earlier in-flight session read", async () => {
  const completions = [];
  const session = createAuthSession({ me: () => new Promise((resolve) => completions.push(resolve)) });
  const old = session.refresh();
  session.invalidate();
  const current = session.refresh(true);
  completions[1]({ user: null });
  await current;
  completions[0]({ user: { id: "logged-out" } });
  await old;
  assert.deepEqual(session.getSnapshot(), { user: null, ready: true });
});
