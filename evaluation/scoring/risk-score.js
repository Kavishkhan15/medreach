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
// This is a runnable STUB with placeholder inputs so the shape is testable.
// TODO(M4): replace `sampleInputs` with parsed ZAP / Snyk / Observatory / PoC data.

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

// --- placeholder demo so `npm run score` produces something ------------------
const sampleInputs = {
  bootstrap: {
    xss: { high: 0, medium: 0, low: 1 },
    dependencies: { cvssSum: 0 },
    supplyChain: { totalDeps: 3 },
    csp: { level: "strictNonce" },
    sri: { coverage: 1 },
    configuration: { observatoryGrade: "A" },
    maintenance: { monthsSinceRelease: 4, eol: false },
    cssAttackSurface: { exploit: "theoretical" },
  },
  skeleton: {
    xss: { high: 0, medium: 0, low: 0 },
    dependencies: { cvssSum: 0 },
    supplyChain: { totalDeps: 0 },
    csp: { level: "strictNonce" },
    sri: { coverage: 1 },
    configuration: { observatoryGrade: "A" },
    maintenance: { monthsSinceRelease: 130, eol: true }, // abandoned ~2014
    cssAttackSurface: { exploit: "demonstrated" },
  },
};

import fs from 'fs';
import path from 'path';

if (import.meta.url === `file://${process.argv[1]}`) {
  // Ensure data/raw exists so the script never crashes when real data is integrated
  fs.mkdirSync(path.join(process.cwd(), 'data', 'raw'), { recursive: true });

  for (const [variant, inputs] of Object.entries(sampleInputs)) {
    const r = riskScore(inputs);
    console.log(`${variant.padEnd(10)} risk=${r.risk}  safety=${r.safety}`);
  }
  console.log("\n(placeholder inputs — replace with real scan data, plan §5)");
}
