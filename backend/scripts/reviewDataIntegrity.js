import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import mongoose from "mongoose";
import { assertLocalAuditTarget, auditBackendData } from "../src/services/dataQualityAudit.js";
import { collectIntegrityReview, buildRepairManifest } from "../src/services/integrityReview.js";

// No .env loading, model imports, index creation, update methods or migration runner.
const uri = process.env.MEDREACH_AUDIT_MONGO_URI || "mongodb://127.0.0.1:27017/medreach";
let client;
try {
  const database = assertLocalAuditTarget(uri);
  if (process.argv.length !== 3) throw new Error("Supply one new output directory");
  const directory = resolve(process.argv[2]);
  // Refuse overwriting any previous report, including a partial run.
  await mkdir(directory, { mode: 0o700 });
  const commandCounts = {};
  client = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 2, readPreference: "primary", monitorCommands: true, appName: "medreach-integrity-review-read-only" });
  client.on("commandStarted", event => { commandCounts[event.commandName] = (commandCounts[event.commandName] || 0) + 1; });
  await client.connect();
  const db = client.db(database);
  const summary = await auditBackendData(db);
  const review = await collectIntegrityReview(db);
  const countsAfter = {};
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) countsAfter[name] = await db.collection(name).countDocuments();
  const allowed = new Set(["listCollections", "aggregate", "find", "getMore", "killCursors", "endSessions", "ping"]);
  const unexpectedCommands = Object.keys(commandCounts).filter(name => !allowed.has(name));
  if (unexpectedCommands.length) throw new Error("Unexpected database command; report withheld");
  const manifest = buildRepairManifest(review);
  const evidence = { readOnly: true, commandCounts, unexpectedCommands, countsBefore: summary.collectionCounts, countsAfter,
    note: "This process issued read commands only. Live application writes and token expiry may occur concurrently. Counts are not a content checksum or snapshot guarantee." };
  const json = value => `${JSON.stringify(value, null, 2)}\n`;
  for (const [file, value] of Object.entries({ "audit-summary.json": summary, "relationship-audit.json": review, "repair-manifest.json": manifest, "read-evidence.json": evidence })) {
    await writeFile(resolve(directory, file), json(value), { flag: "wx", mode: 0o600 });
  }
  const groups = {};
  for (const row of review.findings) { const key = `${row.collection}.${row.field}: ${row.issue}`; groups[key] = (groups[key] || 0) + 1; }
  const changes = [...new Set([...Object.keys(summary.collectionCounts), ...Object.keys(countsAfter)])].filter(name => (summary.collectionCounts[name] || 0) !== (countsAfter[name] || 0));
  const markdown = ["# MedReach data integrity review", "", `Generated: ${review.generatedAt}`, "", "Target: local loopback `medreach`. Hosted Atlas was not accessed.", "", `Declared relationships: ${review.coverage.length} collection types; ${review.coverage.reduce((sum, row) => sum + row.recordsRead, 0)} source records read.`, `Findings: **${review.findingCount}** across **${review.affectedRecords}** records. Executable repairs: **0**.`, "", "| Relationship and issue | Findings |", "| --- | ---: |", ...Object.entries(groups).map(([key, count]) => `| ${key} | ${count} |`), "", "## Review rules", "", "Every finding is unresolved, has no proposed replacement and requires original import or attributable audit evidence. Matching names, demo defaults and stale snapshots cannot justify reassignment. The manifest cannot execute changes.", "", "Approved provider applications are checked; pending/rejected applications may legitimately preallocate an organisation ID. Missing optional guest users and unselected blood-bank providers are permitted. Active memberships for non-provider or inactive accounts require review, not automatic promotion or removal.", "", "## Evidence and limits", "", "`relationship-audit.json` enumerates every finding from the declared scalar checks, without sample truncation. It excludes names, contact details, request contents, passwords, hashes and credentials. `audit-summary.json` retains the existing aggregate audit; its duplicate groups and related-organisation lists are bounded samples, not an exhaustive duplicate review. Nested timeline actors, all legacy fields and clinical correctness are outside these scalar checks.", "", `Collection counts changed during this live read: ${changes.length ? changes.join(", ") : "none observed"}. This is not a snapshot or a proof against concurrent content changes.`, "", "`read-evidence.json` lists commands and before/after counts. No migration, archival, role change, deletion, seed, index creation or notification delivery was performed.", "", "## Next review", "", "Review each finding against original import mappings and attributable audit records. Preserve ambiguous history. Before a future migration, revalidate the exact target, relationship and current-value precondition, verify a backup and obtain approval for the concrete changes. No migration is authorised by this report.", ""].join("\n");
  await writeFile(resolve(directory, "REPORT.md"), markdown, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ output: directory, findings: review.findingCount, affectedRecords: review.affectedRecords, executableRepairs: 0, unexpectedCommands }));
} catch {
  console.error("Integrity review failed or output directory already exists. Verify the explicit local target and use a new report directory. Partial files must not be treated as a completed report. No migration was attempted.");
  process.exitCode = 1;
} finally { await client?.close(); }
