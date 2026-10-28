import EmergencyIcon from "./EmergencyIcons";

export default function AdminOverviewIcon({ name, size = 22, className = "" }) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", className, "aria-hidden": true };
  if (name === "grid") return <svg {...props}><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="3" y="15" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /></svg>;
  if (name === "users") return <svg {...props}><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5.65" /></svg>;
  if (name === "approval") return <svg {...props}><rect x="5" y="4" width="14" height="18" rx="2" /><rect x="9" y="2" width="6" height="4" rx="1" /><path d="m8 13 3 3 5-6" /></svg>;
  if (name === "bell") return <svg {...props}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
  if (name === "settings") return <svg {...props}><path d="m10 3-1 3-3 1-3-1-1 3 2 2v3l-2 2 2 3 3-1 2 1 1 3h4l1-3 2-1 3 1 2-3-2-2v-3l2-2-1-3-3 1-3-1-1-3Z" /><circle cx="12" cy="12" r="3" /></svg>;
  if (name === "logout") return <svg {...props}><path d="M9 3H4v18h5M10 12h11m-4-4 4 4-4 4" /></svg>;
  if (name === "arrow") return <svg {...props}><path d="M5 12h14m-5-5 5 5-5 5" /></svg>;
  return <EmergencyIcon name={name} size={size} className={className} />;
}
