// Semantic tone → Tailwind-variant class string. Core emits semantic tones; this
// file is the ONLY place framework styling maps in. Values are Tailwind utility
// strings that reproduce the shared tone palette from globals.css (@theme tokens).
export const toneClass = {
  success: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
  warning: "bg-[var(--color-warning-bg)] text-[var(--color-warning)]",
  danger: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]",
  info: "bg-[var(--color-info-bg)] text-[var(--color-info)]",
  neutral: "bg-[#eef0f2] text-[var(--color-muted)]",
};
export const toneBtn = {
  success: "bg-[var(--color-success)] text-white",
  warning: "bg-[var(--color-warning)] text-white",
  danger: "bg-[var(--color-danger)] text-white",
  info: "bg-[var(--color-emergency)] text-white",
  neutral: "bg-gray-500 text-white",
};

// Shared style primitives so every component renders the same status pill / chip /
// surface / button as the Bootstrap variant, only using Tailwind utilities.
export const statusPill =
  "inline-flex items-center gap-[.35rem] font-bold text-[.8rem] px-[.6rem] py-[.2rem] rounded-full";
export const chip =
  "inline-block text-[.78rem] font-semibold text-[var(--color-muted)] bg-[#eef0f2] rounded-full px-[.6rem] py-[.15rem]";
export const surface =
  "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5";
export const btnPrimary =
  "inline-flex items-center justify-center gap-1 font-bold rounded-[var(--radius)] bg-[var(--color-emergency)] text-white px-4 py-2 hover:bg-[var(--color-emergency-dark)] no-underline";
export const btnOutlineSecondary =
  "inline-flex items-center justify-center gap-1 font-semibold rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] px-4 py-2 hover:bg-[#f1f3f5] no-underline";
