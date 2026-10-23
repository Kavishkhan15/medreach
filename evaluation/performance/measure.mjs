// Performance axis — measures per-variant build output as objective, machine-readable
// artifact metrics, not runtime responsiveness or a controlled framework effect. Emits JSON to
// evaluation/results/performance.json. Run AFTER building variants:
//   npm run build:variants && node evaluation/performance/measure.mjs
import { readdirSync, statSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const VARIANTS = ["bootstrap", "tailwind", "skeleton"];
const ROOT = new URL("../../", import.meta.url).pathname;
const RESULTS_DIR = join(ROOT, "evaluation", "results");

function walk(dir, ext) {
  if (!existsSync(dir)) return [];
  let out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) out = out.concat(walk(p, ext));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

function sizeOf(files) {
  return files.reduce((acc, f) => {
    const buf = readFileSync(f);
    acc.rawBytes += buf.length;
    acc.gzipBytes += gzipSync(buf).length;
    return acc;
  }, { rawBytes: 0, gzipBytes: 0, fileCount: files.length });
}

const report = {
  axis: "performance",
  generatedAt: new Date().toISOString(),
  note: "Aggregate built artifacts, not per-page downloads, field performance or causal framework attribution. JavaScript and application code may differ by variant.",
  variants: {},
};

for (const v of VARIANTS) {
  const staticDir = join(ROOT, "variants", v, ".next", "static");
  if (!existsSync(staticDir)) {
    report.variants[v] = { built: false };
    continue;
  }
  const css = sizeOf(walk(join(staticDir, "css"), ".css"));
  const js = sizeOf(walk(join(staticDir, "chunks"), ".js"));
  report.variants[v] = {
    built: true,
    css: { rawKB: +(css.rawBytes / 1024).toFixed(1), gzipKB: +(css.gzipBytes / 1024).toFixed(1), files: css.fileCount },
    js: { rawKB: +(js.rawBytes / 1024).toFixed(1), gzipKB: +(js.gzipBytes / 1024).toFixed(1), files: js.fileCount },
    totalGzipKB: +((css.gzipBytes + js.gzipBytes) / 1024).toFixed(1),
  };
}

// Descriptive CSS difference versus the smallest built variant.
const built = Object.entries(report.variants).filter(([, m]) => m.built);
if (built.length) {
  const minCss = Math.min(...built.map(([, m]) => m.css.gzipKB));
  report.cssDeltaGzipKB = Object.fromEntries(built.map(([k, m]) => [k, +(m.css.gzipKB - minCss).toFixed(1)]));
}

mkdirSync(RESULTS_DIR, { recursive: true });
const outPath = join(RESULTS_DIR, "performance.json");
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");

// Human summary to stdout.
console.log("Performance axis (gzip):");
for (const [v, m] of Object.entries(report.variants)) {
  if (!m.built) { console.log(`  ${v.padEnd(10)} (not built)`); continue; }
  console.log(`  ${v.padEnd(10)} CSS ${String(m.css.gzipKB).padStart(6)} kB · JS ${String(m.js.gzipKB).padStart(6)} kB · total ${m.totalGzipKB} kB`);
}
console.log(`\nWrote ${outPath}`);
