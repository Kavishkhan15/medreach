# Paper outline — proposed MedReach study

[Documentation](../docs/README.md) · [Project overview](../README.md)

**Working title:** *An Empirical Evaluation of Responsive Web Design Frameworks in MedReach.* This is an outline, not a completed empirical paper.

The inherited research framing references Almeida & Sousa (2026), *Security Risks in Responsive Web Design Frameworks*. Verify the bibliography, source claims and venue requirements before submission. Distinguish implemented tools, local product QA, archival measurements and future research results throughout.

## Abstract guidance

Describe three active Next.js frontends (Bootstrap, Tailwind, Skeleton) using a shared Express/MongoDB backend. State the measured axes and actual sample only after collection. Do not call CSS the sole controlled variable: component implementations, Bootstrap's local core copy, responsive behavior and intentional UI differences require disclosure. Omit uncollected participant results, placeholder risk grades and unsupported security conclusions.

## 1. Introduction

Research question, healthcare-directory context and motivation. Treat similarity of shared-backend security as a hypothesis to test. Define each contribution supported by an available artifact.

## 2. Related work

Responsive frameworks, frontend/backend security, dependencies, privacy, accessibility and usability. Verify cited primary sources and distinguish historical vulnerabilities from currently patched dependencies.

## 3. Methodology

- Pin commit, lockfile, Node/Next/React/framework versions and build-time public configuration.
- Document the shared backend, datasets, provenance rules, authorization and distinct frontend implementations.
- Define route/task equivalence using [parity scope](../docs/PARITY_VERIFICATION.md), not just route names or successful builds.
- Describe implemented [evaluation tools](../evaluation/README.md) and any separately executed scans.
- Present the proposed risk formula with measured input provenance, normalization, weights, missing-data policy and sensitivity analysis. Current inputs are placeholders.
- Specify the [proposed participant study](../user-study/README.md), ethics determination, sample rationale and analysis before recruitment.
- Explain the limited React SSR [probe](../probe-react/README.md).

## 4. Results — populate from evidence

- Security: actual scan/audit/authorization evidence, exact versions and limits.
- Privacy: per-route third-party traffic and cookie behavior, including hosted configuration.
- Accessibility: automated findings and manual assistive-technology observations.
- Performance: current per-route timings and aggregate bundle sizes reported separately. [Historical figures](../docs/RESULTS-prelim.md) are not current release measurements.
- Submission latency: [local evidence](../docs/latency-verification.md) separates earlier simulated inline SMTP waits from the current durable-outbox workflow. Neither is a framework ranking or hosted latency guarantee.
- Composite scores: include only after measured inputs replace placeholders.
- Usability: include only after actual approved participant collection.

[Release QA](../docs/release-qa.md) is product regression evidence, not a substitute for these research results.

## 5. Discussion

Interpret measured effects with uncertainty. Discuss shared-stack effects, implementation confounders and differences between provider capability and verified current availability. Avoid inferring framework security or causality from bundle ratios or zero known audit vulnerabilities.

## 6. Threats to validity

Single application, three framework variants, shared backend, uncontrolled component differences, patched versions, data/source freshness, incomplete live integration verification, synthetic SMTP timings and limited sample size.

## 7. Conclusion and future work

Summarize only established findings. List remaining scans, hosted tests and participant study separately. Append reproducibility details, scoring inputs and approved study materials; never publish credentials, private tracking tokens or identifiable participant data.
