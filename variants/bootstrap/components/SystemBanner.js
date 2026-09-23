"use client";
import { useSystemStatus } from "@medreach/core";
import { EmergencyIcon } from "./EmergencyIcons";

// Honest, prominent system-state banner. Never lets demo fixtures look live.
export default function SystemBanner() {
  const { mode, isDemo } = useSystemStatus();
  if (mode === "checking") return null;
  return (
    <div className={`system-banner ${isDemo ? "demo" : "live"}`} role="status" aria-live="polite">
      {isDemo
        ? <><EmergencyIcon name="warning" size={15} className="me-1" /> DEMO DATA — sample dataset, not real-time availability. Backend not connected.</>
        : <><span className="d-inline-block rounded-circle bg-success me-1" style={{ width: 8, height: 8 }} /> LIVE DATA — connected to the MedReach backend.</>}
    </div>
  );
}
