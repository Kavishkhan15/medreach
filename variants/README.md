# Framework variants

Three active Next.js frontends use one Express/MongoDB backend. They aim for equivalent healthcare workflows while preserving their own design systems. Matching routes and successful builds do not prove equivalent interactions or make CSS the sole experimental variable.

| Dir | Framework | Ships JS components? | Owner |
|-----|-----------|----------------------|-------|
| `bootstrap/` | Bootstrap 5.3.3 | Bootstrap provides JS components; inspect actual imports when measuring | M2 |
| `tailwind/`  | Tailwind CSS 4 | Application React implements interactions | M3 |
| `skeleton/`  | Skeleton CSS 2.0.4 | Application React implements interactions | M4 |

All use Next.js 15.5.24, React/React DOM 18.3.1 and Node.js >=22.19.0. Bootstrap resolves `@medreach/core` to its local `_core/`; Tailwind and Skeleton use the workspace package. Shared API contracts do not imply identical component source or JavaScript output.

## Parity rules (read before building — this protects the experiment)

1. Preserve submission, tracking, authorization, error/retry and contact behavior in all three variants. Check actual journeys when modifying one frontend.
2. Preserve distinct markup, styling and responsive layouts. Skeleton's career tracking copy/manual-selection control is an intentional addition; do not claim the interfaces are literally identical.
3. Record implementation differences before using these builds in a controlled framework comparison. React interactions, local core copies, bundles and accessibility can introduce confounding variables.
4. The shared backend and its authorization rules live in `../backend`; do not weaken them for a variant.

In-app notifications and Google OAuth are intentionally removed. Transactional emails and password/session authentication remain. Submission email concurrency is shared backend behavior, not a frontend-specific optimization.

## Verification and development

From the repository root, run `npm run build:variants` and `npm run test:e2e` with the isolated database configuration in [Release QA](../docs/release-qa.md). Development commands are `npm --workspace @medreach/variant-bootstrap run dev` (3000), `@medreach/variant-tailwind` (3001) and `@medreach/variant-skeleton` (3002). Set `NEXT_PUBLIC_API_URL` before production builds.

See [parity scope](../docs/PARITY_VERIFICATION.md), [deployment configuration](../docs/deployment.md), [latency measurements](../docs/latency-verification.md) and the [proposed research plan](../docs/MedReach_Corrected_Plan.md).
