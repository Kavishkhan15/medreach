/**
 * EXP-PROV: MedReach Provenance and Conflicting-Claim Fusion Experiment Runner
 *
 * Exercises the REAL fusion functions from backend/src/services/facilityClaimFusion.js
 * and backend/src/services/hospitalFieldFusion.js against a synthetic multi-source
 * testbed with known ground truth.
 *
 * Experiment parameters swept:
 * 1. Source Count (K = 2, 3, 4, 5, 6, 8)
 * 2. Inherent Disagreement / Reporting Error Rate (eta in [0.05, 0.50])
 * 3. Source Reliability Mixes (Official/Gov, Crowd/Scrapers, Mixed, Asymmetric Verified Anchor)
 * 4. Temporal Staleness and Recency Bias (Fresh, Stale, Outdated, Pre-vs-Post Status Shift)
 * 5. Source Dropout / Missingness (p_drop in [0.0, 0.6]) and Asynchronous Ingestion Delay
 * 6. Confidence Calibration Evaluation (Brier Score, ECE, Empirical vs Nominal Reliability)
 * 7. Field-level fusion on structured hospital attributes (Phone, Website, Specialties)
 *
 * All data generated is SYNTHETIC and explicitly labelled SYNTHETIC.
 * Deterministic PRNG with fixed seed ensures 100% exact reproducibility.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fuseFacilityClaims } from "../../../backend/src/services/facilityClaimFusion.js";
import { resolveHospitalField } from "../../../backend/src/services/hospitalFieldFusion.js";
import { SOURCE_RELIABILITY, SOURCE_TYPES, CONFIDENCE_LEVELS } from "../../../backend/src/config/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RESULTS_DIR = path.resolve(__dirname, "../../results/provenance");

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// ---------------------------------------------------------
// Deterministic Seeded PRNG (Mulberry32)
// ---------------------------------------------------------
function createRng(seed = 424242) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Global deterministic random instance
const rng = createRng(20261024);

function randomChoice(arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function randomUniform(min, max) {
  return min + rng() * (max - min);
}

// ---------------------------------------------------------
// Ground Truth Source Archetypes & Nominal Reliability
// ---------------------------------------------------------
// Uses MedReach constants.SOURCE_RELIABILITY as base truth
const SOURCE_SPECS = {
  official_api: {
    type: "official_api",
    nominalReliability: SOURCE_RELIABILITY.official_api, // 1.0
    truePositiveProb: 0.98,
    trueNegativeProb: 0.98,
    defaultConfidence: "HIGH",
    verifiedProb: 0.80,
  },
  government_directory: {
    type: "government_directory",
    nominalReliability: SOURCE_RELIABILITY.government_directory, // 0.85
    truePositiveProb: 0.88,
    trueNegativeProb: 0.88,
    defaultConfidence: "HIGH",
    verifiedProb: 0.40,
  },
  authorized_feed: {
    type: "authorized_feed",
    nominalReliability: SOURCE_RELIABILITY.authorized_feed, // 0.80
    truePositiveProb: 0.82,
    trueNegativeProb: 0.82,
    defaultConfidence: "MEDIUM",
    verifiedProb: 0.20,
  },
  manual_verification: {
    type: "manual_verification",
    nominalReliability: SOURCE_RELIABILITY.manual_verification, // 0.75
    truePositiveProb: 0.92,
    trueNegativeProb: 0.92,
    defaultConfidence: "HIGH",
    verifiedProb: 0.90,
  },
  hospital_site: {
    type: "hospital_site",
    nominalReliability: SOURCE_RELIABILITY.hospital_site, // 0.60
    truePositiveProb: 0.68,
    trueNegativeProb: 0.65,
    defaultConfidence: "MEDIUM",
    verifiedProb: 0.05,
  },
  other: {
    type: "other",
    nominalReliability: SOURCE_RELIABILITY.other, // 0.30
    truePositiveProb: 0.48,
    trueNegativeProb: 0.48,
    defaultConfidence: "LOW",
    verifiedProb: 0.00,
  },
};

const NOMINAL_CONFIDENCE_VALUES = {
  HIGH: 1.0,
  MEDIUM: 0.7,
  LOW: 0.4,
  UNKNOWN: 0.1,
};

// ---------------------------------------------------------
// Synthetic Claim Generator
// ---------------------------------------------------------
function generateSyntheticFacilityClaim({
  sourceType,
  groundTruthCapability,
  noiseRate = 0.0,
  forceCapability = null,
  forceVerification = null,
  forceConfidence = null,
  ageMinutes = 0,
  isRejected = false,
}) {
  const spec = SOURCE_SPECS[sourceType] || SOURCE_SPECS.other;

  let capability;
  if (forceCapability !== null) {
    capability = forceCapability;
  } else {
    // Inherent source error modulated by scenario noise
    const baseP = groundTruthCapability === "yes" ? spec.truePositiveProb : spec.trueNegativeProb;
    const effectiveP = Math.max(0.1, Math.min(0.99, baseP * (1 - noiseRate) + 0.5 * noiseRate));
    const isAccurate = rng() < effectiveP;
    capability = isAccurate
      ? groundTruthCapability
      : groundTruthCapability === "yes" ? "no" : "yes";
  }

  // Verification status
  let verificationStatus = "unverified";
  if (isRejected) {
    verificationStatus = "rejected";
  } else if (forceVerification !== null) {
    verificationStatus = forceVerification;
  } else if (rng() < spec.verifiedProb) {
    verificationStatus = "verified";
  }

  // Confidence level
  let confidence = spec.defaultConfidence;
  if (forceConfidence !== null) {
    confidence = forceConfidence;
  } else {
    // Some noise in confidence reporting
    const roll = rng();
    if (verificationStatus === "verified") {
      confidence = roll < 0.85 ? "HIGH" : "MEDIUM";
    } else {
      if (spec.nominalReliability >= 0.8) {
        confidence = roll < 0.60 ? "HIGH" : roll < 0.90 ? "MEDIUM" : "LOW";
      } else if (spec.nominalReliability >= 0.6) {
        confidence = roll < 0.15 ? "HIGH" : roll < 0.75 ? "MEDIUM" : "LOW";
      } else {
        confidence = roll < 0.05 ? "MEDIUM" : roll < 0.70 ? "LOW" : "UNKNOWN";
      }
    }
  }

  const baseDate = new Date("2026-10-24T00:00:00.000Z");
  const observedAt = new Date(baseDate.getTime() - ageMinutes * 60 * 1000);

  return {
    _id: `synth_claim_${Math.floor(rng() * 1e9)}`,
    source: {
      _id: `src_${sourceType}`,
      name: `SYNTHETIC ${sourceType.toUpperCase()} Source`,
      type: sourceType,
      reliability: spec.nominalReliability,
    },
    facility: "ICU",
    capability,
    confidence,
    verificationStatus,
    observedAt,
    sourcePageUrl: `https://synthetic.provider.test/${sourceType}/facility`,
    evidenceText: `SYNTHETIC evidence text for ${sourceType} observing capability=${capability}`,
    parserVersion: "synthetic-v1",
  };
}

// ---------------------------------------------------------
// Experiment Suite 1: Source Count & Inherent Disagreement Rate
// ---------------------------------------------------------
console.log("Starting Experiment 1: Source Count vs Inherent Disagreement...");

const sourceCounts = [2, 3, 4, 5, 6, 8];
const disagreementRates = [0.05, 0.15, 0.30, 0.50];
const TRIALS_PER_CELL_EXP1 = 500;

const exp1Trials = [];

for (const k of sourceCounts) {
  for (const eta of disagreementRates) {
    for (let t = 0; t < TRIALS_PER_CELL_EXP1; t++) {
      // 50/50 prior on facility capability
      const groundTruth = rng() < 0.5 ? "yes" : "no";

      // Pool of source types for realistic mixture
      const mixedTypes = ["official_api", "government_directory", "authorized_feed", "hospital_site", "other"];
      const claims = [];

      for (let s = 0; s < k; s++) {
        const st = mixedTypes[s % mixedTypes.length];
        claims.push(
          generateSyntheticFacilityClaim({
            sourceType: st,
            groundTruthCapability: groundTruth,
            noiseRate: eta,
            ageMinutes: Math.floor(randomUniform(5, 120)),
          })
        );
      }

      // Check raw claim disagreement
      const usable = claims.filter((c) => c.verificationStatus !== "rejected" && ["yes", "no"].includes(c.capability));
      const uniqueUsableCaps = new Set(usable.map((c) => c.capability));
      const hasSourceDivergence = uniqueUsableCaps.size > 1;

      // Execute REAL MedReach fusion function
      const fusionResult = fuseFacilityClaims(claims);

      const isConflictDetected = fusionResult.conflict === true;
      const resolved = fusionResult.capability;
      const isResolved = resolved !== "unknown";
      const isCorrect = resolved === groundTruth;
      const isIncorrect = isResolved && !isCorrect;
      const isUnresolved = !isResolved;

      exp1Trials.push({
        suite: "exp1_source_count_disagreement",
        trialId: `exp1_k${k}_eta${eta}_t${t}`,
        k,
        eta,
        groundTruth,
        hasSourceDivergence,
        conflictDetected: isConflictDetected,
        resolvedCapability: resolved,
        isResolved,
        isCorrect,
        isIncorrect,
        isUnresolved,
        selectedConfidence: fusionResult.selectedClaim?.confidence || null,
        selectedVerificationStatus: fusionResult.selectedClaim?.verificationStatus || null,
      });
    }
  }
}

console.log(`Experiment 1 completed: ${exp1Trials.length} trials executed.`);

// ---------------------------------------------------------
// Experiment Suite 2: Source Trust & Verification Architectures
// ---------------------------------------------------------
console.log("Starting Experiment 2: Source Trust / Verification Mix...");

const CONFIGURATIONS = [
  {
    name: "official_consensus",
    description: "High-trust official sources (3 official/government sources)",
    sources: ["official_api", "government_directory", "official_api"],
    forceVerifiedCount: 0,
  },
  {
    name: "unverified_crowd_scrapers",
    description: "Unverified web scrapers only (4 hospital_site / other sources)",
    sources: ["hospital_site", "hospital_site", "other", "other"],
    forceVerifiedCount: 0,
  },
  {
    name: "asymmetric_verified_anchor",
    description: "1 verified high-trust manual anchor + 4 noisy unverified scrapers",
    sources: ["manual_verification", "hospital_site", "hospital_site", "other", "other"],
    forceVerifiedCount: 1, // First source is strictly verified
  },
  {
    name: "conflicting_verified_sources",
    description: "2 opposing verified sources (institutional dispute)",
    sources: ["official_api", "manual_verification"],
    forceVerifiedCount: 2,
    forceOpposing: true,
  },
];

const TRIALS_PER_CONFIG_EXP2 = 1000;
const exp2Trials = [];

for (const cfg of CONFIGURATIONS) {
  for (let t = 0; t < TRIALS_PER_CONFIG_EXP2; t++) {
    const groundTruth = rng() < 0.5 ? "yes" : "no";
    const claims = [];

    for (let i = 0; i < cfg.sources.length; i++) {
      const st = cfg.sources[i];
      let forceCap = null;
      let forceVer = null;

      if (cfg.name === "conflicting_verified_sources") {
        forceVer = "verified";
        forceCap = i === 0 ? "yes" : "no"; // Deliberately opposing verified claims
      } else if (cfg.name === "asymmetric_verified_anchor" && i === 0) {
        forceVer = "verified";
        forceCap = groundTruth; // Anchor reflects ground truth
      } else if (cfg.name === "unverified_crowd_scrapers") {
        forceVer = "unverified";
      }

      claims.push(
        generateSyntheticFacilityClaim({
          sourceType: st,
          groundTruthCapability: groundTruth,
          noiseRate: 0.25,
          forceCapability: forceCap,
          forceVerification: forceVer,
          ageMinutes: Math.floor(randomUniform(10, 180)),
        })
      );
    }

    const usable = claims.filter((c) => c.verificationStatus !== "rejected" && ["yes", "no"].includes(c.capability));
    const uniqueUsableCaps = new Set(usable.map((c) => c.capability));
    const hasSourceDivergence = uniqueUsableCaps.size > 1;

    const fusionResult = fuseFacilityClaims(claims);

    const isConflictDetected = fusionResult.conflict === true;
    const resolved = fusionResult.capability;
    const isResolved = resolved !== "unknown";
    const isCorrect = resolved === groundTruth;
    const isIncorrect = isResolved && !isCorrect;
    const isUnresolved = !isResolved;

    exp2Trials.push({
      suite: "exp2_trust_mix",
      configName: cfg.name,
      trialId: `exp2_${cfg.name}_t${t}`,
      groundTruth,
      hasSourceDivergence,
      conflictDetected: isConflictDetected,
      resolvedCapability: resolved,
      isResolved,
      isCorrect,
      isIncorrect,
      isUnresolved,
      selectedConfidence: fusionResult.selectedClaim?.confidence || null,
      selectedVerificationStatus: fusionResult.selectedClaim?.verificationStatus || null,
    });
  }
}

console.log(`Experiment 2 completed: ${exp2Trials.length} trials executed.`);

// ---------------------------------------------------------
// Experiment Suite 3: Staleness, Temporal Decay & Recency Bias
// ---------------------------------------------------------
console.log("Starting Experiment 3: Staleness & Lexicographical Priority...");

/**
 * Investigates how MedReach sorts candidate pool:
 * (CONFIDENCE[b] - CONFIDENCE[a]) || (observedAt[b] - observedAt[a])
 * Specifically:
 * Scenario 3A: Fresh low-confidence claim vs Stale high-confidence claim after a real status transition.
 * Scenario 3B: General staleness decay where observation age ranges from 0 to 48 hours.
 */

