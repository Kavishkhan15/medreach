// Scheduler — runs enabled sources with bounded concurrency and a per-host
// minimum interval (politeness / rate-limit respect). Prevents infinite crawling
// via a fixed source list and a max-jobs cap. Deterministic and testable.

import { crawlSource } from "./runner.js";

const hostOf = (url) => { try { return new URL(url).host; } catch { return "invalid"; } };

export async function runSchedule(sources, opts = {}) {
  const { concurrency = 2, minHostIntervalMs = 1000, maxJobs = 100, now = () => Date.now(), deps = {} } = opts;
  const queue = sources.filter((s) => s.enabled !== false).slice(0, maxJobs);
  const lastHostRun = new Map();
  const results = [];

  let idx = 0;
  async function worker() {
    while (idx < queue.length) {
      const source = queue[idx++];
      const host = hostOf(source.url);
      const wait = Math.max(0, (lastHostRun.get(host) ?? 0) + minHostIntervalMs - now());
      if (wait > 0 && opts.sleep) await opts.sleep(wait);
      lastHostRun.set(host, now());
      results.push(await crawlSource(source, deps));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return results;
}
