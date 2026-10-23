#!/usr/bin/env python3
"""
EXP-AOI: Age of Information (AoI) and Staleness Simulation
Deterministic, reproducible simulation of healthcare availability freshness
under realistic provider update behaviors and MedReach freshness contracts.

Target: MedReach Research (/home/anonymous/medreach)
Author: Antigravity (Experiment and Simulation Specialist)
"""

import sys
import os
import json
import csv
import math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Master Seed for Determinism
MASTER_SEED = 20261024

# Time horizon: 72 hours per replication, evaluated at 1-minute query intervals
SIM_HOURS = 72
SIM_MINUTES = SIM_HOURS * 60
QUERY_STEP_MIN = 1.0
NUM_QUERIES = int(SIM_MINUTES / QUERY_STEP_MIN)
REPLICATIONS_PER_SCENARIO = 50

# Pre-registered Candidate Staleness Thresholds (minutes)
CANDIDATE_THRESHOLDS = {
    "tau_10m": 10.0,    # FRESHNESS_THRESHOLDS_MS.RECENT
    "tau_30m": 30.0,    # CURRENT_AVAILABILITY_MAX_AGE_MS (Production Anchor)
    "tau_60m": 60.0,    # FRESHNESS_THRESHOLDS_MS.UPDATED_RECENTLY
    "tau_180m": 180.0,  # 3 Hours
    "tau_360m": 360.0   # FRESHNESS_THRESHOLDS_MS.STALE (6 Hours)
}

SWEEP_THRESHOLDS = np.linspace(1.0, 180.0, 60)

# Physical state space: 0: 'available', 1: 'limited', 2: 'unavailable'
STATE_NAMES = ["available", "limited", "unavailable"]

# CTMC Transition rates (per minute)
# Mean dwell times: available: 45 min, limited: 25 min, unavailable: 40 min
LAMBDA_AVAIL = 1.0 / 45.0
LAMBDA_LIM = 1.0 / 25.0
LAMBDA_UNAVAIL = 1.0 / 40.0


def simulate_physical_state_trajectory(rng, t_max):
    """
    Simulate ground truth physical capacity as a continuous-time Markov jump process.
    Returns jump times and state sequence.
    """
    jump_times = [0.0]
    states = [0]  # Start 'available'
    current_t = 0.0
    current_state = 0

    while current_t < t_max:
        if current_state == 0:  # available -> limited
            hold = rng.exponential(1.0 / LAMBDA_AVAIL)
            next_state = 1
        elif current_state == 1:  # limited -> available or unavailable (50/50)
            hold = rng.exponential(1.0 / LAMBDA_LIM)
            next_state = 0 if rng.random() < 0.5 else 2
        else:  # unavailable -> limited
            hold = rng.exponential(1.0 / LAMBDA_UNAVAIL)
            next_state = 1

        current_t += hold
        jump_times.append(current_t)
        states.append(next_state)
        current_state = next_state

    return np.array(jump_times), np.array(states)


def get_physical_state_at(jump_times, states, t):
    """Lookup physical state at arbitrary continuous time t."""
    idx = np.searchsorted(jump_times, t, side='right') - 1
    idx = max(0, min(idx, len(states) - 1))
    return states[idx]


