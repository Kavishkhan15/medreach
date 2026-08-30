"use client";
import { EMERGENCY_CATEGORIES } from "@medreach/core";

// Grid of emergency categories. Purely a discovery filter — NOT diagnosis.
export default function EmergencyCategorySelector({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="group" aria-label="Emergency type">
      {EMERGENCY_CATEGORIES.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            className={`flex flex-col items-center gap-[.35rem] text-center p-4 px-2 w-full rounded-[var(--radius)] font-bold border-2 cursor-pointer bg-[var(--color-surface)] ${
              active
                ? "border-[var(--color-emergency)] bg-[#fdecee] text-[var(--color-critical)]"
                : "border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-emergency)]"
            }`}
            aria-pressed={active}
            onClick={() => onChange(c.id)}
            title={c.description}
          >
            <span className="text-[1.6rem]" aria-hidden="true">{c.icon}</span>
            <span>{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}
