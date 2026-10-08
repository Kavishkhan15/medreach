"use client";
import { useState, useRef, useCallback } from "react";
import { useDialogFocus } from "../lib/useDialogFocus";
import Link from "next/link";
import EmergencyIcon from "./EmergencyIcons";
import { ASSISTANT_ENTRY_LABEL, ASSISTANT_ENTRY_SUBTITLE } from "@medreach/core";
import dynamic from "next/dynamic";
const AiAssistantModal = dynamic(() => import("./AiAssistantModal"), { ssr: false });

// Prominent SOS control. Does NOT claim to dispatch emergency services (no such
// integration exists) — it surfaces the real emergency actions and requires a
// confirmation tap to avoid accidental activation.
export default function SosButton() {
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const dialogRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDialogFocus(dialogRef, open, close);

  const openAssistant = () => {
    setOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("medreach:open-assistant"));
    } else {
      setAiOpen(true);
    }
  };

  return (
    <>
      <button className="sos-fab" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <EmergencyIcon name="siren" size={18} className="me-1" /> SOS
      </button>

      {open && (
        <div className="modal d-block" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="sosTitle"
          style={{ background: "rgba(0,0,0,.5)" }} onClick={() => setOpen(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h2 className="h5 modal-title" id="sosTitle">Emergency help</h2>
                <button type="button" className="btn-close" aria-label="Close" onClick={() => setOpen(false)} />
              </div>
              <div className="modal-body vstack gap-2">
                <p className="disclaimer mb-1">
                  MedReach helps you find and contact hospitals. It does not dispatch
                  emergency services. In a life-threatening emergency, call the number below.
                </p>
                <a className="btn btn-primary btn-lg" href="tel:112"><EmergencyIcon name="phone" size={16} className="me-1" /> Call 112 (Emergency)</a>
                <a className="btn btn-outline-secondary" href="tel:102"><EmergencyIcon name="ambulance" size={16} className="me-1" /> Call 102 (Ambulance)</a>
                <Link className="btn btn-outline-secondary" href="/emergency" onClick={() => setOpen(false)}>
                  <EmergencyIcon name="hospital" size={16} className="me-1" /> Find nearest emergency hospital
                </Link>
                <button
                  type="button"
                  className="btn btn-outline-secondary ai-assistant-entry d-flex align-items-center justify-content-between text-start"
                  onClick={openAssistant}
                >
                  <span>
                    <span className="ai-assistant-badge" aria-hidden="true"><EmergencyIcon name="bot" size={16} className="me-1" /></span>{" "}
                    {ASSISTANT_ENTRY_LABEL}
                    <span className="d-block disclaimer mb-0">{ASSISTANT_ENTRY_SUBTITLE}</span>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {aiOpen && <AiAssistantModal open={aiOpen} onClose={() => setAiOpen(false)} />}
    </>
  );
}
