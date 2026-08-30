import { freshnessMeta, freshnessPhrase } from "@medreach/core";
import { toneClass } from "../lib/tone";

// Shows an honest freshness signal: "Updated 4 min ago" + a tone chip. Missing
// timestamps render as "Availability unknown" rather than a fabricated state.
export default function DataFreshness({ timestamp, showChip = true }) {
  const m = freshnessMeta(timestamp);
  return (
    <span className="flex items-center gap-2" style={{ display: "inline-flex" }}>
      <span className="disclaimer">{freshnessPhrase(timestamp)}</span>
      {showChip && <span className={`status-pill ${toneClass[m.tone]}`}>{m.label}</span>}
    </span>
  );
}