const TRIALS_EXP3 = 1000;
const exp3Trials = [];

for (let t = 0; t < TRIALS_EXP3; t++) {
  // Facility changed status from "no" (historical) to "yes" (new reality)
  const currentGroundTruth = "yes";
  const oldGroundTruth = "no";

  // Stale claim: observed 12 hours ago with HIGH confidence asserting old status
  const staleHighConfClaim = generateSyntheticFacilityClaim({
    sourceType: "official_api",
    groundTruthCapability: oldGroundTruth,
    forceCapability: oldGroundTruth,
    forceConfidence: "HIGH",
    forceVerification: "unverified",
    ageMinutes: 12 * 60, // 12 hours old
  });

  // Fresh claim: observed 10 minutes ago with LOW confidence asserting current reality
  const freshLowConfClaim = generateSyntheticFacilityClaim({
    sourceType: "hospital_site",
    groundTruthCapability: currentGroundTruth,
    forceCapability: currentGroundTruth,
    forceConfidence: "LOW",
    forceVerification: "unverified",
    ageMinutes: 10, // 10 minutes old
  });

  const claims = [staleHighConfClaim, freshLowConfClaim];
  const fusionResult = fuseFacilityClaims(claims);

  // Both are unverified and disagree!
  // MedReach rule: if poolValues.size > 1 and verified.length === 0 => returns capability: "unknown", conflict: true
  // What if BOTH are verified?
  const verifiedStale = { ...staleHighConfClaim, verificationStatus: "verified" };
  const verifiedFresh = { ...freshLowConfClaim, verificationStatus: "verified" };
  const verifiedConflictResult = fuseFacilityClaims([verifiedStale, verifiedFresh]);

  // What if fresh claim has MEDIUM confidence and stale has HIGH confidence, but they agree?
  // Or what if fresh claim is verified, stale is unverified?
  const verifiedFreshOverStale = fuseFacilityClaims([staleHighConfClaim, verifiedFresh]);

  exp3Trials.push({
    suite: "exp3_temporal_bias",
    trialId: `exp3_t${t}`,
    unverifiedConflictResult: fusionResult.capability,
    unverifiedConflictFlag: fusionResult.conflict,
    verifiedConflictResult: verifiedConflictResult.capability,
    verifiedConflictFlag: verifiedConflictResult.conflict,
    verifiedFreshResolution: verifiedFreshOverStale.capability,
    verifiedFreshWinner: verifiedFreshOverStale.selectedClaim?.confidence,
    verifiedFreshAge: verifiedFreshOverStale.selectedClaim?.observedAt,
  });
}

