// Public, read-only hosted fetch sampling. No credentials, database writes or load storm.
import { writeFile } from "node:fs/promises";

const [base, output] = process.argv.slice(2);
let origin;
try {
  const url = new URL(base);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
  origin = url.origin;
} catch { throw new Error("Supply a bare HTTPS origin and a new output JSON path"); }
if (!output) throw new Error("Supply a new output JSON path");
const paths = ["/api/hospitals?limit=12", "/api/diagnostics", "/api/hospitals?pagination=cursor&includeTotal=false&limit=12"];
const results = [];
for (let sample = 0; sample < 7; sample++) {
  for (const path of paths) {
    const start = performance.now();
    const response = await fetch(origin + path, { signal: AbortSignal.timeout(15000), redirect: "error" });
    const body = await response.text();
    results.push({ path, sample, status: response.status, bytes: Buffer.byteLength(body), ms: +(performance.now() - start).toFixed(1) });
  }
}
const summary = paths.map(path => {
  const rows = results.filter(row => row.path === path);
  const times = rows.slice(1).map(row => row.ms).sort((a, b) => a - b);
  // Upper median, matching the original hosted baseline; n=6 warm samples.
  return { path, samples: times.length, medianMs: times[Math.floor(times.length / 2)], maxMs: Math.max(...times),
    coldMs: rows[0].ms, bytes: rows[0].bytes, errors: rows.filter(row => row.status !== 200).length };
});
await writeFile(output, JSON.stringify({ origin, recordedAt: new Date().toISOString(),
  method: "Sequential alternating endpoints; first sample per path excluded from warm statistics. Six warm samples describe this run, not sustained-load p95.", results, summary }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(JSON.stringify(summary));
if (summary.some(row => row.errors)) process.exitCode = 1;