def generate_updates(scenario_name, rng, t_max, jump_times, states):
    """
    Generate provider updates: generation time, propagation delay, drop decision,
    arrival time, and observed state.
    """
    gen_times = []
    delays = []
    dropped = []
    
    current_t = 0.0

    if scenario_name == "frequent_reliable":
        # Automated telemetry: Gaussian(mu=8m, sigma=1.5m), min 1m
        while current_t < t_max:
            dt = max(1.0, rng.normal(8.0, 1.5))
            current_t += dt
            if current_t > t_max:
                break
            gen_times.append(current_t)
            # LogNormal delay around 5 seconds (0.083 minutes)
            d = rng.lognormal(mean=-2.5, sigma=0.4)  # exp(-2.5) ~ 0.082 min ~ 4.9s
            delays.append(d)
            # Dropout p = 0.01
            dropped.append(rng.random() < 0.01)

    elif scenario_name == "infrequent_shift":
        # Shift-based manual logging: Uniform(90m, 150m)
        while current_t < t_max:
            dt = rng.uniform(90.0, 150.0)
            current_t += dt
            if current_t > t_max:
                break
            gen_times.append(current_t)
            # Truncated normal delay ~ 3 min
            d = max(0.5, rng.normal(3.0, 1.0))
            delays.append(d)
            # Dropout p = 0.05
            dropped.append(rng.random() < 0.05)

    elif scenario_name == "irregular_bursty":
        # Bursty: Gamma(shape=0.7, scale=42.8) -> mean 30 min, heavy-tailed
        while current_t < t_max:
            dt = max(0.5, rng.gamma(shape=0.7, scale=42.857))
            current_t += dt
            if current_t > t_max:
                break
            gen_times.append(current_t)
            # Exponential delay ~ 2 min
            d = rng.exponential(scale=2.0)
            delays.append(d)
            dropped.append(rng.random() < 0.08)

    elif scenario_name == "high_dropout":
        # Regular schedule (20 min) with two-state Markovian channel impairment
        in_impairment = False
        t_next_transition = rng.exponential(360.0) # Occasional impairment every ~6 hours
        
        while current_t < t_max:
            dt = max(2.0, rng.normal(20.0, 3.0))
            current_t += dt
            if current_t > t_max:
                break
            gen_times.append(current_t)
            
            # Check impairment transition
            if current_t >= t_next_transition:
                in_impairment = not in_impairment
                hold_time = rng.exponential(90.0) if in_impairment else rng.exponential(360.0)
                t_next_transition = current_t + hold_time

            p_drop = 0.85 if in_impairment else 0.10
            dropped.append(rng.random() < p_drop)
            d = max(0.2, rng.normal(2.5, 0.8))
            delays.append(d)

    elif scenario_name == "delayed_propagation":
        # Frequent updates at provider (15 min), but heavy crawler/ingest queue delay
        while current_t < t_max:
            dt = max(2.0, rng.normal(15.0, 2.5))
            current_t += dt
            if current_t > t_max:
                break
            gen_times.append(current_t)
            # Uniform delay between 15 and 45 minutes
            d = rng.uniform(15.0, 45.0)
            delays.append(d)
            dropped.append(rng.random() < 0.04)

    elif scenario_name == "diurnal_shift":
        # 24h cycle: handover peaks vs day vs night
        while current_t < t_max:
            tod_hours = (current_t % 1440.0) / 60.0  # hour of day 0..24
            if (7.0 <= tod_hours < 8.5) or (14.0 <= tod_hours < 15.5) or (21.0 <= tod_hours < 22.5):
                mu_interval = 12.0
            elif 23.0 <= tod_hours or tod_hours < 6.5:
                mu_interval = 120.0  # night lull
            else:
                mu_interval = 35.0   # normal daytime
            
            dt = max(1.0, rng.exponential(scale=mu_interval))
            current_t += dt
            if current_t > t_max:
                break
            gen_times.append(current_t)
            d = rng.uniform(1.0, 4.0)
            delays.append(d)
            dropped.append(rng.random() < 0.06)
            
    else:
        raise ValueError(f"Unknown scenario {scenario_name}")

    gen_times = np.array(gen_times)
    delays = np.array(delays)
    dropped = np.array(dropped)
    arr_times = gen_times + delays

    # Filter out dropped updates from arrival into system
    valid_mask = ~dropped
    v_gen_times = gen_times[valid_mask]
    v_arr_times = arr_times[valid_mask]

    # Sample physical state at generation time for each valid update
    obs_states = np.array([get_physical_state_at(jump_times, states, tg) for tg in v_gen_times])

    # Initial baseline update at t=0
    v_gen_times = np.insert(v_gen_times, 0, 0.0)
    v_arr_times = np.insert(v_arr_times, 0, 0.0)
    obs_states = np.insert(obs_states, 0, states[0])

    return v_gen_times, v_arr_times, obs_states, gen_times, dropped


