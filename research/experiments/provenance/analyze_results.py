#!/usr/bin/env python3
"""
EXP-PROV Analysis and Visualization Script

Analyzes raw trial results from MedReach provenance and fusion experiments.
Generates publication-quality charts (PNG), confusion matrices, calibration analysis
(Brier score, ECE, reliability diagrams), and structured summary metrics.
"""

import os
import json
import csv
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

RESULTS_DIR = "/home/anonymous/medreach/research/results/provenance"

# Plot styling configuration
plt.rcParams.update({
    "font.size": 11,
    "axes.labelsize": 12,
    "axes.titlesize": 13,
    "xtick.labelsize": 10,
    "ytick.labelsize": 10,
    "legend.fontsize": 10,
    "figure.titlesize": 14,
    "figure.dpi": 300,
    "lines.linewidth": 2,
    "lines.markersize": 6,
    "grid.alpha": 0.3,
})

def load_json(filename):
    filepath = os.path.join(RESULTS_DIR, filename)
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(data, filename):
    filepath = os.path.join(RESULTS_DIR, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Saved {filepath}")

def main():
    print("Loading raw trial data...")
    exp1 = load_json("raw_exp1_trials.json")
    exp2 = load_json("raw_exp2_trials.json")
    exp3 = load_json("raw_exp3_trials.json")
    exp4 = load_json("raw_exp4_trials.json")
    cal = load_json("raw_calibration_trials.json")
    field = load_json("raw_field_trials.json")

    # -------------------------------------------------------------
    # 1. Experiment 1: Source Count & Disagreement Rate Analysis
    # -------------------------------------------------------------
    print("Analyzing Experiment 1...")
    # Group by (k, eta)
    exp1_grouped = {}
    for r in exp1:
        key = (r["k"], r["eta"])
        if key not in exp1_grouped:
            exp1_grouped[key] = []
        exp1_grouped[key].append(r)

    exp1_summary = {}
    for (k, eta), trials in exp1_grouped.items():
        total = len(trials)
        divergent = [t for t in trials if t["hasSourceDivergence"]]
        detected = [t for t in trials if t["conflictDetected"]]
        
        # Conflict detection rate among divergent trials
        conflict_detection_rate = len([t for t in divergent if t["conflictDetected"]]) / len(divergent) if divergent else 1.0
        
        resolved = [t for t in trials if t["isResolved"]]
        correct = [t for t in trials if t["isCorrect"]]
        incorrect = [t for t in trials if t["isIncorrect"]]
        unresolved = [t for t in trials if t["isUnresolved"]]

        key_str = f"k{k}_eta{eta}"
        exp1_summary[key_str] = {
            "k": k,
            "eta": eta,
            "total_trials": total,
            "divergent_trials": len(divergent),
            "divergence_rate": len(divergent) / total,
            "detected_conflicts": len(detected),
            "conflict_detection_rate": conflict_detection_rate,
            "resolved_count": len(resolved),
            "resolved_rate": len(resolved) / total,
            "correct_count": len(correct),
            "correct_rate": len(correct) / total,
            "incorrect_count": len(incorrect),
            "incorrect_rate": len(incorrect) / total,
            "unresolved_count": len(unresolved),
            "unresolved_rate": len(unresolved) / total,
            "conditional_accuracy": len(correct) / len(resolved) if resolved else 0.0,
        }

    # Plot Fig 1: Conflict Detection Rate & Unresolved Rate vs Disagreement Rate
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5.5))
    
    unique_ks = sorted(list(set([t["k"] for t in exp1])))
    unique_etas = sorted(list(set([t["eta"] for t in exp1])))
    colors = plt.cm.viridis(np.linspace(0, 0.85, len(unique_ks)))

    for i, k in enumerate(unique_ks):
        rates = [exp1_summary[f"k{k}_eta{eta}"]["conflict_detection_rate"] * 100 for eta in unique_etas]
        ax1.plot(unique_etas, rates, marker="o", label=f"K = {k} sources", color=colors[i])

    ax1.set_xlabel("Scenario Inherent Disagreement Rate (η)")
    ax1.set_ylabel("Conflict Detection Rate (%)")
    ax1.set_title("Conflict Detection Rate vs Noise & Source Count")
    ax1.set_ylim(-5, 105)
    ax1.grid(True)
    ax1.legend(loc="lower right")

    for i, k in enumerate(unique_ks):
        unres = [exp1_summary[f"k{k}_eta{eta}"]["unresolved_rate"] * 100 for eta in unique_etas]
        ax2.plot(unique_etas, unres, marker="s", label=f"K = {k} sources", color=colors[i])

    ax2.set_xlabel("Scenario Inherent Disagreement Rate (η)")
    ax2.set_ylabel("Unresolved Rate (% Held for Review)")
    ax2.set_title("Unresolved Rate vs Disagreement & Source Count")
    ax2.set_ylim(-5, 105)
    ax2.grid(True)
    ax2.legend(loc="upper left")

    plt.tight_layout()
    fig1_path = os.path.join(RESULTS_DIR, "fig1_conflict_detection.png")
    plt.savefig(fig1_path)
    plt.close()
    print(f"Saved {fig1_path}")

    # -------------------------------------------------------------
    # 2. Experiment 2: Trust Mix & Verification Architectures
    # -------------------------------------------------------------
    print("Analyzing Experiment 2...")
    exp2_configs = sorted(list(set([t["configName"] for t in exp2])))
    exp2_summary = {}

    for cfg in exp2_configs:
        trials = [t for t in exp2 if t["configName"] == cfg]
        total = len(trials)
        divergent = [t for t in trials if t["hasSourceDivergence"]]
        detected = [t for t in trials if t["conflictDetected"]]
        resolved = [t for t in trials if t["isResolved"]]
        correct = [t for t in trials if t["isCorrect"]]
        incorrect = [t for t in trials if t["isIncorrect"]]
        unresolved = [t for t in trials if t["isUnresolved"]]

        exp2_summary[cfg] = {
            "config": cfg,
            "total_trials": total,
            "divergent_rate": len(divergent) / total,
            "conflict_detection_rate": len([t for t in divergent if t["conflictDetected"]]) / len(divergent) if divergent else 1.0,
            "resolved_rate": len(resolved) / total,
            "correct_rate": len(correct) / total,
            "incorrect_rate": len(incorrect) / total,
            "unresolved_rate": len(unresolved) / total,
            "conditional_accuracy": len(correct) / len(resolved) if resolved else 0.0,
        }

    # Plot Fig 2: Architecture Outcomes Breakdown
    fig, ax = plt.subplots(figsize=(10, 6))
    cfg_labels = [
        "Official Consensus\n(Gov/Official APIs)",
        "Unverified Crowd\n(Web Scrapers Only)",
        "Asymmetric Anchor\n(1 Verified + 4 Noisy)",
        "Conflicting Verified\n(Dispute Freeze)"
    ]
    x = np.arange(len(cfg_labels))
    width = 0.25

    correct_vals = [exp2_summary[c]["correct_rate"] * 100 for c in exp2_configs]
    incorrect_vals = [exp2_summary[c]["incorrect_rate"] * 100 for c in exp2_configs]
    unresolved_vals = [exp2_summary[c]["unresolved_rate"] * 100 for c in exp2_configs]

    rects1 = ax.bar(x - width, correct_vals, width, label="Correct Resolution", color="#2ca02c")
    rects2 = ax.bar(x, incorrect_vals, width, label="Incorrect Decision (Error)", color="#d62728")
    rects3 = ax.bar(x + width, unresolved_vals, width, label="Unresolved (Held for Review)", color="#1f77b4")

    ax.set_ylabel("Outcome Proportion (%)")
    ax.set_title("Fusion Outcomes Across Trust & Verification Architectures (N=1,000/cfg)")
    ax.set_xticks(x)
    ax.set_xticklabels(cfg_labels)
    ax.set_ylim(0, 115)
    ax.legend(loc="upper right")
    ax.grid(axis="y")

    # Add numeric labels on bars
    for rects in [rects1, rects2, rects3]:
        for rect in rects:
            height = rect.get_height()
            ax.annotate(f"{height:.1f}%",
                        xy=(rect.get_x() + rect.get_width() / 2, height),
                        xytext=(0, 3), textcoords="offset points",
                        ha="center", va="bottom", fontsize=8)

    plt.tight_layout()
    fig2_path = os.path.join(RESULTS_DIR, "fig2_accuracy_and_unresolved.png")
    plt.savefig(fig2_path)
    plt.close()
    print(f"Saved {fig2_path}")

    # -------------------------------------------------------------
    # 3. Experiment 3: Staleness & Temporal Dynamics
    # -------------------------------------------------------------
    print("Analyzing Experiment 3...")
    exp3_staleness = exp3["stalenessCurve"]
    exp3_bias = exp3["temporalBias"]

    # Analyze temporal bias scenario (fresh low conf vs stale high conf)
    bias_total = len(exp3_bias)
    unver_unresolved = len([t for t in exp3_bias if t["unverifiedConflictResult"] == "unknown"]) / bias_total
    ver_unresolved = len([t for t in exp3_bias if t["verifiedConflictResult"] == "unknown"]) / bias_total
    ver_fresh_wins = len([t for t in exp3_bias if t["verifiedFreshResolution"] == "yes"]) / bias_total

    exp3_summary = {
        "scenario_unverified_unresolved_rate": unver_unresolved,
        "scenario_verified_conflict_unresolved_rate": ver_unresolved,
        "scenario_verified_fresh_override_rate": ver_fresh_wins,
    }

    # Group staleness curve by ageHours
    stale_grouped = {}
    for r in exp3_staleness:
        age = r["ageHours"]
        if age not in stale_grouped:
            stale_grouped[age] = []
        stale_grouped[age].append(r)

    stale_curve_summary = []
    for age in sorted(stale_grouped.keys()):
        trials = stale_grouped[age]
        acc = len([t for t in trials if t["isCorrect"]]) / len(trials)
        stale_curve_summary.append({
            "age_hours": age,
            "accuracy": acc,
            "flipped_rate": len([t for t in trials if t["wasFlipped"]]) / len(trials)
        })
    exp3_summary["staleness_curve"] = stale_curve_summary

    # Plot Fig 3: Staleness Accuracy Decay
    fig, ax = plt.subplots(figsize=(8, 5))
    ages = [r["age_hours"] for r in stale_curve_summary]
    accs = [r["accuracy"] * 100 for r in stale_curve_summary]
    flips = [r["flipped_rate"] * 100 for r in stale_curve_summary]

    ax.plot(ages, accs, marker="o", color="#1f77b4", label="Fusion Accuracy against Real Ground Truth")
    ax.plot(ages, flips, marker="x", linestyle="--", color="#d62728", label="Cumulative Ground-Truth Shift Rate")

    ax.set_xlabel("Observation Age (Hours)")
    ax.set_ylabel("Percentage (%)")
    ax.set_title("Temporal Staleness: Impact of Facility Status Drift on Accuracy")
    ax.set_ylim(0, 105)
    ax.grid(True)
    ax.legend(loc="center right")

    plt.tight_layout()
    fig3_path = os.path.join(RESULTS_DIR, "fig3_staleness_sensitivity.png")
    plt.savefig(fig3_path)
    plt.close()
    print(f"Saved {fig3_path}")

    # -------------------------------------------------------------
    # 4. Experiment 4: Dropout & Arrival Latency
    # -------------------------------------------------------------
    print("Analyzing Experiment 4...")
    exp4_dropout = exp4["dropout"]
    exp4_arrival = exp4["arrivalTimeline"]

    # Group dropout by pDrop
    pdrop_grouped = {}
    for r in exp4_dropout:
        p = r["pDrop"]
        if p not in pdrop_grouped:
            pdrop_grouped[p] = []
        pdrop_grouped[p].append(r)

    dropout_summary = []
    for p in sorted(pdrop_grouped.keys()):
        trials = pdrop_grouped[p]
        tot = len(trials)
        dropout_summary.append({
            "pDrop": p,
            "mean_sources": float(np.mean([t["activeSourceCount"] for t in trials])),
            "correct_rate": len([t for t in trials if t["isCorrect"]]) / tot,
            "incorrect_rate": len([t for t in trials if t["isIncorrect"]]) / tot,
            "unresolved_rate": len([t for t in trials if t["isUnresolved"]]) / tot,
        })

    # Group arrival timeline by stepTime
    arr_grouped = {}
    for r in exp4_arrival:
        st = r["stepTime"]
        if st not in arr_grouped:
            arr_grouped[st] = []
        arr_grouped[st].append(r)

    arrival_summary = []
    for st in sorted(arr_grouped.keys()):
        trials = arr_grouped[st]
        tot = len(trials)
        arrival_summary.append({
            "stepTime_minutes": st,
            "mean_active_sources": float(np.mean([t["activeSources"] for t in trials])),
            "accuracy": len([t for t in trials if t["isCorrect"]]) / tot,
            "unresolved_rate": len([t for t in trials if t["isUnresolved"]]) / tot,
            "conflict_rate": len([t for t in trials if t["conflict"]]) / tot,
        })

    exp4_summary = {
        "dropout_summary": dropout_summary,
        "arrival_summary": arrival_summary,
    }

    # Plot Fig 4: Dropout & Arrival Convergence
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5.5))

    p_vals = [r["pDrop"] * 100 for r in dropout_summary]
    corr_p = [r["correct_rate"] * 100 for r in dropout_summary]
    err_p = [r["incorrect_rate"] * 100 for r in dropout_summary]
    unres_p = [r["unresolved_rate"] * 100 for r in dropout_summary]

    ax1.plot(p_vals, corr_p, marker="o", color="#2ca02c", label="Correct Resolution")
    ax1.plot(p_vals, err_p, marker="v", color="#d62728", label="Incorrect (Error)")
    ax1.plot(p_vals, unres_p, marker="s", color="#1f77b4", label="Unresolved (Held)")

    ax1.set_xlabel("Source Dropout Probability (%)")
    ax1.set_ylabel("Outcome Rate (%)")
    ax1.set_title("Graceful Degradation vs Random Source Dropout")
    ax1.set_ylim(-5, 105)
    ax1.grid(True)
    ax1.legend(loc="center left")

    t_vals = [r["stepTime_minutes"] for r in arrival_summary]
    t_acc = [r["accuracy"] * 100 for r in arrival_summary]
    t_unres = [r["unresolved_rate"] * 100 for r in arrival_summary]
    t_conf = [r["conflict_rate"] * 100 for r in arrival_summary]

    ax2.plot(t_vals, t_acc, marker="o", color="#2ca02c", label="Decision Accuracy")
    ax2.plot(t_vals, t_unres, marker="s", color="#1f77b4", label="Unresolved Rate")
    ax2.plot(t_vals, t_conf, marker="^", color="#ff7f0e", label="Conflict Detected Rate")

    ax2.set_xlabel("Elapsed Ingestion Time (Minutes)")
    ax2.set_ylabel("Rate (%)")
    ax2.set_title("Asynchronous Arrival: Decision Evolution Over Time")
    ax2.set_ylim(-5, 105)
    ax2.grid(True)
    ax2.legend(loc="center right")

    plt.tight_layout()
    fig4_path = os.path.join(RESULTS_DIR, "fig4_dropout_sensitivity.png")
    plt.savefig(fig4_path)
    plt.close()
    print(f"Saved {fig4_path}")

    # -------------------------------------------------------------
    # 5. Experiment 5: Confidence Calibration & Reliability Diagram
    # -------------------------------------------------------------
    print("Analyzing Experiment 5 (Calibration & Brier Score)...")
    # Rule #4: CRITICAL INTEGRITY RULE: do NOT describe any confidence score as a
    # calibrated probability unless you actually evaluate calibration.
    
    cal_conf_groups = {"HIGH": [], "MEDIUM": [], "LOW": [], "UNKNOWN": []}
    for r in cal:
        lbl = r["confidenceLabel"]
        if lbl in cal_conf_groups:
            cal_conf_groups[lbl].append(r)

    calibration_table = []
    total_resolved = len(cal)
    squared_errors = []
    ece_weighted_errors = []

    nominal_map = {"HIGH": 1.0, "MEDIUM": 0.7, "LOW": 0.4, "UNKNOWN": 0.1}

    for lbl in ["HIGH", "MEDIUM", "LOW", "UNKNOWN"]:
        trials = cal_conf_groups[lbl]
        count = len(trials)
        if count == 0:
            continue
        empirical_p = sum(t["isCorrect"] for t in trials) / count
        nominal_p = nominal_map[lbl]
        calibration_error = abs(empirical_p - nominal_p)

        # Standard error of empirical proportion
        se = np.sqrt(empirical_p * (1 - empirical_p) / count) if count > 1 else 0.0

        for t in trials:
            # Brier component
            squared_errors.append((nominal_p - t["isCorrect"]) ** 2)

        ece_weighted_errors.append((count / total_resolved) * calibration_error)

        calibration_table.append({
            "confidence_label": lbl,
            "sample_count": count,
            "sample_share": count / total_resolved,
            "nominal_probability": nominal_p,
            "empirical_accuracy": empirical_p,
            "std_error": float(se),
            "ci_95_low": float(max(0.0, empirical_p - 1.96 * se)),
            "ci_95_high": float(min(1.0, empirical_p + 1.96 * se)),
            "calibration_gap": float(empirical_p - nominal_p),
            "absolute_error": float(calibration_error),
        })

    brier_score = float(np.mean(squared_errors))
    ece = float(sum(ece_weighted_errors))
    mce = float(max(row["absolute_error"] for row in calibration_table))

    calibration_analysis = {
        "total_evaluated_claims": total_resolved,
        "brier_score": brier_score,
        "expected_calibration_error_ece": ece,
        "maximum_calibration_error_mce": mce,
        "verdict": "UNBOUNDED_HEURISTIC_RANKING (Not a calibrated probability)",
        "explanation": "Heuristic confidence levels reflect discrete ordinal source prioritization weights rather than statistically calibrated probabilities. The empirical accuracy deviates significantly from nominal scores, yielding an ECE of {:.3f} and Brier score of {:.3f}.".format(ece, brier_score),
        "calibration_table": calibration_table,
    }
    save_json(calibration_analysis, "calibration_analysis.json")

    # Plot Fig 5: Reliability Diagram / Calibration Curve
    fig, ax = plt.subplots(figsize=(8, 6))

    nom_vals = [r["nominal_probability"] for r in calibration_table]
    emp_vals = [r["empirical_accuracy"] for r in calibration_table]
    err_lows = [r["empirical_accuracy"] - r["ci_95_low"] for r in calibration_table]
    err_highs = [r["ci_95_high"] - r["empirical_accuracy"] for r in calibration_table]
    labels = [r["confidence_label"] for r in calibration_table]

    # Perfect calibration reference line
    ax.plot([0, 1], [0, 1], "k--", label="Perfect Calibration (y = x)")

    # Scatter with error bars
    ax.errorbar(nom_vals, emp_vals, yerr=[err_lows, err_highs], fmt="o", color="#d62728",
                ecolor="#d62728", elinewidth=2, capsize=5, markersize=8,
                label=f"MedReach Heuristic Confidence\n(Brier={brier_score:.3f}, ECE={ece:.3f})")

    # Annotate labels
    for i, lbl in enumerate(labels):
        ax.annotate(f"{lbl}\n(N={calibration_table[i]['sample_count']})",
                    xy=(nom_vals[i], emp_vals[i]),
                    xytext=(nom_vals[i] - 0.05, emp_vals[i] + 0.05),
                    fontsize=9, weight="bold")

    ax.set_xlabel("Nominal Heuristic Confidence (p_nominal from rankingService)")
    ax.set_ylabel("Empirical Accuracy P(Correct | Confidence)")
    ax.set_title("Reliability Diagram: Calibration of MedReach Heuristic Confidence")
    ax.set_xlim(-0.05, 1.05)
    ax.set_ylim(-0.05, 1.05)
    ax.grid(True)
    ax.legend(loc="lower right")

    plt.tight_layout()
    fig5_path = os.path.join(RESULTS_DIR, "fig5_calibration_curve.png")
    plt.savefig(fig5_path)
    plt.close()
    print(f"Saved {fig5_path}")

    # -------------------------------------------------------------
    # 6. Confusion Matrix Generation (Exp 1 + Exp 2 Aggregate)
    # -------------------------------------------------------------
    print("Generating Confusion Matrix...")
    # Rows: Ground Truth ("yes", "no")
    # Columns: Decision ("yes", "no", "unknown / held")
    cm = {
        "yes": {"yes": 0, "no": 0, "unknown": 0},
        "no": {"yes": 0, "no": 0, "unknown": 0},
    }

    # Evaluate across all 12,000 trials of Exp 1
    for t in exp1:
        gt = t["groundTruth"]
        res = t["resolvedCapability"]
        cm[gt][res] += 1

    # Save CSV
    cm_csv_path = os.path.join(RESULTS_DIR, "confusion_matrix.csv")
    with open(cm_csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["GroundTruth", "Resolved_Yes", "Resolved_No", "Resolved_Unknown_Held"])
        writer.writerow(["True_Yes", cm["yes"]["yes"], cm["yes"]["no"], cm["yes"]["unknown"]])
        writer.writerow(["True_No", cm["no"]["yes"], cm["no"]["no"], cm["no"]["unknown"]])
    print(f"Saved {cm_csv_path}")

    # Plot Fig 6: Confusion Matrix Heatmap
    fig, ax = plt.subplots(figsize=(7, 5))
    cm_matrix = np.array([
        [cm["yes"]["yes"], cm["yes"]["no"], cm["yes"]["unknown"]],
        [cm["no"]["yes"], cm["no"]["no"], cm["no"]["unknown"]],
    ])
    
    im = ax.imshow(cm_matrix, cmap="Blues")

    # Add text labels
    for i in range(2):
        for j in range(3):
            val = cm_matrix[i, j]
            pct = val / np.sum(cm_matrix[i, :]) * 100
            color = "white" if val > cm_matrix.max() / 2 else "black"
            ax.text(j, i, f"{val}\n({pct:.1f}%)", ha="center", va="center", color=color, fontweight="bold")

    ax.set_xticks(range(3))
    ax.set_yticks(range(2))
    ax.set_xticklabels(["Resolved 'Yes'", "Resolved 'No'", "Unresolved / Held"], fontsize=10)
    ax.set_yticklabels(["True 'Yes'", "True 'No'"], fontsize=10)
    ax.set_title("Fusion Resolution Confusion Matrix (Exp 1: N=12,000)")
    ax.set_ylabel("Ground Truth Status")
    ax.set_xlabel("MedReach Fusion Decision")
    plt.colorbar(im, ax=ax)

    plt.tight_layout()
    fig6_path = os.path.join(RESULTS_DIR, "fig6_confusion_matrix.png")
    plt.savefig(fig6_path)
    plt.close()
    print(f"Saved {fig6_path}")

    # -------------------------------------------------------------
    # 7. Experiment 6: Field-Level Fusion Summary
    # -------------------------------------------------------------
    print("Analyzing Experiment 6 (Field-Level Fusion)...")
    field_tot = len(field)
    phone_conflicted = [t for t in field if t["isPhoneConflicted"]]
    phone_detected = [t for t in phone_conflicted if t["phoneConflictDetected"]]
    phone_correct = [t for t in field if t["phoneValueCorrect"]]

    spec_conflicted = [t for t in field if t["isSpecConflicted"]]
    spec_detected = [t for t in spec_conflicted if t["specConflictDetected"]]
    spec_correct = [t for t in field if t["specCorrect"]]

    field_summary = {
        "total_field_trials": field_tot,
        "phone": {
            "conflict_scenarios": len(phone_conflicted),
            "conflict_detection_rate": len(phone_detected) / len(phone_conflicted),
            "overall_accuracy": len(phone_correct) / field_tot,
            "unresolved_rate": len([t for t in field if not t["phoneResolved"]]) / field_tot,
        },
        "specialties": {
            "conflict_scenarios": len(spec_conflicted),
            "conflict_detection_rate": len(spec_detected) / len(spec_conflicted),
            "overall_accuracy": len(spec_correct) / field_tot,
            "unresolved_rate": len([t for t in field if not t["specResolved"]]) / field_tot,
        }
    }

    # -------------------------------------------------------------
    # Master Summary Compilation
    # -------------------------------------------------------------
    master_summary = {
        "experiment_id": "EXP-PROV-2026-10-24",
        "description": "MedReach Provenance and Conflicting-Claim Fusion Evaluation against Synthetic Ground Truth",
        "environment": {
            "node_version": "v24.22.1",
            "python_version": "3.11.8",
            "numpy_version": np.__version__,
            "matplotlib_version": matplotlib.__version__,
            "random_seed": 20261024,
        },
        "code_artifacts_tested": [
            "backend/src/services/facilityClaimFusion.js",
            "backend/src/services/hospitalFieldFusion.js",
            "backend/src/config/constants.js",
            "backend/src/models/DataSource.js",
            "backend/src/models/FacilitySourceClaim.js",
            "backend/src/models/HospitalFieldClaim.js",
        ],
        "experiment1_source_count_disagreement": exp1_summary,
        "experiment2_trust_mix": exp2_summary,
        "experiment3_temporal_dynamics": exp3_summary,
        "experiment4_dropout_and_arrival": exp4_summary,
        "experiment5_confidence_calibration": calibration_analysis,
        "experiment6_structured_fields": field_summary,
    }

    save_json(master_summary, "summary_metrics.json")
    print("Master summary metrics successfully exported to summary_metrics.json.")

if __name__ == "__main__":
    main()
