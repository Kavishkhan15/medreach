"use client";
import { useState } from "react";
import Link from "next/link";
import { ASSISTANT_ENTRY_LABEL, ASSISTANT_ENTRY_SUBTITLE } from "@medreach/core";
import AiAssistantModal from "./AiAssistantModal";

// Prominent SOS control. Does NOT claim to dispatch emergency services (no such
// integration exists) — it surfaces the real emergency actions and requires a
// confirmation tap to avoid accidental activation.
export default function SosButton() {
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const openAssistant = () => {
    setOpen(false);
    setAiOpen(true);
  };

  return (
    <>
      <button className="sos-fab" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="font-bold mr-1">SOS</span>SOS
      </button>

      {open && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="sosTitle"
          onClick={() => setOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="h5 modal-title" id="sosTitle">Emergency help</h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className="modal-body stack gap-2">
              <p className="disclaimer mb-1">
                MedReach helps you find and contact hospitals. It does not dispatch
                emergency services. In a life-threatening emergency, call the number below.
              </p>
              <a className="btn btn-primary btn-lg" href="tel:112"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Call 112 (Emergency)</a>
              <a className="btn btn-outline-secondary" href="tel:102"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/><path d="M6 8h4"/><path d="M8 6v4"/></svg>Call 102 (Ambulance)</a>
              <Link className="btn btn-outline-secondary" href="/emergency" onClick={() => setOpen(false)}>
                <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>Find nearest emergency hospital
              </Link>
              <button
                type="button"
                className="btn btn-outline-secondary ai-assistant-entry d-flex align-items-center justify-content-between text-start"
                onClick={openAssistant}
              >
                <span>
                  <span className="ai-assistant-badge" aria-hidden="true"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg></span>{" "}
                  {ASSISTANT_ENTRY_LABEL}
                  <span className="d-block disclaimer mb-0">{ASSISTANT_ENTRY_SUBTITLE}</span>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <AiAssistantModal open={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  );
}
