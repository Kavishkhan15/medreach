import { availabilityMeta } from "@medreach/core";
import { toneClass, statusPill } from "../lib/tone";

// Availability status conveyed by symbol + text + color (never color alone → a11y).
export default function StatusPill({ status }) {
  const m = availabilityMeta(status);
  return (
    <span className={`${statusPill} ${toneClass[m.tone]}`}>
      <span className="font-extrabold" aria-hidden="true">{m.symbol}</span>
      {m.label}
    </span>
  );
}
