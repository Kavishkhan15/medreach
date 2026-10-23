# EXP-PROV: MedReach Provenance and Conflicting-Claim Fusion Experiment

## 1. Experiment Overview
- **Experiment ID**: `EXP-PROV-2026-10-24`
- **Component**: Provenance, Multi-Source Data Fusion, and Conflict Resolution Engine
- **Target Source Files**:
  - `backend/src/services/facilityClaimFusion.js` (`fuseFacilityClaims`)
  - `backend/src/services/hospitalFieldFusion.js` (`resolveHospitalField`, `normalizeFieldValue`, `sameHospitalField`)
  - `backend/src/config/constants.js` (`SOURCE_RELIABILITY`, `SOURCE_TYPES`, `CONFIDENCE_LEVELS`)
  - `backend/src/models/DataSource.js`
  - `backend/src/models/FacilitySourceClaim.js`
  - `backend/src/models/HospitalFieldClaim.js`
  - `backend/src/models/DataConflict.js`
  - `backend/src/models/HospitalFieldConflict.js`
- **Lead Specialist**: Provenance and Data-Fusion Specialist

---

## 2. Research Questions
- **RQ-PROV-1 (Conflict Detection Sensitivity)**: At what rate does MedReach detect multi-source discrepancies across varying source counts ($K \in [2, 8]$) and reporting noise levels ($\eta \in [0.05, 0.50]$)?
- **RQ-PROV-2 (Safety and Resolution Architecture)**: How does the conservative verification hierarchy behave across distinct deployment configurations (pure official sources, unverified crowd scrapers, asymmetric single-verified anchors, and institutional disputes)?
- **RQ-PROV-3 (Temporal Staleness & Dynamic Decay)**: How does the lexicographical sorting rule `(confidence) || (observedAt)` perform under facility capability transitions and observation age decay?
- **RQ-PROV-4 (Confidence Calibration & Statistical Validity)**: Is MedReach's confidence attribute (`HIGH`, `MEDIUM`, `LOW`, `UNKNOWN`) a calibrated probability or an uncalibrated heuristic ranking?
- **RQ-PROV-5 (Structured Field Normalization)**: How robust is field-level fusion on non-binary attributes (`phone`, `specialties`) against cosmetic syntax variation versus semantic divergence?

---

## 3. Real Codebase Implementation & Source Reliability Weights

### Documented Source Reliability Weights (`constants.js` & `DataSource.js`)
MedReach establishes default reliability weights in `backend/src/config/constants.js`:
```javascript
export const SOURCE_RELIABILITY = {
  official_api: 1.0,
  government_directory: 0.85,
  government: 0.85,           // legacy alias
  authorized_feed: 0.8,
  hospital_site: 0.6,
  manual_verification: 0.75,
  manual: 0.75,                // legacy alias
  other: 0.3,
};
```
In `backend/src/models/DataSource.js`, these weights automatically populate source documents:
```javascript
dataSourceSchema.pre("validate", function (next) {
  if (this.reliability === undefined || this.reliability === null) {
    this.reliability = SOURCE_RELIABILITY[this.type] ?? 0.3;
  }
  next();
});
```

### Fusion Algorithm Mechanics
Unlike Bayesian consensus or probabilistic soft-voting models, MedReach executes a **deterministic, discrete lexicographical priority cascade**:
1. **Filtering**: Reject claims where `verificationStatus === "rejected"` or values are invalid/empty.
2. **Verification Hierarchy**:
   - Partition usable claims into `verified` (`verificationStatus === "verified"`) and `unverified`.
   - If any verified claims exist, the candidate resolution pool is restricted strictly to verified claims (`pool = verified`).
   - If no verified claims exist, `pool = usable`.
3. **Disagreement Detection**:
   - `conflict = new Set(usable.map(...)).size > 1`.
   - Conflict is flagged whenever ANY usable claim disagrees with another, regardless of verification status.
4. **Resolution Gate**:
   - If the candidate pool contains conflicting assertions (`poolValues.size > 1`), resolution immediately terminates returning `{ capability: "unknown", conflict: true, selectedClaim: null }` (or `value: null`).
   - In `resolveHospitalField`: If unverified claims disagree (`conflict === true` and `verified.length === 0`), the field is withheld (`value: null`).
   - If all claims in the pool agree, resolution selects the single winning claim by sorting:
     `descending CONFIDENCE[claim.confidence] || descending observedAt`.

