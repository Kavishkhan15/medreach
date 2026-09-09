#!/usr/bin/env node
// MedReach crawler CLI (spec §22/§23/§40).
//
//   npm run crawl -- --source lilavati
//   npm run crawl -- --all
//   npm run crawl -- --all --dry-run
//   npm run crawl -- --list
//
// Dry-run fetches/parses/normalizes/validates and prints what WOULD change,
// without writing to MongoDB. Default (no --source/--all) prints usage.

import { SOURCES, getSource, enabledSources } from "./registry/sources.js";
import { crawlHospitalSource, CRAWL_STATUS } from "./orchestrator.js";
import { createMemoryRepo } from "./persistence/memoryRepo.js";
import { log } from "./logger.js";

function parseArgs(argv) {
  const args = { sources: [], all: false, dryRun: false, list: false, verbose: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") args.all = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--list") args.list = true;
    else if (a === "--verbose" || a === "-v") args.verbose = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--source") { const v = argv[++i]; if (v) args.sources.push(v); }
    else if (a.startsWith("--source=")) args.sources.push(a.split("=")[1]);
  }
  return args;
}

const BAR = "────────────────────────────────────";

function usage() {
  log.plain(`
MEDREACH CRAWLER
${BAR}
Usage:
  npm run crawl -- --source <id>      crawl one approved source
  npm run crawl -- --all              crawl all enabled sources
  npm run crawl -- --all --dry-run    show changes without writing
  npm run crawl -- --list             list approved sources
Options:
  --dry-run    fetch/parse/validate only; no database writes
  --verbose    per-page structured logging
Approved sources: ${SOURCES.map((s) => s.sourceId).join(", ")}
`);
}

function listSources() {
  log.plain(`\nMEDREACH CRAWLER — approved sources\n${BAR}`);
  for (const s of SOURCES) {
    log.plain(`${s.enabled ? "●" : "○"} ${s.sourceId.padEnd(11)} ${s.name}`);
    log.plain(`  ${s.baseUrl}`);
    log.plain(`  state=${s.sourceState} priority=${s.priority} reliability=${s.reliability} every=${Math.round(s.crawlFrequencyMs / 3600000)}h`);
  }
  log.plain("");
}

function printJob(job, source) {
  const ok = job.status === CRAWL_STATUS.SUCCESS;
  const partial = job.status === CRAWL_STATUS.PARTIAL;
  const mark = ok ? "✓" : partial ? "!" : "✗";
  log.plain(`${mark} ${source.name}`);
  if (ok || partial) {
    log.plain(`  Pages: ${job.pagesVisited}`);
    log.plain(`  Records: ${job.recordsFound}`);
    log.plain(`  Changed: ${job.changedFields.length}`);
    log.plain(`  Confidence: ${job.confidence}`);
    if (job.classification) log.plain(`  Change: ${job.classification}`);
    if (job.anomaly) log.plain(`  ⚠ PARSING ANOMALY — previous data kept, manual review required`);
    if (job.dryRun && job.changedFields.length) {
      log.plain(`  Would change: ${job.changedFields.slice(0, 8).join(", ")}${job.changedFields.length > 8 ? "…" : ""}`);
    }
  } else {
    log.plain(`  Reason: ${job.errorMessages[0] || job.status}`);
    log.plain(`  Source state: ${job.sourceState}`);
  }
}

function overall(jobs) {
  if (jobs.length === 0) return "FAILED";
  const good = jobs.filter((j) => j.status === CRAWL_STATUS.SUCCESS).length;
  if (good === jobs.length) return "SUCCESS";
  if (good === 0) return "FAILED";
  return "PARTIAL";
}

export async function main(argv = process.argv.slice(2), opts = {}) {
  const args = parseArgs(argv);
  if (args.help) { usage(); return 0; }
  if (args.list) { listSources(); return 0; }

  let targets = [];
  if (args.all) targets = enabledSources();
  else if (args.sources.length) {
    for (const id of args.sources) {
      const s = getSource(id);
      if (!s) { log.error(`Unknown source: ${id}. Approved: ${SOURCES.map((x) => x.sourceId).join(", ")}`); return 2; }
      targets.push(s);
    }
  } else { usage(); return 1; }

  log.plain(`\nMEDREACH CRAWLER${args.dryRun ? "  (DRY RUN — no database changes)" : ""}\n${BAR}\n`);
  log.plain(`Sources enabled: ${targets.length}\n`);

  // Shared repo so multi-source runs share change-detection state in one process.
  const repo = opts.repo || createMemoryRepo();
  const jobs = [];
  for (const source of targets) {
    // Resilience: one source failing must not stop the others (spec §39).
    let job;
    try {
      job = await crawlHospitalSource(source, { deps: opts.deps || {}, repo, dryRun: args.dryRun, verbose: args.verbose });
    } catch (e) {
      job = { sourceId: source.sourceId, status: CRAWL_STATUS.FAILED, pagesVisited: 0, recordsFound: 0,
        changedFields: [], errorMessages: [`unexpected:${e.message}`], sourceState: "temporarily_unavailable", confidence: "UNKNOWN" };
    }
    jobs.push(job);
    printJob(job, source);
    log.plain("");
  }

  const status = overall(jobs);
  log.plain(`${BAR}`);
  log.plain(`Completed with ${status} status`);
  if (args.dryRun) log.plain("No database changes made.");
  log.plain("");

  return status === "FAILED" ? 1 : 0;
}

// Only run when invoked directly (keeps the module importable by tests).
const invokedDirectly = process.argv[1] && process.argv[1].endsWith("cli.js");
if (invokedDirectly) {
  main().then((code) => process.exit(code)).catch((e) => { log.error(e.message); process.exit(1); });
}
