"use client";
import { EMERGENCY_CATEGORIES } from "@medreach/core";

// Grid of emergency categories. Purely a discovery filter — NOT diagnosis.
export default function EmergencyCategorySelector({ value, onChange }) {
  return (
    <div className="cat-grid" role="group" aria-label="Emergency type">
      {EMERGENCY_CATEGORIES.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`cat-tile ${value === c.id ? "active" : ""}`}
          aria-pressed={value === c.id}
          onClick={() => onChange(c.id)}
          title={c.description}
        >
          <span className="cat-icon" aria-hidden="true">{c.icon}</span>
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  );
}
