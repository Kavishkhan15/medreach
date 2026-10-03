# MedReach frontend parity

Bootstrap is the functional reference. Tailwind and Skeleton preserve their own
design systems while using the same backend APIs and authorization contracts.
Matching routes or successful builds do not prove complete functional parity.

## Shared journeys

- Hospital discovery/details, maps and contact/navigation actions.
- Guest emergency and signed-in standard bed requests, hospital review,
  information exchange, acceptance/rejection, completion, cancellation and expiry.
- Blood requests/donations, urgent blood, ambulance booking and tracking.
- Job and organization applications with public `CAR-...` references.
- Authentication, profile onboarding, recovery, verification and administration.
- Assistant actions, private detailed tracking and independent dashboard retries.

Career dashboard history exposes the reference with copy and tracking actions.
Skeleton's career tracking card also provides a copy action and manual-copy
fallback. Bootstrap and Tailwind tracking cards keep their existing behavior.
In-app notifications and Google OAuth are removed; all transactional emails,
email delivery history and controlled retries remain supported.

## Verification — 2026-10-03

All 247 backend tests, 112 offline crawler tests, three production builds and 87
Chromium journeys passed. The browser suite includes the former 66 journeys and
later regression coverage for failures, responsive navigation, references and
clipboard denial. No tests in the local backend/browser suites were skipped.

See [release QA](release-qa.md) for test scope, repeatable commands and live
deployment requirements. These results do not claim exhaustive interaction,
accessibility, production SMTP, remote CI or hosted-deployment verification.
