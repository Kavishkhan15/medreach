// Seeds DataSource entries for the four approved crawler sources so the admin
// API/dashboard can list and run them. Idempotent (upsert by sourceKey) — safe
// to re-run. Does NOT touch hospitals/users/alerts (see scripts/seed.js).
// Run: npm --workspace @medreach/backend run seed:crawler-sources
import { connectDB, disconnectDB } from "../src/config/db.js";
import { DataSource } from "../src/models/DataSource.js";
import { SOURCES } from "../src/_crawler/registry/sources.js";

async function run() {
  await connectDB();

  let created = 0, updated = 0;
  for (const s of SOURCES) {
    const existed = await DataSource.exists({ sourceKey: s.sourceId });
    await DataSource.findOneAndUpdate(
      { sourceKey: s.sourceId },
      {
        $set: {
          sourceKey: s.sourceId, name: s.name, type: s.sourceType,
          url: s.baseUrl, accessMethod: "http_html", reliability: s.reliability,
          ...(s.status === "blocked" || s.sourceState === "blocked"
            ? { enabled: false, healthStatus: "blocked", lastFailureReason: s.lastFailure?.reason || "registry_blocked" } : {}),
        },
        $setOnInsert: s.status === "blocked" || s.sourceState === "blocked" ? {} : { enabled: s.enabled },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (existed) updated++; else created++;
  }

  console.log(`Crawler sources: ${created} created, ${updated} updated (total ${SOURCES.length}).`);
  const all = await DataSource.find({ sourceKey: { $exists: true } }, "sourceKey name url enabled reliability").lean();
  for (const d of all) console.log(`  ${d.enabled ? "●" : "○"} ${d.sourceKey.padEnd(11)} ${d.name} — ${d.url}`);

  await disconnectDB();
}

run().catch((e) => {
  console.error("[seed:crawler-sources] failed — is MongoDB running?\n", e.message);
  process.exit(1);
});
