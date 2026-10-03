# Draft task flows — MedReach usability study

For a proposed between-subjects study, randomly assign each participant one frontend. Complete ethics review, consent and piloting before collection. The variants share major workflows but are not identical implementations; record differences and use equivalent task inputs.

Use a dedicated study instance with approved isolated fixtures, prepared accounts and a known `CAR-...` reference. No real patient details, production data mutations or external mail are required. Facilitators should read agreed prompts without hints and record time, errors, path and success/partial/failure.

| # | Draft prompt | Success criterion |
| --- | --- | --- |
| 1 | "Find a hospital in [assigned locality] that lists an emergency department." | Opens the intended study provider and identifies source-backed capability. Does not equate capability with a free bed. |
| 2 | "Find that hospital's emergency contact number. If none is listed, tell us that." | Identifies the displayed emergency contact or correctly reports unknown/missing information. |
| 3 | "Sign in using this study account and save the hospital to Quick Access." | Save persists and appears in dashboard saved hospitals. |
| 4 | "Check the career application's status using the supplied reference." | Opens `/track`, selects Career request, enters `CAR-...` and reads the correct public status. No MongoDB document ID is used. |
| 5 | "As staff assigned to [study hospital], record ICU availability as limited, quantity 5." | Hospital workspace submits an append-only timestamped observation and the isolated API returns it. No legacy direct bed-count write or real availability claim. |

The earlier draft's first-aid task has no current implementation. Its direct admin bed-count task has been replaced with the existing assigned-staff observation flow. Task 5 uses synthetic study information only within the isolated study instance, never product directories.

## Facilitator preparation

- Verify the supplied provider has the required capability/contact evidence, and the staff account is assigned to it.
- Check permission-denied location behavior; the locality task remains possible without GPS.
- Choose a consistent stopping rule and think-aloud instruction before piloting; document partial outcomes rather than silently dropping them.
- After tasks, administer [SUS](../instruments/sus.md), [raw NASA-TLX](../instruments/nasa-tlx.md) and an interview.
- Review mobile widths and assistive technology accommodations in the pilot. Avoid reading clipboard data or recording credentials/private request links.

## Proposed interview prompts

1. What was easiest or hardest?
2. Which status, contact or privacy details were confusing?
3. Where did navigation or assistive technology prevent completion?
