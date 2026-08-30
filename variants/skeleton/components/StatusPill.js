import { availabilityMeta } from "@medreach/core";
import { toneClass } from "../lib/tone";

// Availability status conveyed by symbol + text + color (never color alone → a11y).
export default function StatusPill({ status }) {
  const m = availabilityMeta(status);
  return (
    <span className={`status-pill ${toneClass[m.tone]}`}>
      <span className="status-symbol" aria-hidden="true">{m.symbol}</span>
      {m.label}
    </span>
  );
}
