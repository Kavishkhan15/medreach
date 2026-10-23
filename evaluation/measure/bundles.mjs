// Measures built CSS + JS bundle sizes per variant (raw + gzip) from .next output.
// Real data for the Responsiveness/Performance axis. Run AFTER building variants:
//   node evaluation/measure/bundles.mjs
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const VARIANTS = ["bootstrap", "tailwind", "skeleton"];
const ROOT = new URL("../../", import.meta.url).pathname;

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

const sum = (files) =>
  files.reduce(
    (acc, f) => {
      const buf = readFileSync(f);
      acc.raw += buf.length;
      acc.gz += gzipSync(buf).length;
      return acc;
    },
    { raw: 0, gz: 0 }
  );

const kb = (n) => (n / 1024).toFixed(1) + " kB";

console.log("Variant     | CSS raw | CSS gzip | JS raw  | JS gzip");
console.log("------------|---------|----------|---------|--------");
for (const v of VARIANTS) {
  const staticDir = join(ROOT, "variants", v, ".next", "static");
  if (!existsSync(staticDir)) {
    console.log(`${v.padEnd(11)} | (not built — run \`npm --workspace @medreach/variant-${v} run build\`)`);
    continue;
  }
  const css = sum(walk(join(staticDir, "css"), ".css"));
  const js = sum(walk(join(staticDir, "chunks"), ".js"));
  console.log(
    `${v.padEnd(11)} | ${kb(css.raw).padStart(7)} | ${kb(css.gz).padStart(8)} | ${kb(js.raw).padStart(7)} | ${kb(js.gz)}`
  );
}
console.log("\nAggregate build artifacts only; variant differences do not isolate the effect of a CSS framework.");