// Sweep staleness age from 0 to 48 hours with temporal decay
const stalenessAgesHours = [0.2, 1, 3, 6, 12, 24, 48];
const exp3StalenessCurve = [];

for (const ageH of stalenessAgesHours) {
  for (let t = 0; t < 500; t++) {
    const currentStatus = rng() < 0.5 ? "yes" : "no";
    // Probability facility status flipped over ageH
    // Half-life of 24 hours: status flips with prob = 0.5 * (1 - exp(-ageH / 24))
    const flipProb = 0.5 * (1 - Math.exp(-ageH / 24));
    const wasFlipped = rng() < flipProb;
    const historicalStatus = wasFlipped ? (currentStatus === "yes" ? "no" : "yes") : currentStatus;

    // Source observed at historical age
    const claim = generateSyntheticFacilityClaim({
      sourceType: "hospital_site",
      groundTruthCapability: historicalStatus,
      ageMinutes: Math.round(ageH * 60),
    });

    // Single source or paired with a baseline
    const fusion = fuseFacilityClaims([claim]);
    const isCorrect = fusion.capability === currentStatus;

    exp3StalenessCurve.push({
      ageHours: ageH,
      wasFlipped,
      isCorrect,
      capability: fusion.capability,
    });
  }
}

console.log(`Experiment 3 completed.`);

