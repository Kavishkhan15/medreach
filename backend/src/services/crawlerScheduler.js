import { DataSource } from "../models/DataSource.js";
import { CrawlJob } from "../models/CrawlJob.js";
import { CrawlerSetting } from "../models/CrawlerSetting.js";
import { getSource } from "../_crawler/registry/sources.js";
import { env } from "../config/env.js";
import { runOne } from "../controllers/crawlerController.js";
import { randomUUID } from "node:crypto";

let timer = null;
let activeTick = null;
let stopping = false;
let busy = false;
let lastTick = null;
let lastError = null;
const instanceId = randomUUID();

async function acquireLease(now) {
  try {
    const lease = await CrawlerSetting.findOneAndUpdate({ key: "schedulerLease",
      $or: [{ "value.expiresAt": { $lte: now } }, { "value.expiresAt": { $exists: false } }] },
    { $set: { value: { owner: instanceId, expiresAt: new Date(now.getTime() + 30 * 60000) } } },
    { upsert: true, new: true });
    return lease?.value?.owner === instanceId;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

export function schedulerState() {
  return { configured: env.schedulerEnabled, running: Boolean(timer), busy, lastTick, lastError,
    tickMs: env.schedulerTickMs };
}

async function runTick(now) {
  if (busy) return { skipped: "busy" };
  busy = true;
  lastTick = now;
  const attempted = [];
  try {
    const pause = await CrawlerSetting.findOne({ key: "schedulerPaused" }).lean();
    if (pause?.value) return { skipped: "paused" };
    if (!(await acquireLease(now))) return { skipped: "another_worker" };
    const sources = await DataSource.find({ sourceKey: { $exists: true }, enabled: true,
      healthStatus: { $ne: "blocked" } }).lean();
    for (const source of sources) {
      if (stopping) break;
      const registry = getSource(source.sourceKey);
      if (!registry || registry.enabled === false || registry.status === "blocked" || registry.sourceState === "blocked") continue;
      const interval = source.crawlFrequencyMs ?? registry.crawlFrequencyMs;
      if (!Number.isFinite(interval) || interval < 60000) continue;
      const last = await CrawlJob.findOne({ source: source._id }).sort({ createdAt: -1 }).select("createdAt status").lean();
      if (last?.status === "running" || (last && now - last.createdAt < interval)) continue;
      try {
        const result = await runOne(source);
        attempted.push({ sourceKey: source.sourceKey, status: result.job?.status || "failed" });
      } catch (error) {
        attempted.push({ sourceKey: source.sourceKey, status: "failed" });
        lastError = String(error.message).slice(0, 200);
      }
    }
    return { attempted };
  } finally {
    await CrawlerSetting.updateOne({ key: "schedulerLease", "value.owner": instanceId },
      { $set: { "value.expiresAt": new Date() } }).catch(() => {});
    busy = false;
  }
}

export function tickCrawlerScheduler(now = new Date()) {
  if (stopping) return Promise.resolve({ skipped: "stopping" });
  if (activeTick) return Promise.resolve({ skipped: "busy" });
  activeTick = runTick(now).finally(() => { activeTick = null; });
  return activeTick;
}

export function startCrawlerScheduler() {
  if (!env.schedulerEnabled || timer) return schedulerState();
  stopping = false;
  const delay = Math.max(60000, env.schedulerTickMs);
  timer = setInterval(() => tickCrawlerScheduler().catch((error) => {
    lastError = String(error.message).slice(0, 200);
  }), delay);
  timer.unref?.();
  return schedulerState();
}

export function stopCrawlerScheduler() {
  stopping = true;
  if (timer) clearInterval(timer);
  timer = null;
  return activeTick || Promise.resolve();
}
