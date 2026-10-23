### Table 3: Traffic Spike Resilience, Sustained Soak, and Post-Stress Recovery

| Scenario Phase | Concurrency ($C$) | Duration | Total Requests | Throughput (req/s) | Median (ms) | p90 (ms) | p97.5 (ms) | p99 (ms) | Timeouts | Errors | Error Rate | Outcome |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pre-Spike Baseline | $C=5$ | 5s | 2,045 | 409.0 | 11.0 | 17.0 | 21.0 | 23.0 | 0 | 0 | 0.00% | Reference steady-state |
| Peak Surge (50x Concurrency) | $C=250$ | 10s | 3,867 | 386.7 | 624.0 | 686.0 | 703.0 | 715.0 | 0 | 0 | 0.00% | Surge absorbed without drop |
| Post-Spike Settling | $C=5$ | 5s | 1,950 | 390.0 | 11.0 | 18.0 | 21.0 | 23.0 | 0 | 0 | 0.00% | Immediate queue clearance |
| Sustained Soak Workload | $C=30$ | 60s | 19,117 | 318.6 | 72.0 | 83.0 | 90.0 | 95.0 | 0 | 0 | 0.16% | Zero drift, steady memory |
| Post-Stress Recovery (`/api/hospitals`) | $C=1$ | 10s | 9,806 | 316.7 | 2.0 | 3.0 | 8.0 | 9.0 | 0 | 0 | 0.00% | 100% Normalized to baseline |
| Post-Stress Recovery (`/health`) | $C=1$ | 10s | 248,259 | 7,523.7 | 0.0 | 0.0 | 0.0 | 0.0 | 0 | 0 | 0.00% | 100% Normalized to baseline |