def evaluate_trajectory(query_times, jump_times, states, v_gen_times, v_arr_times, obs_states):
    """
    For a given set of query sample instants, evaluate:
    - True physical state
    - Age of Information (AoI)
    - Displayed state under each candidate threshold
    - Error classification
    """
    n_queries = len(query_times)
    true_states = np.empty(n_queries, dtype=int)
    aoi = np.empty(n_queries, dtype=float)
    
    # Pre-calculate true states
    for i, t in enumerate(query_times):
        true_states[i] = get_physical_state_at(jump_times, states, t)

    # For each query instant, find latest update that arrived: v_arr_times <= t
    # Since v_arr_times is not necessarily sorted (delays vary), we compute running cumulative max of gen_time
    # or sort updates by arrival time.
    sort_idx = np.argsort(v_arr_times)
    sorted_arr = v_arr_times[sort_idx]
    sorted_gen = v_gen_times[sort_idx]
    sorted_obs = obs_states[sort_idx]

    # Note: If an older update arrives AFTER a newer update, the platform uses the update with the highest gen_time!
    # So we maintain running best gen_time and corresponding obs_state up to each arrival.
    running_max_gen = np.empty(len(sorted_gen), dtype=float)
    running_best_obs = np.empty(len(sorted_obs), dtype=int)

    curr_max_gen = -1.0
    curr_best_obs = -1
    for k in range(len(sorted_gen)):
        if sorted_gen[k] > curr_max_gen:
            curr_max_gen = sorted_gen[k]
            curr_best_obs = sorted_obs[k]
        running_max_gen[k] = curr_max_gen
        running_best_obs[k] = curr_best_obs

    # For each query time, find last arrived index
    arr_indices = np.searchsorted(sorted_arr, query_times, side='right') - 1

    last_gen_times = running_max_gen[arr_indices]
    last_obs_states = running_best_obs[arr_indices]

    aoi = query_times - last_gen_times

    results_per_threshold = {}
    for name, tau in CANDIDATE_THRESHOLDS.items():
        # Displayed state: obs_state if aoi <= tau else -1 ("unknown")
        is_known = (aoi <= tau)
        disp_state = np.where(is_known, last_obs_states, -1)
        
        # Mismatch: known and disp_state != true_states
        mismatch = is_known & (disp_state != true_states)
        
        # Critical Phantom Availability: disp_state == 0 ('available') and true_states == 2 ('unavailable')
        phantom_avail = is_known & (disp_state == 0) & (true_states == 2)

        # False Unavailability: disp_state == 2 ('unavailable') and true_states == 0 ('available')
        false_unavail = is_known & (disp_state == 2) & (true_states == 0)

        results_per_threshold[name] = {
            "known_frac": float(np.mean(is_known)),
            "stale_frac": float(np.mean(~is_known)),
            "mismatch_rate_overall": float(np.mean(mismatch)),
            "mismatch_rate_when_known": float(np.sum(mismatch) / max(1, np.sum(is_known))),
            "phantom_avail_rate": float(np.mean(phantom_avail)),
            "false_unavail_rate": float(np.mean(false_unavail))
        }

    # Fine threshold sweep for Pareto curve
    sweep_coverage = []
    sweep_mismatch = []
    sweep_phantom = []
    for tau in SWEEP_THRESHOLDS:
        is_k = (aoi <= tau)
        mism = is_k & (last_obs_states != true_states)
        phan = is_k & (last_obs_states == 0) & (true_states == 2)
        sweep_coverage.append(float(np.mean(is_k)))
        sweep_mismatch.append(float(np.sum(mism) / max(1, np.sum(is_k))))
        sweep_phantom.append(float(np.mean(phan)))

    return {
        "aoi_mean": float(np.mean(aoi)),
        "aoi_median": float(np.median(aoi)),
        "aoi_std": float(np.std(aoi)),
        "aoi_p25": float(np.percentile(aoi, 25)),
        "aoi_p75": float(np.percentile(aoi, 75)),
        "aoi_p90": float(np.percentile(aoi, 90)),
        "aoi_p95": float(np.percentile(aoi, 95)),
        "aoi_p99": float(np.percentile(aoi, 99)),
        "aoi_max": float(np.max(aoi)),
        "threshold_metrics": results_per_threshold,
        "sweep_coverage": sweep_coverage,
        "sweep_mismatch": sweep_mismatch,
        "sweep_phantom": sweep_phantom,
        "raw_aoi_sample": aoi[::10].tolist() if n_queries > 0 else []  # Subsample for storage
    }


