# Archived preliminary results — initial scaffolding

**Historical record, not current release evidence.** The earlier scaffold report recorded the figures below without a retained collection timestamp/commit in this document. They have not been remeasured during the documentation update. Current verification belongs in [Release QA](release-qa.md); current local submission timings belong in [Latency verification](latency-verification.md).

## Historical backend checks

The initial report recorded 7/7 backend tests and a local six-hospital smoke check covering list/search/geo, admin login, legacy bed updates and public alerts. These are early scope only. They do not describe current database-suite counts, provider coverage or current availability authorization. Legacy direct bed writes have been replaced in current workflows with timestamped assigned-staff observations.

## Historical aggregate build sizes

Reported command: `node evaluation/measure/bundles.mjs`.

| Variant | CSS raw | CSS gzip | JS raw | JS gzip |
| --- | ---: | ---: | ---: | ---: |
| Bootstrap 5 | 223.0 kB | 30.0 kB | 693.4 kB | 214.9 kB |
| Tailwind CSS 4 | 13.9 kB | 3.8 kB | 694.2 kB | 215.4 kB |
| Skeleton | 8.7 kB | 2.5 kB | 692.0 kB | 214.6 kB |

Correction: the reported raw CSS ratio is about 25.6× (223.0/8.7); the gzip ratio is 12× (30.0/2.5). The earlier text conflated these ratios. Similar aggregate JavaScript sizes do not demonstrate identical implementation or isolate CSS as the sole variable. These totals span build artifacts, not the bytes downloaded by a particular page.

## Historical dependency report

The scaffold report recorded one critical and one high vulnerability in an earlier shared toolchain, including Next.js 14.2.5 and PostCSS. It did not retain complete raw advisory evidence in this document. Do not attribute those findings to the currently installed build or infer a framework-specific causal result from the shared dependency graph. Consult the lockfile and current audit output.

Current audit evidence is linked from [Release QA](release-qa.md). A fresh raw audit must be checked for registry/report failures and advisory coverage. Dependency scans detect known package advisories; a source-level vulnerability can be reported when its affected package/version is in the advisory database. The historical claim that such bugs categorically cannot appear in `npm audit` was too broad.

## React rendering probe

The initial probe reported escaped text interpolation and raw output from `dangerouslySetInnerHTML`. [The probe](../probe-react/README.md) remains a server-rendered string comparison. It does not execute browser code or establish that all reactive frameworks have a safer security model than classic frameworks.

## Research work still requiring evidence

The repository's proposed ZAP/header/privacy/accessibility/Core Web Vitals measurements and participant study require separate traceable collection. Institutional ethics review/exemption and participant recruitment are not established by this report. [Evaluation limits](../evaluation/README.md), [research plan](MedReach_Corrected_Plan.md) and [paper outline](../paper/outline.md) distinguish implemented tools from future research.
