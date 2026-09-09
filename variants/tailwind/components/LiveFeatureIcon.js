// Small, dependency-free "live" icons for the homepage feature cards.
// Pure inline SVG + CSS animation — no GIFs, no external requests, no AI.
// Each icon visually echoes its feature: a sweeping radar (ranking), a
// ticking second hand (freshness), a pulsing check (verification).

function RadarIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" className="live-icon live-icon-radar">
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <circle cx="16" cy="16" r="8" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <g className="live-icon-radar-sweep" style={{ transformOrigin: "16px 16px" }}>
        <path d="M16 16 L16 3 A13 13 0 0 1 27.2 9.5 Z" fill="currentColor" fillOpacity="0.35" />
      </g>
      <circle cx="16" cy="16" r="2" fill="currentColor" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" className="live-icon">
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <line x1="16" y1="16" x2="16" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="live-icon-clock-minute" style={{ transformOrigin: "16px 16px" }} />
      <line x1="16" y1="16" x2="21" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="live-icon-clock-second" style={{ transformOrigin: "16px 16px" }} />
      <circle cx="16" cy="16" r="1.5" fill="currentColor" />
    </svg>
  );
}

function VerifiedIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" className="live-icon">
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" className="live-icon-verified-ring" style={{ transformOrigin: "16px 16px" }} />
      <path d="M10 16.5 L14 20.5 L22 11.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="live-icon-verified-check" />
    </svg>
  );
}

const ICONS = { radar: RadarIcon, clock: ClockIcon, verified: VerifiedIcon };

// name: "radar" | "clock" | "verified"
export default function LiveFeatureIcon({ name, label }) {
  const Icon = ICONS[name] || RadarIcon;
  return (
    <span className="live-icon-badge" role="img" aria-label={label}>
      <Icon />
    </span>
  );
}
