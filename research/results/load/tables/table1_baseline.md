### Table 1: Baseline Performance Reference (C=1, 10s Duration, 3 Repeated Runs)

| Target Endpoint | Requests (Total) | Throughput (Mean req/s) | TP StdDev | TP CV% | Median (p50 ms) | p90 (ms) | p97.5 (ms) | p99 (ms) | Timeouts | Errors | Error Rate | Statistical Validity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `GET /health` (Middleware) | 232,720 | 7,052.9 | 354.7 | 5.03% | 0.00 | 0.00 | 0.00 | 0.00 | 0 | 0 | 0.000% | Valid ($N=232,720 \gg 1,000$) |
| `GET /api/hospitals` (DB Query) | 9,140 | 284.7 | 24.8 | 8.71% | 3.00 | 3.33 | 8.33 | 9.67 | 0 | 0 | 0.000% | Valid ($N=9,140 \gg 1,000$) |

*Note on Percentiles: Percentiles p50, p90, p97.5, and p99 are extracted directly from autocannon's high-resolution HDR histogram JSON without interpolation error.*
