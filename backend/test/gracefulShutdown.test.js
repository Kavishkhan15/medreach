import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { drainWorkers, registerGracefulShutdown } from "../src/services/gracefulShutdown.js";
import { createApp } from "../src/app.js";
import request from "supertest";
import { EmergencyRequest } from "../src/models/EmergencyRequest.js";
import { CrawlerSetting } from "../src/models/CrawlerSetting.js";
import { env } from "../src/config/env.js";
import { startEmergencyRequestExpiryWorker, stopEmergencyRequestExpiryWorker } from "../src/services/emergencyRequestExpiry.js";
import { startCrawlerScheduler, tickCrawlerScheduler, stopCrawlerScheduler, schedulerState } from "../src/services/crawlerScheduler.js";

const logger = { log() {}, error() {} };

test("a failed worker stop still waits for every other worker before rejecting", async () => {
  let release;
  const active = new Promise((resolve) => { release = resolve; });
  let settled = false;
  const draining = drainWorkers([async () => { throw new Error("failed worker"); }, () => active]);
  const checked = assert.rejects(draining, AggregateError).then(() => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  release(); await checked;
  assert.equal(settled, true);
});

test("shutdown waits for HTTP and workers before disconnecting, and repeated signals share one shutdown", async () => {
  const steps = [];
  const signals = new EventEmitter();
  let drainHttp, drainWorkers;
  const workers = new Promise((resolve) => { drainWorkers = resolve; });
  const handle = registerGracefulShutdown({ signals, logger,
    server: { close(callback) { steps.push("http"); drainHttp = callback; }, closeIdleConnections() { steps.push("idle"); } },
    onStart: () => steps.push("not-ready"),
    stopWorkers: () => { steps.push("workers"); return workers; },
    disconnect: async () => { steps.push("database"); }, exit: (code) => steps.push(`exit:${code}`) });
  signals.emit("SIGTERM"); signals.emit("SIGINT");
  const first = handle.shutdown("SIGTERM");
  assert.equal(first, handle.shutdown("SIGINT"));
  assert.deepEqual(steps, ["not-ready", "http", "idle"]);
  drainHttp(); await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(steps, ["not-ready", "http", "idle", "workers"]);
  drainWorkers(); await first;
  assert.deepEqual(steps, ["not-ready", "http", "idle", "workers", "database", "exit:0"]);
  handle.removeHandlers();
  assert.equal(signals.listenerCount("SIGTERM"), 0);
});

test("failed worker cleanup still disconnects the database and exits unsuccessfully", async () => {
  const steps = [];
  const handle = registerGracefulShutdown({ signals: new EventEmitter(), logger,
    server: { close(callback) { callback(); } },
    stopWorkers: async () => { throw new Error("worker cleanup failure"); },
    disconnect: async () => { steps.push("database"); }, exit: (code) => steps.push(code) });
  await handle.shutdown("SIGINT");
  assert.deepEqual(steps, ["database", 1]);
  handle.removeHandlers();
});

test("shutdown deadline closes lingering connections and exits once", async () => {
  let release;
  const exited = new Promise((resolve) => { release = resolve; });
  let closed = false;
  const codes = [];
  const keepAlive = setInterval(() => {}, 1000);
  const handle = registerGracefulShutdown({ signals: new EventEmitter(), logger, timeoutMs: 20,
    server: { close() {}, closeAllConnections() { closed = true; } },
    stopWorkers: async () => {}, disconnect: async () => {}, exit: (code) => { codes.push(code); release(); } });
  try {
    void handle.shutdown("SIGTERM");
    await exited;
    assert.equal(closed, true);
    assert.deepEqual(codes, [1]);
  } finally { clearInterval(keepAlive); handle.removeHandlers(); }
});

test("readiness reports shutdown while liveness stays available", async () => {
  const app = createApp();
  app.locals.shuttingDown = true;
  const ready = await request(app).get("/health/ready");
  assert.equal(ready.status, 503);
  assert.equal(ready.body.shuttingDown, true);
  assert.equal((await request(app).get("/health/live")).status, 200);
});

test("expiry worker stop cancels future ticks and waits for the current database operation", async () => {
  const original = { interval: globalThis.setInterval, clear: globalThis.clearInterval, find: EmergencyRequest.find };
  let tick, release;
  let cleared = false;
  const rows = new Promise((resolve) => { release = resolve; });
  globalThis.setInterval = (callback) => { tick = callback; return { unref() {} }; };
  globalThis.clearInterval = () => { cleared = true; };
  EmergencyRequest.find = () => ({ select() { return this; }, limit() { return this; }, lean() { return rows; } });
  try {
    startEmergencyRequestExpiryWorker();
    tick();
    let stopped = false;
    const stopping = stopEmergencyRequestExpiryWorker().then(() => { stopped = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(cleared, true);
    assert.equal(stopped, false);
    release([]); await stopping;
    assert.equal(stopped, true);
  } finally {
    release([]); await stopEmergencyRequestExpiryWorker();
    globalThis.setInterval = original.interval; globalThis.clearInterval = original.clear; EmergencyRequest.find = original.find;
  }
});

test("crawler stop waits for an active tick and prevents any new scheduled work", async () => {
  const original = { enabled: env.schedulerEnabled, find: CrawlerSetting.findOne, update: CrawlerSetting.updateOne };
  let release;
  const pause = new Promise((resolve) => { release = resolve; });
  env.schedulerEnabled = true;
  CrawlerSetting.findOne = () => ({ lean: () => pause });
  CrawlerSetting.updateOne = async () => ({});
  try {
    startCrawlerScheduler();
    const current = tickCrawlerScheduler();
    let stopped = false;
    const stopping = stopCrawlerScheduler().then(() => { stopped = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(stopped, false);
    assert.equal(schedulerState().running, false);
    assert.deepEqual(await tickCrawlerScheduler(), { skipped: "stopping" });
    release({ value: true });
    await current; await stopping;
    assert.equal(stopped, true);
  } finally {
    release({ value: true }); await stopCrawlerScheduler();
    env.schedulerEnabled = original.enabled; CrawlerSetting.findOne = original.find; CrawlerSetting.updateOne = original.update;
  }
});
