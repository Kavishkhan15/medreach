"use client";
import { useSystemStatus } from "@medreach/core";
import { EmergencyIcon } from "./EmergencyIcons";

export default function SystemBanner() {
  const { mode, isUnavailable } = useSystemStatus();
  if (mode === "checking") return null;
  return (
    <div className={`system-banner ${isUnavailable ? "demo" : "live"}`} role="status" aria-live="polite">
      {isUnavailable
        ? <><EmergencyIcon name="warning" size={15} className="me-1" /> LIVE DATA UNAVAILABLE — provider information could not be loaded. Retry from the directory page.</>
        : <><span className="d-inline-block rounded-circle bg-success me-1" style={{ width: 8, height: 8 }} /> LIVE DATA — connected to the MedReach backend.</>}
    </div>
  );
}
