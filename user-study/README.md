# Proposed usability and accessibility study

This folder contains planning materials and draft questionnaires. No participant study or institutional ethics approval is established by the repository. Automated browser journeys in [Release QA](../docs/release-qa.md) are separate from human usability evidence.

Proposed design: between subjects, one assigned Bootstrap/Tailwind/Skeleton variant per participant to reduce learning effects. A target of at least 30 participants (about 10 per variant), mixed experience and accessibility needs is a recruitment proposal; determine the final sample through a documented study design and feasibility review.

## Before recruitment

- Obtain the institution's ethics review or documented exemption determination; do not assume either outcome.
- Complete the draft [consent form](protocol/consent-form.md), data-retention policy, researcher contacts and accommodations.
- Use an isolated study database with clearly identified study fixtures. Disable outbound production emails and never enter real patient information or publish invented hospital availability.
- Pilot all [task flows](protocol/task-flows.md) in every variant. Record functional differences, including Skeleton's career-reference copy control, rather than calling the interfaces identical.
- Keep participant records and recordings out of Git. Verify storage permissions, exclusions and deletion procedures before collection.

## Proposed tasks

1. Find a hospital matching a supplied locality and emergency capability.
2. Find its listed emergency contact or identify unavailable contact information.
3. Sign in to a prepared study account and save the hospital to Quick Access.
4. Look up a supplied public career application reference on `/track`.
5. As assigned hospital staff, record a timestamped facility availability observation in the isolated study environment.

First-aid guide navigation was removed from this draft because no current first-aid route/content was found. Legacy admin bed-count updates are not the current availability workflow. Do not change real provider data for study tasks.

## Proposed metrics and analysis

Record task completion time, errors, outcomes, SUS, raw NASA-TLX and interview themes. Specify success criteria, missing-data treatment, exclusions and analysis before collection. Choose comparisons based on the final design and observed assumptions; report uncertainty and sample limitations. The questionnaires contain no completed participant results.

See the [research plan](../docs/MedReach_Corrected_Plan.md) and [paper outline](../paper/outline.md).
