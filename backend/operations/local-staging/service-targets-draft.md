# Draft operating targets — approval and measurement required

No service-level commitment is established by this document. Local synthetic traffic is a reproducibility check. Provider count, observation frequency, traffic distribution, hosting budget and support coverage must be agreed before release targets are adopted.

| Signal | Proposed initial review threshold | Action |
| --- | --- | --- |
| Readiness | One failed independent check | Record incident; verify next check and route persistent failure |
| Worker heartbeat | Existing configured stale-worker policy | Investigate missing role/replica and leased work |
| Directory errors | Any failure in isolated rehearsal | Fail the rehearsal; inspect response contract and logs |
| Directory p95 | Track baseline; no production threshold yet | Compare repeated equivalent datasets and hosted runs |
| Notification queue age | More than the approved emergency acknowledgement window | Investigate and escalate through configured duty coverage |
| Exhausted/uncertain notifications | Any occurrence | Human review; never assume delivery |
| Inventory freshness | Existing backend freshness policy | Withhold expired availability; prompt authorised re-verification |
| Backup age | Draft 24 hours | Alert; verify consistency and most recent restore evidence |
| Recovery age/time | Draft 24 hours / 60 minutes | Measure an isolated drill before approval |
| Retention | No approved deletion period | Preserve records; automatic cleanup disabled |

Release evidence must include two API replicas, multiple workers, representative data sizes, sustained load, restart and recovery tests, an isolated restore, real signed webhook verification in staging and a staffed escalation drill. Record p50/p95/p99, error rate, queue age, database pool pressure and observation lag. Never present a local throughput value as a clinical response guarantee.
