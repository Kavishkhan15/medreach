# MedReach documentation

[Project overview](../README.md) · [Screenshot gallery](screenshots/README.md)

MedReach has three independent Next.js frontends, one Express API and an
existing MongoDB dataset. This hub separates implementation references,
operational instructions, dated verification and proposed research.

## Start here

| I want to… | Read |
| --- | --- |
| Run the project | [Quick start](../README.md#run-locally), then [backend](../backend/README.md) and [frontend variants](../variants/README.md) |
| Understand the implementation | [Architecture and code map](architecture.md) · [Diagram Gallery](diagrams/README.md) |
| Find an endpoint or permission boundary | [API reference](api.md), [security](security.md) |
| Understand MongoDB records and relationships | [Database Schema & Dictionary](database-schema.md) · [Data model](data-model.md) · [Stored dataset](stored-data.md) |
| Deploy the existing stack or configure email | [Vercel, Railway, Atlas and email](deployment.md) |
| Run tests safely or inspect actual results | [Testing guide](testing.md) · [Release verification](release-qa.md) |
| Understand speed improvements | [Performance evidence](latency-verification.md) |
| Review the interface | [Current screenshots and capture method](screenshots/README.md) |

## Product workflows

| Guide | Covers |
| --- | --- |
| [Services and maps](SERVICES_AND_MAP_GUIDE.md) | Discovery, blood, ambulance, Careers and public reference tracking |
| [Bed-request lifecycle](bed-request-lifecycle.md) | Standard/emergency requests, patient/staff actions, expiry and private tracking |
| [Healthcare assistant](ai-assistant.md) | Directory grounding, intents, optional external reply providers and fallbacks |
| [Frontend parity](PARITY_VERIFICATION.md) | Common behavior and intentional Bootstrap/Tailwind/Skeleton differences |
| [Brand assets](branding.md) | Canonical artwork, public copies, favicon handling and documentation media |

Provider applications are embedded in the homepage. System Admin review and
activation precede Provider Admin access. Backend permissions—not navigation
visibility—enforce organisation scope. The three active roles are
`system_admin`, `provider_admin` and `user`.

## Operations and data protection

- [Security](security.md): permissions, account lifecycle, sessions and notification safeguards.
- [Privacy](privacy.md): personal/request data, tracking, external services and retention limits.
- [Local MongoDB](../LOCAL_MONGODB_SETUP.md): workstation recovery history, canonical directory and service configuration.
- [Local provider accounts](../LOCAL_PROVIDER_ACCOUNTS.md): login IDs, assignment boundaries and guarded credential handover; no passwords published.
- [Stored dataset](stored-data.md): historical provenance is preserved; no acquisition crawler runs.

The recovered workstation database at `/home/anonymous/medreach/data` is not a
test fixture. Database files, credentials and personal information must remain
outside version control. Do not reset/reseed it to reproduce a guide.

## Research and historical evidence

| Document | Status |
| --- | --- |
| [Evaluation tools](../evaluation/README.md) | Reproducible hosted measurements and their limits |
| [Hosted evaluation](../evaluation/HOSTED_RESULTS.md) | Dated Vercel/Railway observations, Lighthouse scores and passive security evidence |
| [Research plan](MedReach_Corrected_Plan.md) | Proposed study; not completed empirical findings |
| [Paper outline](../paper/outline.md) | Proposed structure and evidence requirements |
| [User study](../user-study/README.md) | Draft protocol; participant recruitment/ethics approval not established |
| [Task flows](../user-study/protocol/task-flows.md) | Proposed isolated study tasks |
| [Consent form](../user-study/protocol/consent-form.md) | Draft requiring institutional completion and review |
| [SUS](../user-study/instruments/sus.md) / [NASA-TLX](../user-study/instruments/nasa-tlx.md) | Draft instruments; no participant results |
| [React rendering probe](../probe-react/README.md) | Narrow server-rendered escaping experiment |
| [Assistant smoke tool](../test-bot/README.md) | Manual reachability/reply check with limited assertions |
| [Preliminary results](RESULTS-prelim.md) | Archived scaffold measurements |
| [Hospital fusion report](Hospital_Data_Fusion_Verification_Report.md) | Historical acquisition-era evidence; not current runtime architecture |

## Keep the documentation current

Each fact has one primary home:

- **Code structure:** architecture; route contracts: API; storage relationships: data model.
- **Operational procedure:** deployment/local setup; controls: security/privacy.
- **Current regression evidence:** Release QA, with commit, date, executed command and limitations.
- **Measurements:** performance/evaluation, with collection method and scope.
- **Historical decisions/results:** explicitly dated archives; routine changes remain in Git history.

When a feature changes, update its owner guide and links in the same change.
Do not copy a dated test count into every guide or promote a proposed experiment
to a completed result. Review screenshots after interface changes; public-page
captures must contain no credentials, patient records or private account details.

### Intentional removals

Crawler execution, Google OAuth, the in-app notification inbox, User Admin and
`/admin/operations` are retired. Stored provenance, maps, email, provider
approvals and the main `/admin` dashboard remain. Do not recreate removed
features merely because an archived report mentions them.
