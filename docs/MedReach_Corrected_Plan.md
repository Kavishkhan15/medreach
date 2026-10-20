# MedReach — research plan and implementation boundary

Updated 2026-10-03. This document is a proposed research design, not a release-status report or a completed study. Current product evidence belongs in [Release QA](release-qa.md); archived scaffolding measurements belong in [Preliminary results](RESULTS-prelim.md).

## 1. Research context

The inherited plan references Fernando Almeida and Carlos Sousa (2026), *Security Risks in Responsive Web Design Frameworks*, *Digital* 6(1), 26, DOI `10.3390/digital6010026`. Its framing describes qualitative risk classifications and a proposed empirical extension. Verify the original bibliography and attributed claims before publication; this documentation update did not independently review the external paper.

## 2. Proposed research question

With common backend and deployment controls, how do MedReach's Bootstrap, Tailwind and Skeleton implementations differ in security, privacy, accessibility, performance and usability?

The current implementations do not make CSS the sole controlled variable. Record differing markup, React components, interaction code, compiled assets and intentional UI differences before drawing framework-level conclusions.

## 3. Intended contributions and present status

| Intended contribution | Present boundary |
| --- | --- |
| Reproducible multi-axis measurement pipeline | Bundle tools, dependency summary, scoring and aggregation scripts exist; full scan/privacy/accessibility automation remains proposed. |
| Composite RWD Security Risk Score | Runnable fixed-anchor formula with placeholder inputs; not empirically validated or a certification. |
| Reproducible dataset | Historical artifacts exist. Record provenance, exact commits/environments and collection methods for new data. |
| Human usability/accessibility study | Draft protocol/questionnaires exist; participant collection and ethics approval are not established. |
| Reactive-framework comparison | A React SSR escaping probe exists; it does not test all frameworks or browser exploitability. |

## 4. Hypotheses, not predetermined results

Shared backend and security configuration may produce similar application-security findings across variants. Dependency trees, build tooling, markup, interactions and maintenance may differ. Measure these rather than assuming a null result confirms a thesis.

Historical vulnerabilities must be distinguished from patched versions. A zero-vulnerability dependency report does not demonstrate absence of application weaknesses; likewise, package age alone does not establish exploitability. Record source-backed maintenance facts at collection time.

## 5. Proposed risk instrument

Implementation: [risk-score.js](../evaluation/scoring/risk-score.js).

```text
Risk(v) = sum(weight_i * normalized_risk_i), sum(weight_i) = 1
Safety(v) = 100 * (1 - Risk(v))
```

Eight dimensions are currently defined: XSS, dependencies, supply chain, CSP, SRI, configuration, maintenance and CSS attack surface. Normalization uses fixed anchors and equal default weights. The script's demo inputs and the aggregator's security inputs are placeholders.

Before empirical use, publish measured inputs and sources, justify normalization/weights, define missing-data treatment and evaluate sensitivity. The code outputs numeric safety scores; letter grades, empirical rankings and validation are not supplied by the current instrument. Do not treat placeholder CSP levels, CVEs or maintenance values as measurements of MedReach.

## 6. Current application architecture and parity

- Three active Next.js/React frontends use one Express/MongoDB backend; Node.js >=22.19.0 is required. Package manifests and the lockfile record installed versions.
- Frameworks are Bootstrap 5.3.3, Tailwind CSS 4 and Skeleton CSS 2.0.4.
- Bootstrap aliases `@medreach/core` to local `_core/`; Tailwind/Skeleton use the workspace core. JavaScript/component equivalence must be checked, not assumed.
- Real discovery data retains stored provenance and availability rules. Scraping verification/freshness badges are removed from the frontend. Unknown availability stays unknown; fixture data belongs only in isolated tests/studies.
- Password/session authentication, RBAC, private detailed tracking and transactional emails remain. Google OAuth and the in-app notification system are intentionally removed.
- Shared backend notification queuing reduces transport waits without changing frontend-specific business rules. See [latency scope](latency-verification.md).

[Variant guide](../variants/README.md) and [parity verification](PARITY_VERIFICATION.md) describe actual workflow coverage. Skeleton's career tracking copy/manual-selection control is an intentional difference. Successful builds or matching routes do not demonstrate functional or experimental identity.

## 7. Proposed four-axis evaluation

| Axis | Proposed measurement | Current tooling boundary |
| --- | --- | --- |
| Security | Authorized ZAP/manual XSS/CSRF tests, dependency review and headers | Dependency summary and product authorization tests exist; broader scans need separate evidence. |
| Privacy | Per-route external requests, cookies and information disclosure | Requires dedicated capture and review, including hosted cookie configuration. |
| Accessibility | Automated findings, keyboard/screen-reader navigation and contrast | Browser functional checks do not establish WCAG conformance. |
| Performance | Per-route LCP/INP/CLS, network profiles, layouts and assets | Bundle scripts aggregate built files; submission benchmark uses local MongoDB and simulated SMTP delay. |

See [evaluation commands and limitations](../evaluation/README.md). `eval:results` exists but emits placeholder security grades. `eval:all` masks errors in its bundle/audit segment and is not the deterministic release gate. Existing generated claims about identical JavaScript or absence of AI are not authoritative implementation facts.

## 8. Proposed participant study

Use the [draft study](../user-study/README.md) with institution-determined ethics review or exemption, completed consent, an isolated study instance, accessible accommodations and a documented sample rationale. A target of at least 30 participants is a proposal, not an achieved count or power calculation.

Tasks cover discovery, contact lookup, saved hospitals, career-reference tracking and assigned-staff availability observations. The first-aid route is absent; legacy direct bed-count mutation is not the current task. Keep synthetic observations out of product data and disable external production mail.

Specify outcomes, exclusions, missing-data handling and analysis before collection. Report sample sizes and uncertainty; do not infer participant usability from automated journeys.

## 9. Work sequence

1. Freeze the measured commit/build configuration and document variant differences.
2. Confirm the local product release gate and disclose remaining live integration checks.
3. Collect authorized security/privacy/accessibility/per-route performance evidence.
4. Replace scoring placeholders and assess validity/sensitivity.
5. Pilot and conduct the approved participant study.
6. Write the paper using traceable observations and explicit limitations.

The earlier 16-week team schedule was a planning estimate. It does not establish deployment, study completion or publication readiness.

## 10. Controlled security demonstrations

Any proposed CSS exfiltration or build-tool demonstration must use owned isolated instances, synthetic inputs and a documented approved scope. Do not introduce malicious dependencies into product builds or characterize known techniques as novel. Version-specific historical comparisons require their own retained evidence. MedReach's current application does not crawl external sites.

## 11. Paper and threats to validity

Use the [paper outline](../paper/outline.md). Venue choice and publication readiness depend on completed methods/results and external review, not the number of tools used.

Disclose the single application, three implementations, common backend, uncontrolled interaction differences, patched versions, source freshness, missing hosted measurements, simulated SMTP delay and participant sample limits. Preserve historical numbers with their original scope. Do not present local QA, placeholder grades or a focused SSR probe as a completed empirical comparison.
