"use client";
import EmergencyIcon from "./EmergencyIcons";

// Reuse the Bootstrap assistant glyphs without changing icons elsewhere.
export default function AssistantIcon({ name, size = 20, ...props }) {
  const glyphs = {
    bot: <><path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></>,
    hospital: <><path d="M3 21h18" /><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" /><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" /><path d="M10 9h4" /><path d="M12 7v4" /></>,
    verified: <><circle cx="12" cy="12" r="10" /><polyline points="9 12 11.5 14.5 15.5 9.5" /></>,
    ambulance: <><path d="M9 2h3" /><path d="M10 10H6" /><path d="M8 8v4" /><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-2.316-.772V6a2 2 0 0 0-2-2h-3" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  };
  const glyph = glyphs[name?.toLowerCase()];
  if (!glyph) return <EmergencyIcon name={name} size={size} {...props} />;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{glyph}</svg>;
}
