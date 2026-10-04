"use client";

export function EmergencyIcon({ name, size = 20, className = "", ...props }) {
  const iconProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: `inline-block align-middle ${className}`.trim(),
    "aria-hidden": "true",
    ...props,
  };

  switch (name?.toLowerCase()) {
    case "home":
      return <svg {...iconProps}><path d="m3 10 9-7 9 7" /><path d="M5 9v12h5v-7h4v7h5V9" fill="currentColor" /></svg>;
    case "hospital":
      return <svg {...iconProps}><path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4M10 9h4M12 7v4" /></svg>;
    case "diagnostic":
      return <svg {...iconProps}><path d="M10 2v7.31a2 2 0 0 1-.37 1.17L4.22 18.6A2 2 0 0 0 5.86 22h12.28a2 2 0 0 0 1.64-3.4l-5.41-8.12A2 2 0 0 1 14 9.31V2M8.5 2h7M7 16h10" /></svg>;
    case "blood":
      return <svg {...iconProps}><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></svg>;
    case "ambulance":
      return <svg {...iconProps}><path d="M10 10H6M8 8v4M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948L19 12V6a2 2 0 0 0-2-2h-3" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>;
    case "briefcase":
      return <svg {...iconProps}><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v3h4v-3" /></svg>;
    case "document":
      return <svg {...iconProps}><path d="M6 2h9l4 4v16H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" /><path d="M14 2v5h5M8 12h7M8 16h7" /></svg>;
    case "user":
      return <svg {...iconProps}><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2" /></svg>;
    case "shield":
      return <svg {...iconProps}><path d="m12 2 9 4v6c0 5-3.5 8-9 10-5.5-2-9-5-9-10V6z" /></svg>;
    case "search":
      return <svg {...iconProps}><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>;
    case "check":
      return <svg {...iconProps}><polyline points="20 6 9 17 4 12" /></svg>;
    case "verified":
      return <svg {...iconProps}><circle cx="12" cy="12" r="10" /><polyline points="9 12 11.5 14.5 15.5 9.5" /></svg>;
    case "cardiac":
      return (
        <svg {...iconProps}>
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          <path d="M3.22 12H8.5l1.5-3 2 6 1.5-3.5 1 1.5h6.28" />
        </svg>
      );
    case "stroke":
      return (
        <svg {...iconProps}>
          <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04Z" />
          <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04Z" />
        </svg>
      );
    case "trauma":
      return (
        <svg {...iconProps}>
          <path d="M10 10H6" />
          <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
          <path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-2.316-.772V6a2 2 0 0 0-2-2h-3" />
          <path d="M8 8v4" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="17" cy="18" r="2" />
        </svg>
      );
    case "burns":
      return (
        <svg {...iconProps}>
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      );
    case "respiratory":
      return (
        <svg {...iconProps}>
          <path d="M12 4v8" />
          <path d="M12 9a4 4 0 0 0-3.5-2C6 7 5 9 5 12c0 3 1.5 6 4 7 2 .8 3-1 3-3" />
          <path d="M12 9a4 4 0 0 1 3.5-2c2.5 0 3.5 2 3.5 5 0 3-1.5 6-4 7-2 .8-3-1-3-3" />
        </svg>
      );
    case "pediatric":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="7" r="4" />
          <path d="M19 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M5 21v-2a4 4 0 0 1 3-3.87" />
          <path d="M9 17a4 4 0 0 0 6 0" />
        </svg>
      );
    case "maternity":
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="5" r="3" />
          <path d="M9 9a3 3 0 0 0-3 3v2a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-2a3 3 0 0 0-3-3" />
          <path d="M12 12a3 3 0 0 1 3 3" />
        </svg>
      );
    case "general":
    case "cross":
      return (
        <svg {...iconProps}>
          <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />
        </svg>
      );
    case "pin":
    case "location":
      return (
        <svg {...iconProps}>
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    case "phone":
      return (
        <svg {...iconProps}>
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      );
    case "navigate":
    case "direction":
      return (
        <svg {...iconProps}>
          <polygon points="3 11 22 2 13 21 11 13 3 11" />
        </svg>
      );
    case "bed":
      return (
        <svg {...iconProps}>
          <path d="M2 4v16" />
          <path d="M2 8h18a2 2 0 0 1 2 2v10" />
          <path d="M2 17h20" />
          <circle cx="6" cy="8" r="2" />
        </svg>
      );
    case "siren":
    case "alert":
      return (
        <svg {...iconProps}>
          <path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v2h16v-2a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4Z" />
          <path d="M4 16h16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2Z" />
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
          <line x1="19.07" y1="4.93" x2="17.66" y2="6.34" />
        </svg>
      );
    case "mail":
    case "email":
      return (
        <svg {...iconProps}>
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      );
    default:
      return (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
  }
}

export const AppIcon = EmergencyIcon;
export const Icon = EmergencyIcon;
export default EmergencyIcon;
