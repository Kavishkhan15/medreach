"use client";
import { useSystemStatus } from "@medreach/core";

// Honest, prominent system-state banner. Never lets demo fixtures look live.
export default function SystemBanner() {
  const { mode, isDemo } = useSystemStatus();
  if (mode === "checking") return null;
  const cls = isDemo
    ? "bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-b border-[#f0d9a8]"
    : "bg-[var(--color-success-bg)] text-[var(--color-success)] border-b border-[#b9e6c9]";
  return (
    <div className={`text-[.85rem] font-semibold py-[.4rem] text-center ${cls}`} role="status" aria-live="polite">
      {isDemo
        ? "⚠ DEMO DATA — sample dataset, not real-time availability. Backend not connected."
        : "● LIVE DATA — connected to the MedReach backend."}
    </div>
  );
}
