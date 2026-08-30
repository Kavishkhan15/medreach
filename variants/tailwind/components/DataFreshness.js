import { freshnessMeta, freshnessPhrase } from "@medreach/core";
import { toneClass, statusPill } from "../lib/tone";

// Shows an honest freshness signal: "Updated 4 min ago" + a tone chip. Missing
// timestamps render as "Availability unknown" rather than a fabricated state.
export default function DataFreshness({ timestamp, showChip = true }) {
  const m = freshnessMeta(timestamp);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[.78rem] text-[var(--color-muted)]">{freshnessPhrase(timestamp)}</span>
      {showChip && <span className={`${statusPill} ${toneClass[m.tone]}`}>{m.label}</span>}
    </span>
  );
}
