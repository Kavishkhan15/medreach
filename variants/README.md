# Framework variants

Three functionally **identical** builds of MedReach. The CSS framework is the only deliberately-varied factor; everything else (routes, API calls, content, backend, security config) is held constant.

| Dir | Framework | Ships JS components? | Owner |
|-----|-----------|----------------------|-------|
| `bootstrap/` | Bootstrap 5 | **Yes** (dropdowns, modals, tooltips) | M2 |
| `tailwind/`  | Tailwind CSS 4 | **No** — utility CSS only | M3 |
| `skeleton/`  | Skeleton CSS | **No** — minimal CSS, ~EOL | M4 |

## Parity rules (read before building — this protects the experiment)

1. **Same routes, same components, same API calls, same copy.** Diff between variants should be *styling/markup only*.
2. **Tailwind & Skeleton have no JS widgets.** Modals/dropdowns/search UI need added JS. **Use the same JS approach for both** (one headless lib, or one hand-rolled set) so you are not measuring your own glue code instead of the framework. Document the choice.
3. **The independent variable is "the framework's bundled component/JS philosophy,"** not "CSS." Markup/class structure will legitimately differ (semantic vs. utility vs. minimal) — that difference is *part of what you compare*, state it openly.
4. **Never fork the backend or security config per variant.** They live in `../backend`.

See plan §6.
