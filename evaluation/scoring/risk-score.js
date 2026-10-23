// RWD Security Risk Score — the study's core instrument (plan §5).
//
// Composite risk in [0,1] per variant, from 8 fixed-anchored sub-dimensions.
// Higher = riskier. Safety grade = 100 * (1 - risk).
//
//   Risk(v) = Σ wᵢ · nᵢ(v),   Σ wᵢ = 1,   each nᵢ ∈ [0,1]
//
// IMPORTANT (defensibility): normalize each metric against a FIXED anchor, not
// min-max across the 3 variants (n=3 min-max is not reproducible). Start with
// equal weights, then run a ±25% sensitivity analysis on ranking stability.
//
// A score requires independently collected evidence for all eight dimensions.
// Missing data must not be treated as zero risk.

export const WEIGHTS = {
  xss: 1 / 8,
  dependencies: 1 / 8,
  supplyChain: 1 / 8,
  csp: 1 / 8,
  sri: 1 / 8,
  configuration: 1 / 8,
  maintenance: 1 / 8,
  cssAttackSurface: 1 / 8,
};

const sat = (x, k = 1) => 1 - Math.exp(-k * x); // saturating curve → [0,1)

// Fixed-anchor normalizers. Each returns a risk in [0,1].
export const normalize = {
  xss: ({ high = 0, medium = 0, low = 0 }) =>
    sat(high * 1.0 + medium * 0.4 + low * 0.1, 0.5),
  dependencies: ({ cvssSum = 0 }) => 1 - Math.exp(-cvssSum / 10),
  supplyChain: ({ totalDeps = 0 }) => Math.min(1, totalDeps / 1500),
  csp: ({ level = "none" }) => ({ none: 1, weak: 0.6, moderate: 0.3, strictNonce: 0 }[level] ?? 1),
  sri: ({ coverage = 0 }) => 1 - coverage, // coverage ∈ [0,1]
  configuration: ({ observatoryGrade = "F" }) =>
    ({ "A+": 0, A: 0.1, B: 0.3, C: 0.5, D: 0.7, F: 1 }[observatoryGrade] ?? 1),
  maintenance: ({ monthsSinceRelease = 0, eol = false }) =>
    Math.min(1, monthsSinceRelease / 60) * 0.7 + (eol ? 0.3 : 0),
  cssAttackSurface: ({ exploit = "none" }) =>
    ({ none: 0, theoretical: 0.4, demonstrated: 0.8, trivial: 1 }[exploit] ?? 0),
};

export function riskScore(inputs, weights = WEIGHTS) {
  const nonnegative = v => typeof v === "number" && Number.isFinite(v) && v >= 0;
  const count = v => nonnegative(v) && Number.isInteger(v);
  const valid = {
    xss: v => [v.high,v.medium,v.low].every(count),
    dependencies: v => nonnegative(v.cvssSum),
    supplyChain: v => count(v.totalDeps),
    csp: v => ["none","weak","moderate","strictNonce"].includes(v.level),
    sri: v => nonnegative(v.coverage) && v.coverage <= 1,
    configuration: v => ["A+","A","B","C","D","F"].includes(v.observatoryGrade),
    maintenance: v => nonnegative(v.monthsSinceRelease) && typeof v.eol === "boolean",
    cssAttackSurface: v => ["none","theoretical","demonstrated","trivial"].includes(v.exploit),
  };
  if (Object.keys(weights).length !== 8 || Object.entries(weights).some(([k,v]) => !valid[k] || !nonnegative(v)) || Math.abs(Object.values(weights).reduce((a,b)=>a+b,0)-1)>1e-8) throw new Error("Invalid security weights.");
  if (!inputs || Object.keys(weights).some(dim => !inputs[dim] || typeof inputs[dim] !== "object" || !Object.keys(inputs[dim]).length || !valid[dim](inputs[dim]))) {
    throw new Error("Incomplete security evidence: every weighted dimension needs measured input.");
  }
  let risk = 0;
  const breakdown = {};
  for (const dim of Object.keys(weights)) {
    const n = normalize[dim](inputs[dim] ?? {});
    breakdown[dim] = { normalized: +n.toFixed(3), weight: weights[dim] };
    risk += weights[dim] * n;
  }
  return {
    risk: +risk.toFixed(4),
    safety: +(100 * (1 - risk)).toFixed(1),
    breakdown,
  };
}

// No research grade is produced without evidence for every weighted dimension.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const input = process.argv.find(arg => arg.startsWith("--input="))?.slice(8);
  if (!input) {
    console.log(JSON.stringify({ status: "not-measured", score: null,
      missingEvidence: Object.keys(WEIGHTS),
      reason: "No measured eight-dimension input supplied. Header coverage and dependency audits alone do not establish a safety grade." }, null, 2));
  } else {
    const variants = JSON.parse(readFileSync(input, "utf8"));
    for (const name of ["bootstrap", "tailwind", "skeleton"]) {
      console.log(JSON.stringify({ variant: name, ...riskScore(variants[name]) }));
    }
  }
}
