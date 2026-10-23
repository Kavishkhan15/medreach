### Table 2: Workload Scaling and Stress Ramp on `GET /api/hospitals`

| Concurrency ($C$) | Stage | Total Requests | Throughput (req/s) | TP CV% | Median (ms) | p90 (ms) | p97.5 (ms) | p99 (ms) | Timeouts | Errors | Error Rate | Operational Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| $C=1$ | Baseline | 9,140 | 284.7 | 8.71% | 3.0 | 3.3 | 8.3 | 9.7 | 0 | 0 | 0.00% | Optimal |
| $C=5$ | Workload Ramp | 11,904 | 396.8 | 1.36% | 11.0 | 18.0 | 21.0 | 23.3 | 0 | 0 | 0.00% | Optimal |
| $C=10$ | Workload Ramp | 12,710 | 397.1 | 1.76% | 23.7 | 30.7 | 35.0 | 38.3 | 0 | 0 | 0.00% | Acceptable |
| $C=25$ | Workload Ramp | 11,873 | 395.8 | 1.49% | 62.3 | 70.3 | 76.0 | 78.3 | 0 | 0 | 0.00% | Acceptable |
| $C=50$ | Workload Ramp | 12,229 | 394.5 | 3.12% | 124.7 | 139.3 | 147.7 | 152.3 | 0 | 0 | 0.00% | Degraded/Saturated |
| $C=100$ | Controlled Stress | 3,851 | 385.1 | 0.00% | 260.0 | 278.0 | 290.0 | 297.0 | 0 | 0 | 0.00% | Degraded/Saturated |
| $C=200$ | Controlled Stress | 3,802 | 380.2 | 0.00% | 510.0 | 550.0 | 591.0 | 597.0 | 0 | 0 | 0.00% | Degraded/Saturated |
| $C=400$ | Controlled Stress | 3,954 | 395.4 | 0.00% | 982.0 | 1057.0 | 1091.0 | 1163.0 | 0 | 0 | 0.00% | Degraded/Saturated |
