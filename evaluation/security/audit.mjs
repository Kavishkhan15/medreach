// Runs `npm audit --json` and summarizes dependency CVEs (Security axis, Risk
// Score dim 2). All three variants share the same Next/React versions, so a
// framework-attributable delta only appears from bootstrap/tailwind/skeleton's
// own deps. Run: node evaluation/security/audit.mjs
import { execSync } from "node:child_process";

const ROOT = new URL("../../", import.meta.url).pathname;

let raw;
try {
  raw = execSync("npm audit --json", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
} catch (e) {
  // npm exits non-zero when vulnerabilities exist; stdout still holds the JSON.
  raw = e.stdout?.toString() || "{}";
}

const report = JSON.parse(raw);
const vulns = report.vulnerabilities ?? {};
const sev = report.metadata?.vulnerabilities ?? {};

console.log("Dependency vulnerabilities (npm audit)");
console.log("======================================");
console.log(`critical=${sev.critical ?? 0} high=${sev.high ?? 0} moderate=${sev.moderate ?? 0} low=${sev.low ?? 0}\n`);

for (const [name, v] of Object.entries(vulns)) {
  const via = (v.via || []).map((x) => (typeof x === "string" ? x : `${x.title} (${x.severity})`)).join("; ");
  console.log(`• ${name} [${v.severity}] — ${via}`);
}

console.log(
  "\nNote: source-level framework bugs (e.g. CVE-2019-8331 Bootstrap tooltip XSS on <4.3.1) do NOT appear here — npm audit only sees the dependency graph. That gap is itself a Security-axis finding (plan §4)."
);