// ---------------------------------------------------------
// Experiment Suite 4: Missing Sources / Dropout & Arrival Latency
// ---------------------------------------------------------
console.log("Starting Experiment 4: Dropout & Arrival Latency...");

const dropoutRates = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
const TRIALS_EXP4 = 600;
const exp4Trials = [];

for (const pDrop of dropoutRates) {
  for (let t = 0; t < TRIALS_EXP4; t++) {
    const groundTruth = rng() < 0.5 ? "yes" : "no";

    // 5 sources available in architecture
    const fullSourceList = [
      "official_api",
      "government_directory",
      "authorized_feed",
      "hospital_site",
      "manual_verification",
    ];

    // Stochastic dropout
    const reportingSources = fullSourceList.filter(() => rng() >= pDrop);

    // If all dropped out, zero claims
    const claims = reportingSources.map((st) =>
      generateSyntheticFacilityClaim({
        sourceType: st,
        groundTruthCapability: groundTruth,
        noiseRate: 0.15,
        ageMinutes: Math.floor(randomUniform(5, 60)),
      })
    );

    const fusionResult = fuseFacilityClaims(claims);
    const resolved = fusionResult.capability;
    const isResolved = resolved !== "unknown";
    const isCorrect = resolved === groundTruth;
    const isIncorrect = isResolved && !isCorrect;
    const isUnresolved = !isResolved;

    exp4Trials.push({
      suite: "exp4_dropout",
      trialId: `exp4_p${pDrop}_t${t}`,
      pDrop,
      activeSourceCount: reportingSources.length,
      groundTruth,
      conflictDetected: fusionResult.conflict,
      resolvedCapability: resolved,
      isResolved,
      isCorrect,
      isIncorrect,
      isUnresolved,
    });
  }
}

