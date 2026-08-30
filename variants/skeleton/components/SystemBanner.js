"use client";
import { useSystemStatus } from "@medreach/core";

// Honest, prominent system-state banner. Never lets demo fixtures look live.
export default function SystemBanner() {
  const { mode, isDemo } = useSystemStatus();
  if (mode === "checking") return null;
  return (
    <div className={`system-banner ${isDemo ? "demo" : "live"}`} role="status" aria-live="polite">
      {isDemo
        ? "⚠ DEMO DATA — sample dataset, not real-time availability. Backend not connected."
        : "● LIVE DATA — connected to the MedReach backend."}
    </div>
  );
}