def run_experiment():
    print("=" * 70)
    print("MEDREACH EXP-AOI: AGE OF INFORMATION & STALENESS SIMULATION")
    print(f"Master Seed: {MASTER_SEED} | Horizon: {SIM_HOURS}h | Replications: {REPLICATIONS_PER_SCENARIO}")
    print("=" * 70)

    out_dir = "/home/anonymous/medreach/research/results/aoi"
    os.makedirs(out_dir, exist_ok=True)

    query_times = np.arange(0.0, SIM_MINUTES, QUERY_STEP_MIN)

    scenarios = [
        "frequent_reliable",
        "infrequent_shift",
        "irregular_bursty",
        "high_dropout",
        "delayed_propagation",
        "diurnal_shift"
    ]

    all_scenario_results = {}
    csv_rows = []
    
    # Store timeseries for plotting Figure 1
    sample_trajectories = {}

    for s_idx, sc_name in enumerate(scenarios):
        print(f"\n[Scenario {s_idx + 1}/{len(scenarios)}] Simulating: {sc_name}...")
        sc_results = []
        
        for r in range(REPLICATIONS_PER_SCENARIO):
            # Deterministic, unique seed per scenario and replication
            rep_seed = MASTER_SEED + s_idx * 1000 + r
            rng = np.random.default_rng(rep_seed)

            # 1. Simulate physical state trajectory
            jump_times, states = simulate_physical_state_trajectory(rng, SIM_MINUTES + 120.0)

            # 2. Simulate provider updates and arrivals
            v_gen_times, v_arr_times, obs_states, gen_times, dropped = generate_updates(
                sc_name, rng, SIM_MINUTES + 60.0, jump_times, states
            )

            # 3. Evaluate AoI and error metrics across queries
            metrics = evaluate_trajectory(query_times, jump_times, states, v_gen_times, v_arr_times, obs_states)
            sc_results.append(metrics)

            # Save the first replication for visual sample
            if r == 0:
                # Save a 12-hour slice (e.g. from 24h to 36h = 1440m to 2160m)
                t_mask = (query_times >= 1440.0) & (query_times <= 2160.0)
                q_slice = query_times[t_mask]
                true_slice = [get_physical_state_at(jump_times, states, t) for t in q_slice]
                # evaluate aoi slice
                sort_idx = np.argsort(v_arr_times)
                s_arr = v_arr_times[sort_idx]
                s_gen = v_gen_times[sort_idx]
                curr_max = -1.0
                r_max = np.empty(len(s_gen))
                for k in range(len(s_gen)):
                    if s_gen[k] > curr_max:
                        curr_max = s_gen[k]
                    r_max[k] = curr_max
                arr_indices = np.searchsorted(s_arr, q_slice, side='right') - 1
                aoi_slice = q_slice - r_max[arr_indices]

                sample_trajectories[sc_name] = {
                    "time_hours": ((q_slice - 1440.0) / 60.0).tolist(),
                    "aoi_minutes": aoi_slice.tolist(),
                    "true_state": true_slice
                }

        # Aggregate metrics across replications
        aoi_means = [m["aoi_mean"] for m in sc_results]
        aoi_medians = [m["aoi_median"] for m in sc_results]
        aoi_p90s = [m["aoi_p90"] for m in sc_results]
        aoi_p95s = [m["aoi_p95"] for m in sc_results]
        aoi_p99s = [m["aoi_p99"] for m in sc_results]

        agg = {
            "scenario": sc_name,
            "replications": REPLICATIONS_PER_SCENARIO,
            "aoi_mean_mean": float(np.mean(aoi_means)),
            "aoi_mean_ci95": float(1.96 * np.std(aoi_means) / math.sqrt(REPLICATIONS_PER_SCENARIO)),
            "aoi_median_median": float(np.median(aoi_medians)),
            "aoi_median_iqr": [float(np.percentile(aoi_medians, 25)), float(np.percentile(aoi_medians, 75))],
            "aoi_p90_mean": float(np.mean(aoi_p90s)),
            "aoi_p95_mean": float(np.mean(aoi_p95s)),
            "aoi_p99_mean": float(np.mean(aoi_p99s)),
            "thresholds": {}
        }

        # Threshold aggregations
        for t_name, tau_val in CANDIDATE_THRESHOLDS.items():
            known_vals = [m["threshold_metrics"][t_name]["known_frac"] for m in sc_results]
            stale_vals = [m["threshold_metrics"][t_name]["stale_frac"] for m in sc_results]
            mismatch_known_vals = [m["threshold_metrics"][t_name]["mismatch_rate_when_known"] for m in sc_results]
            phantom_vals = [m["threshold_metrics"][t_name]["phantom_avail_rate"] for m in sc_results]
            false_unavail_vals = [m["threshold_metrics"][t_name]["false_unavail_rate"] for m in sc_results]

            agg["thresholds"][t_name] = {
                "tau_minutes": tau_val,
                "coverage_mean": float(np.mean(known_vals)),
                "stale_mean": float(np.mean(stale_vals)),
                "mismatch_when_known_mean": float(np.mean(mismatch_known_vals)),
                "mismatch_when_known_median": float(np.median(mismatch_known_vals)),
                "phantom_avail_mean": float(np.mean(phantom_vals)),
                "false_unavail_mean": float(np.mean(false_unavail_vals))
            }

            # CSV record
            csv_rows.append({
                "scenario": sc_name,
                "threshold_name": t_name,
                "tau_minutes": tau_val,
                "aoi_mean": round(float(np.mean(aoi_means)), 2),
                "aoi_median": round(float(np.median(aoi_medians)), 2),
                "aoi_p90": round(float(np.mean(aoi_p90s)), 2),
                "aoi_p95": round(float(np.mean(aoi_p95s)), 2),
                "coverage_pct": round(float(np.mean(known_vals)) * 100, 2),
                "stale_pct": round(float(np.mean(stale_vals)) * 100, 2),
                "mismatch_pct_when_known": round(float(np.mean(mismatch_known_vals)) * 100, 2),
                "phantom_avail_pct": round(float(np.mean(phantom_vals)) * 100, 3)
            })

        # Average Pareto curves across replications
        sweep_cov_mean = np.mean([m["sweep_coverage"] for m in sc_results], axis=0).tolist()
        sweep_mis_mean = np.mean([m["sweep_mismatch"] for m in sc_results], axis=0).tolist()
        sweep_pha_mean = np.mean([m["sweep_phantom"] for m in sc_results], axis=0).tolist()

        agg["pareto_sweep"] = {
            "tau_values": SWEEP_THRESHOLDS.tolist(),
            "coverage_mean": sweep_cov_mean,
            "mismatch_mean": sweep_mis_mean,
            "phantom_mean": sweep_pha_mean
        }

        all_scenario_results[sc_name] = agg

        print(f"  -> AoI Mean: {agg['aoi_mean_mean']:.2f} min (±{agg['aoi_mean_ci95']:.2f}) | Median: {agg['aoi_median_median']:.2f} min | P95: {agg['aoi_p95_mean']:.2f} min")
        print(f"  -> At Production Anchor (tau=30m): Coverage={agg['thresholds']['tau_30m']['coverage_mean']*100:.1f}%, Stale={agg['thresholds']['tau_30m']['stale_mean']*100:.1f}%, Status Error (when known)={agg['thresholds']['tau_30m']['mismatch_when_known_mean']*100:.2f}%, Phantom Avail={agg['thresholds']['tau_30m']['phantom_avail_mean']*100:.2f}%")

    # 1. Save raw metrics JSON
    json_path = os.path.join(out_dir, "raw_metrics.json")
    with open(json_path, "w") as f:
        json.dump(all_scenario_results, f, indent=2)
    print(f"\n[Saved] Raw metrics JSON: {json_path}")

    # 2. Save CSV summary
    csv_path = os.path.join(out_dir, "scenario_summary.csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "scenario", "threshold_name", "tau_minutes", "aoi_mean", "aoi_median", "aoi_p90", "aoi_p95",
            "coverage_pct", "stale_pct", "mismatch_pct_when_known", "phantom_avail_pct"
        ])
        writer.writeheader()
        writer.writerows(csv_rows)
    print(f"[Saved] Scenario Summary CSV: {csv_path}")

    # 3. Save Sample Trajectories CSV
    sample_csv_path = os.path.join(out_dir, "timeseries_sample.csv")
    with open(sample_csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["scenario", "rel_time_hours", "aoi_minutes", "true_state"])
        for sc, data in sample_trajectories.items():
            for t_h, a_m, st in zip(data["time_hours"], data["aoi_minutes"], data["true_state"]):
                writer.writerow([sc, round(t_h, 3), round(a_m, 2), STATE_NAMES[st]])
    print(f"[Saved] Time series Sample CSV: {sample_csv_path}")

    # 4. Compute and Save Time-to-Stale and Stale Duration Metrics
    time_to_stale_rows = []
    for sc_name in scenarios:
        # Re-compute time-to-stale statistics across arrivals
        for t_name, tau_val in CANDIDATE_THRESHOLDS.items():
            fresh_lifetimes = []
            stale_durations = []
            
            # Using replication 0 as a representative sample
            rep_seed = MASTER_SEED + scenarios.index(sc_name) * 1000
            rng = np.random.default_rng(rep_seed)
            jump_times, states = simulate_physical_state_trajectory(rng, SIM_MINUTES + 120.0)
            v_gen_times, v_arr_times, obs_states, gen_times, dropped = generate_updates(
                sc_name, rng, SIM_MINUTES + 60.0, jump_times, states
            )
            
            # Sort by arrival
            s_idx = np.argsort(v_arr_times)
            s_arr = v_arr_times[s_idx]
            s_gen = v_gen_times[s_idx]
            
            for k in range(len(s_arr) - 1):
                delay = s_arr[k] - s_gen[k]
                eff_fresh = max(0.0, tau_val - delay)
                fresh_lifetimes.append(eff_fresh)
                
                # Duration spent stale before next update arrives
                next_arr = s_arr[k+1]
                stale_start = s_gen[k] + tau_val
                stale_dur = max(0.0, next_arr - max(s_arr[k], stale_start))
                stale_durations.append(stale_dur)

            time_to_stale_rows.append({
                "scenario": sc_name,
                "threshold_name": t_name,
                "tau_minutes": tau_val,
                "mean_effective_fresh_lifetime_min": round(float(np.mean(fresh_lifetimes)), 2) if fresh_lifetimes else 0.0,
                "median_effective_fresh_lifetime_min": round(float(np.median(fresh_lifetimes)), 2) if fresh_lifetimes else 0.0,
                "mean_stale_blind_duration_min": round(float(np.mean(stale_durations)), 2) if stale_durations else 0.0,
                "median_stale_blind_duration_min": round(float(np.median(stale_durations)), 2) if stale_durations else 0.0,
                "pct_updates_arriving_already_stale": round(float(np.mean(np.array(fresh_lifetimes) == 0.0)) * 100, 2) if fresh_lifetimes else 0.0
            })

    tts_csv_path = os.path.join(out_dir, "time_to_stale.csv")
    with open(tts_csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "scenario", "threshold_name", "tau_minutes",
            "mean_effective_fresh_lifetime_min", "median_effective_fresh_lifetime_min",
            "mean_stale_blind_duration_min", "median_stale_blind_duration_min",
            "pct_updates_arriving_already_stale"
        ])
        writer.writeheader()
        writer.writerows(time_to_stale_rows)
    print(f"[Saved] Time to Stale CSV: {tts_csv_path}")

    # 5. Generate Figures
    generate_figures(out_dir, all_scenario_results, sample_trajectories)

    return all_scenario_results