---

## 4. Experimental Suites & Synthetic Generator Design

All experimental trials use **SYNTHETIC** multi-source claims with known ground truth states:
- **Seed**: `20261024` (Mulberry32 PRNG for exact deterministic reproducibility across all runs).
- **Suite 1: Source Count vs Disagreement Rate**:
  - Sweeps $K \in \{2, 3, 4, 5, 6, 8\}$ and noise $\eta \in \{0.05, 0.15, 0.30, 0.50\}$.
  - 500 trials per cell $\times 24$ cells = **12,000 trials**.
- **Suite 2: Trust Mix & Verification Architectures**:
  - 4 architectures: Official Consensus, Unverified Crowd Scrapers, Asymmetric Verified Anchor, Conflicting Verified Dispute.
  - 1,000 trials per architecture = **4,000 trials**.
- **Suite 3: Temporal Staleness & Recency Bias**:
  - Investigates status transition race conditions (stale high-confidence vs fresh low-confidence) and temporal drift across 0.2 to 48 hours = **4,500 trials**.
- **Suite 4: Missingness & Latency Decay**:
  - Dropout rates $p_{\text{drop}} \in [0.0, 0.6]$ and asynchronous arrival timeline at $T \in \{0, 5, 15, 30, 60\}$ minutes = **7,300 trials**.
- **Suite 5: Confidence Calibration**:
  - Evaluates 10,615 resolved claims for empirical accuracy against nominal confidence values, computing Brier Score, ECE, and MCE.
- **Suite 6: Field-Level Fusion**:
  - Evaluates telephone number and specialty set normalization and conflict resolution across 2,000 trials.

**Total Executed Trials**: Over 40,000 synthetic trials directly invoking repository functions.

---

## 5. Execution and Reproduction Instructions

Ensure Node.js (>= v20) and Python 3 (with numpy and matplotlib) are installed.

```bash
# 1. Navigate to the MedReach repository root
cd /home/anonymous/medreach

# 2. Execute the Node.js synthetic scenario runner
# Directly imports backend/src/services/facilityClaimFusion.js and hospitalFieldFusion.js
node research/experiments/provenance/exp_prov_runner.mjs

# 3. Execute the analysis and visualization script
python3 research/experiments/provenance/analyze_results.py

# 4. View generated artifacts in research/results/provenance/
ls -lh research/results/provenance/
```

---

## 6. Directory Artifacts

```
research/
├── experiments/provenance/
│   ├── README.md                 <- Protocol documentation and reproduction instructions
│   ├── exp_prov_runner.mjs       <- Multi-suite scenario generator and real fusion testbed
│   └── analyze_results.py        <- Statistical calculation, calibration, and chart generation
└── results/provenance/
    ├── raw_exp1_trials.json      <- Raw trial records for Experiment 1 (12,000 trials)
    ├── raw_exp2_trials.json      <- Raw trial records for Experiment 2 (4,000 trials)
    ├── raw_exp3_trials.json      <- Raw trial records for Experiment 3
    ├── raw_exp4_trials.json      <- Raw trial records for Experiment 4
    ├── raw_calibration_trials.json <- Raw calibration records (10,615 resolved claims)
    ├── raw_field_trials.json     <- Raw field trials (2,000 trials)
    ├── exp1_source_count_disagreement.csv <- Flat CSV of Exp 1
    ├── calibration_trials.csv    <- Flat CSV of calibration trials
    ├── confusion_matrix.csv      <- Confusion matrix across Ground Truth vs Resolution
    ├── calibration_analysis.json <- Brier score, ECE, MCE, and calibration table
    ├── summary_metrics.json      <- Master compiled metrics across all experiments
    ├── fig1_conflict_detection.png        <- Conflict detection & unresolved rate chart
    ├── fig2_accuracy_and_unresolved.png   <- Trust architecture outcome breakdown chart
    ├── fig3_staleness_sensitivity.png     <- Temporal staleness accuracy decay chart
    ├── fig4_dropout_sensitivity.png       <- Dropout & arrival convergence chart
    ├── fig5_calibration_curve.png         <- Reliability diagram (calibration curve)
    ├── fig6_confusion_matrix.png          <- Confusion matrix heatmap
    └── PROVENANCE_FUSION_REPORT.md        <- Formal comprehensive research report
```
