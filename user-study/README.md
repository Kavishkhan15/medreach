# User study (usability + accessibility)

Between-subjects: each participant tests **one** variant (avoids learning effects). N ≥ 30 (≈10/variant), mixed tech-savvy/non-tech, ages 18–60, including 3–5 participants with visual impairments.

## ⚠️ IRB / ethics is on the critical path — file in Week 1

This involves **human subjects**, so unlike the qualitative source paper (whose IRB statement was "Not applicable"), this study is **not exempt**. You need ethics-committee approval + informed consent **before** recruiting. If approval is slow, build everything IRB-ready and run the moment it lands — do **not** cut the study; it is the human-centered novelty the paper lacks.

- `protocol/` — IRB application, informed-consent form, recruitment script, the 5 standardized task flows
- `instruments/` — SUS (10-item) + NASA-TLX questionnaires
- **participant data is gitignored** (see repo `.gitignore`) — never commit recordings or raw PII

## Tasks (all variants identical)
1. Find nearest hospital via search + filters
2. Open a hospital profile, find the emergency contact number
3. Register + save a hospital to Quick Access
4. Find + read a first-aid guide
5. (Admin) update bed availability

## Metrics
Task completion time · error rate · SUS · NASA-TLX · post-test interview themes.
Analysis: ANOVA / Kruskal–Wallis across the three variants (plan §8).