// Asynchronous arrival timeline simulation
const arrivalSteps = [0, 5, 15, 30, 60]; // minutes elapsed
const exp4ArrivalTimeline = [];

for (let t = 0; t < 500; t++) {
  const groundTruth = rng() < 0.5 ? "yes" : "no";

  // 4 sources with different arrival latencies
  // S1: hospital_site arrives at t=0
  // S2: other arrives at t=5
  // S3: authorized_feed arrives at t=15
  // S4: official_api arrives at t=45
  const sourceSchedule = [
    { type: "hospital_site", arrivesAt: 0, noise: 0.30 },
    { type: "other", arrivesAt: 5, noise: 0.45 },
    { type: "authorized_feed", arrivesAt: 15, noise: 0.20 },
    { type: "official_api", arrivesAt: 45, noise: 0.05 },
  ];

  const generatedClaims = sourceSchedule.map((s) => ({
    ...s,
    claim: generateSyntheticFacilityClaim({
      sourceType: s.type,
      groundTruthCapability: groundTruth,
      noiseRate: s.noise,
      ageMinutes: 0,
    }),
  }));

  for (const stepTime of arrivalSteps) {
    const activeClaims = generatedClaims
      .filter((s) => s.arrivesAt <= stepTime)
      .map((s) => s.claim);

    const fusion = fuseFacilityClaims(activeClaims);
    exp4ArrivalTimeline.push({
      trialId: t,
      stepTime,
      activeSources: activeClaims.length,
      groundTruth,
      capability: fusion.capability,
      conflict: fusion.conflict,
      isCorrect: fusion.capability === groundTruth,
      isUnresolved: fusion.capability === "unknown",
    });
  }
}

