"use client";
import { useSystemStatus } from "@medreach/core";
import { EmergencyIcon } from "./EmergencyIcons";

export default function SystemBanner() {
  const { mode, isUnavailable } = useSystemStatus();
  const unavailableMessage = "LIVE DATA UNAVAILABLE — provider information could not be loaded. Retry from the directory page.";
  return (
    <div className={`system-banner ${mode === "checking" ? "checking" : isUnavailable ? "demo" : "live"}`}>
      <span className="system-banner-sizer" aria-hidden="true"><EmergencyIcon name="warning" size={15} className="me-1" /> {unavailableMessage}</span>
      <span className="system-banner-message" role="status" aria-live="polite">{mode === "checking" ? "Checking provider connection…" : isUnavailable
        ? <><EmergencyIcon name="warning" size={15} className="me-1" /> {unavailableMessage}</>
        : <><span className="d-inline-block rounded-circle bg-success me-1" style={{ width: 8, height: 8 }} /> LIVE DATA — connected to the MedReach backend.</>}</span>
    </div>
  );
}
