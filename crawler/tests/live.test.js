// LIVE integration tests — hit the REAL hospital websites. SKIPPED BY DEFAULT so
// normal CI never depends on external sites being available (spec §33).
//
// Run explicitly:   npm run test:live      (sets MEDREACH_LIVE=1)
//
// These are polite: one source at a time, real robots.txt is honored by
// guardedFetch, and nothing is written to any database (dry-run repo).

import test from "node:test";
import assert from "node:assert/strict";
import { SOURCES, getSource } from "../src/registry/sources.js";
import { crawlHospitalSource } from "../src/orchestrator.js";
import { createMemoryRepo } from "../src/persistence/memoryRepo.js";
import { isAllowedByRobots } from "../src/robots/robotsChecker.js";

const LIVE = process.env.MEDREACH_LIVE === "1";
const opts = { skip: LIVE ? false : "set MEDREACH_LIVE=1 to run live-network tests" };

test("live: robots.txt is reachable and parsed for every approved source", opts, async () => {
  for (const s of SOURCES) {
    const r = await isAllowedByRobots(`${s.baseUrl}/`, {});
    // We only assert that the check completes deterministically with a reason.
    assert.ok(typeof r.allowed === "boolean", `${s.sourceId} robots check returned a decision`);
    assert.ok(r.reason, `${s.sourceId} robots decision has a reason`);
  }
});

for (const s of SOURCES) {
  test(`live: ${s.sourceId} crawl (dry-run, no writes)`, opts, async () => {
    const repo = createMemoryRepo();
    const job = await crawlHospitalSource(getSource(s.sourceId), { repo, dryRun: true });
    // A live site may be down/blocked — that must NOT throw, only report status.
    assert.ok(
      ["success", "partial", "failed", "blocked", "rate_limited", "parsing_error"].includes(job.status),
      `${s.sourceId} produced a valid CrawlJob status (got ${job.status})`
    );
    // Dry-run must never write.
    assert.equal(repo.store.observations.length, 0);
    // If we did get a record, it must obey the capability-vs-availability rule.
    if (job.record) {
      assert.ok(job.record.facilities.every((f) => f.availability === "unknown"));
      assert.ok(job.record.facilities.every((f) => f.quantity == null));
      assert.equal(job.record.provenance.sourceId, s.sourceId);
    }
  });
}
