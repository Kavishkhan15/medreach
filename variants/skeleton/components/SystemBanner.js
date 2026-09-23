"use client";
import { useSystemStatus } from "@medreach/core";

// Honest, prominent system-state banner. Never lets demo fixtures look live.
export default function SystemBanner() {
  const { mode, isDemo } = useSystemStatus();
  if (mode === "checking") return null;
  return (
    <div className={`system-banner ${isDemo ? "demo" : "live"}`} role="status" aria-live="polite">
      {isDemo
        ? <><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> DEMO DATA — sample dataset, not real-time availability. Backend not connected.</>
        : <><svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" className="inline-block mr-1"><circle cx="12" cy="12" r="10"/></svg> LIVE DATA — connected to the MedReach backend.</>}
    </div>
  );
}
