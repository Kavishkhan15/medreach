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
        🆘 SOS
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
              <a className="btn btn-primary btn-lg" href="tel:112">📞 Call 112 (Emergency)</a>
              <a className="btn btn-outline-secondary" href="tel:102">🚑 Call 102 (Ambulance)</a>
              <Link className="btn btn-outline-secondary" href="/emergency" onClick={() => setOpen(false)}>
                🏥 Find nearest emergency hospital
              </Link>
              <button
                type="button"
                className="btn btn-outline-secondary ai-assistant-entry d-flex align-items-center justify-content-between text-start"
                onClick={openAssistant}
              >
                <span>
                  <span className="ai-assistant-badge" aria-hidden="true">🤖</span>{" "}
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