def generate_figures(out_dir, all_scenario_results, sample_trajectories):
    print("\n--- Generating Publication-Quality Figures (Matplotlib) ---")
    plt.rcParams.update({
        'font.size': 10,
        'font.family': 'sans-serif',
        'axes.grid': True,
        'grid.alpha': 0.3,
        'figure.dpi': 300
    })

    # -------------------------------------------------------------
    # Figure 1: AoI Trajectories (Sawtooth Comparison)
    # -------------------------------------------------------------
    fig, axes = plt.subplots(3, 1, figsize=(10, 8), sharex=True)
    fig.suptitle("Figure 1: Age of Information (AoI) Dynamics (12-Hour Operational Window)", fontsize=13, fontweight='bold')

    # Plot 3 contrasting scenarios
    contrast_scenarios = [
        ("frequent_reliable", "Scenario 1: Frequent Reliable (Automated / IoT)", "tab:blue"),
        ("diurnal_shift", "Scenario 6: Diurnal Shift (Handover Peaks vs. Night Lull)", "tab:purple"),
        ("high_dropout", "Scenario 4: High Drop-out (Blackout / Connectivity Impairment)", "tab:red")
    ]

    for ax, (sc_key, title, color) in zip(axes, contrast_scenarios):
        data = sample_trajectories[sc_key]
        t = data["time_hours"]
        aoi = data["aoi_minutes"]
        
        ax.plot(t, aoi, label="Age of Information $\\Delta(t)$", color=color, lw=1.5)
        # Add horizontal lines for 10m, 30m, 60m thresholds
        ax.axhline(10.0, color='gray', linestyle=':', alpha=0.7, label='10m (Recent)')
        ax.axhline(30.0, color='black', linestyle='--', alpha=0.9, label='30m (MedReach Anchor)')
        ax.axhline(60.0, color='orange', linestyle='-.', alpha=0.7, label='60m (Shift)')
        ax.fill_between(t, 30.0, aoi, where=(np.array(aoi) > 30.0), color='salmon', alpha=0.25, label='Stale Area (> 30m)')

        ax.set_title(title, fontsize=11, fontweight='bold')
        ax.set_ylabel("AoI (minutes)")
        ax.set_ylim(0, max(120, max(aoi) * 1.1))
        ax.legend(loc='upper right', framealpha=0.9, fontsize=8, ncol=2)

    axes[-1].set_xlabel("Operational Time (Hours elapsed from 24h baseline)")
    plt.tight_layout()
    fig1_path = os.path.join(out_dir, "fig1_aoi_trajectories.png")
    fig.savefig(fig1_path)
    plt.close(fig)
    print(f"[Chart] Fig 1 saved: {fig1_path}")

    # -------------------------------------------------------------
    # Figure 2: Empirical CDF of AoI across all 6 scenarios
    # -------------------------------------------------------------
    fig, ax = plt.subplots(figsize=(8, 5.5))
    fig.suptitle("Figure 2: Empirical CDF of Age of Information $\\Delta(t)$ by Scenario", fontsize=12, fontweight='bold')

    colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b"]
    labels = {
        "frequent_reliable": "1: Frequent Reliable (Telemetry)",
        "infrequent_shift": "2: Infrequent Shift (Manual 2h)",
        "irregular_bursty": "3: Irregular Bursty (Surges)",
        "high_dropout": "4: High Drop-out (Blackout)",
        "delayed_propagation": "5: Delayed Ingestion (Scraper)",
        "diurnal_shift": "6: Diurnal Handover Cycle"
    }

    x_vals = np.linspace(0, 180, 500)

    for idx, (sc_key, c) in enumerate(zip(all_scenario_results.keys(), colors)):
        res = all_scenario_results[sc_key]
        # Reconstruct CDF from pareto sweep (where coverage = fraction with aoi <= tau)
        tau_grid = res["pareto_sweep"]["tau_values"]
        cov_grid = res["pareto_sweep"]["coverage_mean"]
        ax.plot(tau_grid, cov_grid, label=labels[sc_key], color=c, lw=2.0)

    # Highlight MedReach 30-min anchor
    ax.axvline(30.0, color='black', linestyle='--', lw=2.0, label='30 min (MedReach Anchor)')
    ax.axvline(10.0, color='gray', linestyle=':', lw=1.5, label='10 min (Strict Recent)')
    ax.axvline(60.0, color='darkorange', linestyle='-.', lw=1.5, label='60 min (1-Hour Shift)')

    ax.set_ylabel(r"Cumulative Probability $P(\Delta(t) \leq \tau)$")
    ax.set_xlabel(r"Age of Information Threshold $\tau$ (minutes)")
    ax.set_xlim(0, 150)
    ax.set_ylim(0, 1.02)
    ax.legend(loc='lower right', framealpha=0.9, fontsize=8.5)
    plt.tight_layout()
    fig2_path = os.path.join(out_dir, "fig2_aoi_ecdf.png")
    fig.savefig(fig2_path)
    plt.close(fig)
    print(f"[Chart] Fig 2 saved: {fig2_path}")

    # -------------------------------------------------------------
    # Figure 3: Pareto Frontier: Coverage vs. Status Mismatch Error Rate
    # -------------------------------------------------------------
    fig, ax = plt.subplots(figsize=(8, 5.5))
    fig.suptitle("Figure 3: Pareto Trade-off: Information Coverage vs. Status Error Rate", fontsize=12, fontweight='bold')

    for sc_key, c in zip(all_scenario_results.keys(), colors):
        res = all_scenario_results[sc_key]
        cov = np.array(res["pareto_sweep"]["coverage_mean"]) * 100
        err = np.array(res["pareto_sweep"]["mismatch_mean"]) * 100
        ax.plot(cov, err, label=labels[sc_key], color=c, lw=2.0)

        # Mark the 30-min anchor point on each curve
        # Find index closest to 30 min
        idx_30 = np.argmin(np.abs(np.array(res["pareto_sweep"]["tau_values"]) - 30.0))
        ax.scatter(cov[idx_30], err[idx_30], color=c, edgecolors='black', s=80, zorder=5)

    # Annotate anchor concept
    ax.annotate("30-min MedReach Anchor\n(Marker on each curve)", 
                xy=(75, 18), xytext=(45, 25),
                arrowprops=dict(facecolor='black', shrink=0.05, width=1, headwidth=6),
                bbox=dict(boxstyle="round,pad=0.3", fc="lightyellow", ec="gray", lw=1),
                fontsize=8.5)

    ax.set_xlabel("Active Information Coverage (%) [Status != Unknown]")
    ax.set_ylabel("Status Mismatch Error Rate (%) [When Status is Displayed]")
    ax.set_xlim(0, 102)
    ax.set_ylim(0, 35)
    ax.legend(loc='upper left', framealpha=0.9, fontsize=8)
    plt.tight_layout()
    fig3_path = os.path.join(out_dir, "fig3_error_vs_coverage_pareto.png")
    fig.savefig(fig3_path)
    plt.close(fig)
    print(f"[Chart] Fig 3 saved: {fig3_path}")

    # -------------------------------------------------------------
    # Figure 4: Critical Safety Risk: Phantom Availability Rate
    # -------------------------------------------------------------
    fig, ax = plt.subplots(figsize=(9, 5))
    fig.suptitle("Figure 4: Critical Safety Risk: Phantom Availability Rate by Threshold", fontsize=12, fontweight='bold')

    # Grouped bar chart comparing the candidate thresholds across scenarios
    sc_keys = list(all_scenario_results.keys())
    x = np.arange(len(sc_keys))
    width = 0.16

    t_keys = ["tau_10m", "tau_30m", "tau_60m", "tau_180m", "tau_360m"]
    t_labels = ["10 min", "30 min (Anchor)", "60 min", "180 min", "360 min"]
    bar_colors = ["#2ca02c", "#1f77b4", "#ff7f0e", "#d62728", "#7f7f7f"]

    for i, (tk, tl, bc) in enumerate(zip(t_keys, t_labels, bar_colors)):
        rates = [all_scenario_results[sk]["thresholds"][tk]["phantom_avail_mean"] * 100 for sk in sc_keys]
        ax.bar(x + (i - 2) * width, rates, width, label=tl, color=bc, alpha=0.85, edgecolor='black', linewidth=0.5)

    ax.set_ylabel("Phantom Availability Rate (%) [Displayed Open, Physical Full]")
    ax.set_xticks(x)
    ax.set_xticklabels([f"S{i+1}: {k.replace('_', ' ').title()}" for i, k in enumerate(sc_keys)], rotation=20, ha='right', fontsize=8.5)
    ax.legend(title="Staleness Threshold", loc='upper left', framealpha=0.9, fontsize=8)
    plt.tight_layout()
    fig4_path = os.path.join(out_dir, "fig4_phantom_availability_risk.png")
    fig.savefig(fig4_path)
    plt.close(fig)
    print(f"[Chart] Fig 4 saved: {fig4_path}")

    # -------------------------------------------------------------
    # Figure 5: Multi-metric Summary Dashboard (AoI Distribution Boxplot)
    # -------------------------------------------------------------
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.8))
    fig.suptitle("Figure 5: Statistical Age Distribution and Anchor Effectiveness", fontsize=12, fontweight='bold')

    # Subplot 1: P50, P90, P95 AoI by scenario
    means = [all_scenario_results[sk]["aoi_mean_mean"] for sk in sc_keys]
    medians = [all_scenario_results[sk]["aoi_median_median"] for sk in sc_keys]
    p95s = [all_scenario_results[sk]["aoi_p95_mean"] for sk in sc_keys]

    x_indices = np.arange(len(sc_keys))
    ax1.plot(x_indices, medians, 'o-', color='navy', label='Median (p50) AoI', lw=2)
    ax1.plot(x_indices, means, 's--', color='teal', label='Mean AoI', lw=1.5)
    ax1.plot(x_indices, p95s, '^:', color='crimson', label='95th Percentile AoI', lw=1.5)
    ax1.axhline(30.0, color='black', linestyle='--', alpha=0.7, label='30m Anchor')

    ax1.set_xticks(x_indices)
    ax1.set_xticklabels([f"S{i+1}" for i in range(len(sc_keys))], fontsize=9)
    ax1.set_ylabel("Age of Information (minutes)")
    ax1.set_title("(a) AoI Central Tendency and Tail by Scenario", fontsize=10.5)
    ax1.legend(loc='upper left', fontsize=8)

    # Subplot 2: Breakdown of MedReach 30-min Anchor Status
    # Categories: Accurate, Mismatch, Unknown (Safe Stale)
    cov_30 = np.array([all_scenario_results[sk]["thresholds"]["tau_30m"]["coverage_mean"] for sk in sc_keys]) * 100
    stale_30 = np.array([all_scenario_results[sk]["thresholds"]["tau_30m"]["stale_mean"] for sk in sc_keys]) * 100
    err_when_known = np.array([all_scenario_results[sk]["thresholds"]["tau_30m"]["mismatch_when_known_mean"] for sk in sc_keys])
    mismatch_overall = cov_30 * err_when_known
    accurate_overall = cov_30 - mismatch_overall

    ax2.bar(x_indices, accurate_overall, label='Accurate Display', color='#2ca02c', alpha=0.85)
    ax2.bar(x_indices, mismatch_overall, bottom=accurate_overall, label='Status Mismatch', color='#d62728', alpha=0.85)
    ax2.bar(x_indices, stale_30, bottom=accurate_overall + mismatch_overall, label='Safe Unknown (Stale Fallback)', color='#7f7f7f', alpha=0.6)

    ax2.set_xticks(x_indices)
    ax2.set_xticklabels([f"S{i+1}" for i in range(len(sc_keys))], fontsize=9)
    ax2.set_ylabel("Query Instants Percentage (%)")
    ax2.set_title("(b) MedReach 30-min Anchor Query Outcome Partition", fontsize=10.5)
    ax2.legend(loc='lower left', fontsize=7.5)

    plt.tight_layout()
    fig5_path = os.path.join(out_dir, "fig5_time_to_stale_distributions.png")
    fig.savefig(fig5_path)
    plt.close(fig)
    print(f"[Chart] Fig 5 saved: {fig5_path}")
    print("All figures successfully rendered.")


if __name__ == "__main__":
    run_experiment()
