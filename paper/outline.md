# Paper Outline — MedReach

**Working title:** *Does the CSS Framework Matter? An Empirical, Multi-Axis Evaluation of Responsive Web Design Frameworks in a Controlled Application* — an empirical extension of Almeida & Sousa (2026).

Target: see plan §11. Format: IMRaD, ~15–20 pp. Every claim traces to an artifact in `evaluation/` or `data/`.

## Abstract (draft)
Almeida & Sousa (2026) qualitatively classified security risks across five responsive web design (RWD) frameworks and concluded that frontend security depends less on framework choice than on governance and maintenance. We test that conclusion **empirically**. We build MedReach, a hospital-services portal, as three functionally-identical variants (Bootstrap 5, Tailwind CSS 4, Skeleton) over a single shared backend and security configuration, so the CSS framework is the sole controlled variable. We evaluate each variant across four axes — security, privacy, accessibility, responsiveness — using automated scanners, manual penetration testing, and a composite **RWD Security Risk Score**, and run a between-subjects usability study (N=[..]). We find that app-level security is [≈ identical / …] across variants — consistent with the source paper's thesis — while measurable differences concentrate in dependency/supply-chain, maintenance, CSS attack surface, and CSS bundle size (a 25× range in our build). We contribute a reproducible measurement pipeline, the scoring instrument, and an open dataset.

## 1. Introduction
Problem, the gap Almeida & Sousa name (qualitative-only; excludes reactive frameworks), our RQ (plan §2), contributions (plan §3).

## 2. Related work
RWD frameworks; frontend security (XSS, CSP, SRI, supply chain); the source paper positioned as the direct predecessor; DevSecOps. Skills: `scientific-thinking-literature-review`, `scientific-thinking-scholar-evaluation`.

## 3. Methodology
- 3.1 Controlled application (shared backend = the constant; §6 architecture + the parity threat and how it's controlled).
- 3.2 The three variants and the reactive-framework probe.
- 3.3 Four-axis measurement pipeline (§7).
- 3.4 RWD Security Risk Score instrument (§5): dimensions, fixed-anchor normalization, weights + sensitivity analysis.
- 3.5 User study design (between-subjects, N, tasks, SUS/NASA-TLX, ANOVA/Kruskal–Wallis).
- 3.6 Threats to validity (patched versions, n=3, added-JS confound, single app).

## 4. Results
- 4.1 Security: ZAP, dependency CVEs, header grades, manual pen-test vs. Table 5 cells.
- 4.2 Privacy: third-party requests, cookies, CDN leakage.
- 4.3 Accessibility: axe/Lighthouse/WAVE + AT walkthrough.
- 4.4 Responsiveness: Core Web Vitals + **CSS/JS bundle size** (data captured — see `docs/RESULTS-prelim.md`).
- 4.5 Composite Risk Scores + sensitivity analysis.
- 4.6 Usability study outcomes.

## 5. Discussion
Does framework choice move the needle? Where the variance actually lives (deps/supply-chain/maintenance/CSS-surface, not app XSS). Reactive-framework probe → Limitation 2. Restate/qualify the source paper's governance thesis with numbers.

## 6. Threats to validity · 7. Conclusion & future work · Acknowledgements · References · Appendices (raw data, scoring formula, IRB materials)