console.log(`Experiment 4 completed.`);

// ---------------------------------------------------------
// Experiment Suite 5: Heuristic Confidence vs Calibration Analysis
// ---------------------------------------------------------
console.log("Starting Experiment 5: Calibration & Brier Score...");

/**
 * Sweeps thousands of trials to collect every winning claim and evaluates
 * whether heuristic confidence matches empirical truth probability.
 */
const calibrationTrials = [];
const N_CALIBRATION_TRIALS = 15000;

for (let t = 0; t < N_CALIBRATION_TRIALS; t++) {
  const groundTruth = rng() < 0.5 ? "yes" : "no";
  const k = Math.floor(randomUniform(2, 6));

  const sourceTypes = ["official_api", "government_directory", "authorized_feed", "hospital_site", "other"];
  const claims = [];

  for (let s = 0; s < k; s++) {
    claims.push(
      generateSyntheticFacilityClaim({
        sourceType: randomChoice(sourceTypes),
        groundTruthCapability: groundTruth,
        noiseRate: randomUniform(0.05, 0.40),
        ageMinutes: Math.floor(randomUniform(5, 300)),
      })
    );
  }

  const fusionResult = fuseFacilityClaims(claims);

  if (fusionResult.selectedClaim && fusionResult.capability !== "unknown") {
    const selected = fusionResult.selectedClaim;
    const isCorrect = fusionResult.capability === groundTruth;
    const confidenceLabel = selected.confidence || "UNKNOWN";
    const nominalProb = NOMINAL_CONFIDENCE_VALUES[confidenceLabel] || 0.1;

    calibrationTrials.push({
      trialId: t,
      groundTruth,
      resolved: fusionResult.capability,
      isCorrect: isCorrect ? 1 : 0,
      confidenceLabel,
      nominalProb,
      verificationStatus: selected.verificationStatus,
      sourceType: selected.source.type,
      conflictFlag: fusionResult.conflict,
    });
  }
}

console.log(`Experiment 5 completed: ${calibrationTrials.length} resolved claims collected for calibration.`);

// ---------------------------------------------------------
// Experiment Suite 6: Structured Hospital Field Fusion
// ---------------------------------------------------------
console.log("Starting Experiment 6: Field-Level Fusion (Phone, Website, Specialties)...");

const fieldTrials = [];
const N_FIELD_TRIALS = 2000;

for (let t = 0; t < N_FIELD_TRIALS; t++) {
  // Test 1: Phone normalization and conflict
  const truePhoneDigits = "02224107000";
  const phoneRepresentations = [
    "022-24107000",
    "022 2410 7000",
    "(022) 2410-7000",
    "02224107000",
  ];
  const conflictingPhone = "02224109999";

  const isPhoneConflicted = rng() < 0.40;
  const isPhoneVerified = rng() < 0.30;

  const phoneClaims = [
    {
      value: randomChoice(phoneRepresentations),
      confidence: "HIGH",
      verificationStatus: isPhoneVerified ? "verified" : "unverified",
      observedAt: new Date("2026-10-24T00:00:00Z"),
    },
    {
      value: isPhoneConflicted ? conflictingPhone : randomChoice(phoneRepresentations),
      confidence: "MEDIUM",
      verificationStatus: "unverified",
      observedAt: new Date("2026-10-24T00:10:00Z"),
    },
  ];

  const phoneResult = resolveHospitalField("phone", phoneClaims);

  // Test 2: Specialties normalization and set comparison
  const trueSpecialties = ["Cardiology", "Neurology", "Pediatrics"];
  const permutationSpecialties = ["Neurology", "Cardiology", "Pediatrics"]; // Same set, different order
  const conflictingSpecialties = ["Cardiology", "Dermatology"];

  const isSpecConflicted = rng() < 0.40;
  const isSpecVerified = rng() < 0.30;

  const specClaims = [
    {
      value: trueSpecialties,
      confidence: "HIGH",
      verificationStatus: isSpecVerified ? "verified" : "unverified",
      observedAt: new Date("2026-10-24T00:00:00Z"),
    },
    {
      value: isSpecConflicted ? conflictingSpecialties : permutationSpecialties,
      confidence: "MEDIUM",
      verificationStatus: "unverified",
      observedAt: new Date("2026-10-24T00:15:00Z"),
    },
  ];

  const specResult = resolveHospitalField("specialties", specClaims);

  fieldTrials.push({
    trialId: t,
    isPhoneConflicted,
    isPhoneVerified,
    phoneConflictDetected: phoneResult.conflict,
    phoneResolved: phoneResult.value !== null,
    phoneValueCorrect: phoneResult.value ? phoneResult.value.replace(/\D/g, "") === truePhoneDigits : false,

    isSpecConflicted,
    isSpecVerified,
    specConflictDetected: specResult.conflict,
    specResolved: specResult.value !== null,
    specCorrect: specResult.value ? JSON.stringify(specResult.value.sort()) === JSON.stringify(trueSpecialties.sort()) : false,
  });
}

