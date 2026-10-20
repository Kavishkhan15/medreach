# Frontend variants

| Variant | Framework | Development port |
| --- | --- | --- |
| Bootstrap | Bootstrap 5 | 3000 |
| Tailwind | Tailwind CSS 4 | 3001 |
| Skeleton | Skeleton CSS 2 | 3002 |

All use Next.js/React and the shared Express API. Installed versions are recorded
in their package manifests and the root lockfile.

Bootstrap aliases `@medreach/core` to local `_core`; Tailwind and Skeleton use
the workspace package. Shared homepage loading logic is explicitly re-exported
by the Bootstrap mirror. Maintain both surfaces when changing common logic.

## Development

```sh
npm --workspace @medreach/variant-bootstrap run dev
npm --workspace @medreach/variant-tailwind run dev
npm --workspace @medreach/variant-skeleton run dev
npm run build:variants
```

Set `NEXT_PUBLIC_API_URL` before production builds. Optional
`MEDREACH_E2E_DIST_DIR` isolates test build output from normal development output.

## Product boundaries

Preserve each framework's own styling and layout. Shared behavior includes
backend data, authorization, request transitions, loading/error/empty states,
targeted retries and responsive navigation.

Bootstrap currently has local manual credential handover. Tailwind/Skeleton
retain email invitation controls. Skeleton's career tracking has an additional
copy/manual-selection action. Do not claim literal implementation identity.

Use the supplied branding consistently. Scraping verification badges, the ER
column in the System Admin hospital table, `/admin/operations`, Google OAuth
and in-app notification inboxes are retired. Maps, provider approvals, email and
the main `/admin` dashboard remain.

[Parity scope](../docs/PARITY_VERIFICATION.md) ·
[Verification](../docs/release-qa.md) ·
[Performance](../docs/latency-verification.md) ·
[Brand assets](../docs/branding.md) ·
[Research plan](../docs/MedReach_Corrected_Plan.md)
