# Frontend parity scope

[Documentation](README.md) · [Project overview](../README.md)

Bootstrap is the reference for common product behavior. Each frontend retains
its own framework styles and components. Successful builds do not prove
identical interactions or isolate CSS as the only research variable.

## Shared workflows

Discovery/detail/maps; provider applications and approval; common login;
organisation-scoped provider administration; standard/emergency bed requests;
normal/urgent blood requests and blood donation; ambulance bookings; jobs and
applications; reference tracking; user history and grounded assistant actions.

Loading, true empty, failure and targeted Retry behavior must remain distinct.
The homepage and dashboard now publish successful resources independently.

## Intentional differences

- Bootstrap has local manual credential handover, generated password visibility
  and copy controls. The six tests in `provider-manual-credentials.spec.js`
  target that implementation; Tailwind/Skeleton keep invitation administration.
- Skeleton provides an additional career-tracking copy/manual-selection control.
- Existing Bootstrap-specific navbar, footer and demo-video regression tests
  are explicitly scoped; shared navigation/responsive journeys cover all three.
- Bootstrap aliases its local `_core`; the other variants use the workspace
  core. Homepage orchestration is deliberately shared.

## Verification ownership

[Release QA](release-qa.md) owns current counts, commands and limitations.
[Research plan](MedReach_Corrected_Plan.md) explains experimental confounds.
Historical crawler/build totals are not current test results.

Crawler execution, Google OAuth, in-app notification inboxes, User Admin pages
and `/admin/operations` are retired. Keep maps, email, provider approvals,
stored provenance and the main `/admin` dashboard.