console.log(`Experiment 6 completed: ${fieldTrials.length} field trials executed.`);

// ---------------------------------------------------------
// Export Raw Data & Intermediate Datasets
// ---------------------------------------------------------
console.log("Writing raw data outputs to disk...");

// Save raw JSON files incrementally
fs.writeFileSync(
  path.join(RESULTS_DIR, "raw_exp1_trials.json"),
  JSON.stringify(exp1Trials, null, 2)
);
fs.writeFileSync(
  path.join(RESULTS_DIR, "raw_exp2_trials.json"),
  JSON.stringify(exp2Trials, null, 2)
);
fs.writeFileSync(
  path.join(RESULTS_DIR, "raw_exp3_trials.json"),
  JSON.stringify({ temporalBias: exp3Trials, stalenessCurve: exp3StalenessCurve }, null, 2)
);
fs.writeFileSync(
  path.join(RESULTS_DIR, "raw_exp4_trials.json"),
  JSON.stringify({ dropout: exp4Trials, arrivalTimeline: exp4ArrivalTimeline }, null, 2)
);
fs.writeFileSync(
  path.join(RESULTS_DIR, "raw_calibration_trials.json"),
  JSON.stringify(calibrationTrials, null, 2)
);
fs.writeFileSync(
  path.join(RESULTS_DIR, "raw_field_trials.json"),
  JSON.stringify(fieldTrials, null, 2)
);

// Flat CSV export for Exp 1
const exp1CsvHeader = "k,eta,groundTruth,hasSourceDivergence,conflictDetected,resolvedCapability,isResolved,isCorrect,isIncorrect,isUnresolved,selectedConfidence,selectedVerificationStatus\n";
const exp1CsvRows = exp1Trials
  .map(
    (r) =>
      `${r.k},${r.eta},${r.groundTruth},${r.hasSourceDivergence},${r.conflictDetected},${r.resolvedCapability},${r.isResolved},${r.isCorrect},${r.isIncorrect},${r.isUnresolved},${r.selectedConfidence || ""},${r.selectedVerificationStatus || ""}`
  )
  .join("\n");
fs.writeFileSync(path.join(RESULTS_DIR, "exp1_source_count_disagreement.csv"), exp1CsvHeader + exp1CsvRows);

// Flat CSV export for Calibration
const calCsvHeader = "trialId,groundTruth,resolved,isCorrect,confidenceLabel,nominalProb,verificationStatus,sourceType,conflictFlag\n";
const calCsvRows = calibrationTrials
  .map(
    (r) =>
      `${r.trialId},${r.groundTruth},${r.resolved},${r.isCorrect},${r.confidenceLabel},${r.nominalProb},${r.verificationStatus},${r.sourceType},${r.conflictFlag}`
  )
  .join("\n");
fs.writeFileSync(path.join(RESULTS_DIR, "calibration_trials.csv"), calCsvHeader + calCsvRows);

console.log("All raw trial outputs successfully saved to research/results/provenance/.");
