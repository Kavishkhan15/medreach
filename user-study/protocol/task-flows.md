# Task Flows — MedReach Usability Study

Between-subjects: each participant is randomly assigned **one** variant (Bootstrap / Tailwind / Skeleton) and never sees the others (avoids learning effects). Facilitator reads each task verbatim; do not hint. Record start/stop time, errors (wrong clicks, dead-ends, backtracks), and completion (success / partial / fail).

All variants are **functionally identical**, so every task is valid on every variant. Target site: the assigned variant's deployed URL.

| # | Task (read to participant) | Success criterion | Data captured |
|---|---|---|---|
| 1 | "Find the nearest hospital to your current location that has an **Emergency** department." | Reaches a hospital profile with Emergency listed, via search/filter or 📍 Nearest | time, errors, path |
| 2 | "On that hospital's page, find and read out the **emergency contact number**." | Reads the correct `emergencyPhone` | time, errors |
| 3 | "Create an account, then **save** this hospital to your Quick Access list." | Registers + save confirms | time, errors, form friction |
| 4 | "Find the **first-aid guide** for [assigned emergency] and read the first step." | Reaches the guide content | time, errors |
| 5 | *(admin credentials provided)* "Log in as staff and **update the bed availability** for [hospital] to 5." | Bed value persists to 5 | time, errors |

## Facilitator notes
- Randomise variant assignment; aim for ~10 participants/variant (N ≥ 30).
- Encourage think-aloud ("tell me what you're looking at / expecting").
- If a participant is stuck > 3 min, mark partial and move on.
- After tasks: administer SUS then NASA-TLX (`../instruments/`), then the 5-min interview.

## Interview prompts (semi-structured)
1. What was easiest / hardest?
2. Did anything look untrustworthy or confusing? (probes perceived security/privacy)
3. For AT users: where did navigation break down?
