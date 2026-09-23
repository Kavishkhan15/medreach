"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  useAssistant, useLocation, availabilityMeta,
  ASSISTANT_CHAT_TITLE, ASSISTANT_CHAT_SUBTITLE, ASSISTANT_DISCLAIMER,
  ASSISTANT_QUICK_ACTIONS, ASSISTANT_LOCALITY_PROMPT, MUMBAI_LOCALITIES,
} from "@medreach/core";

// Prominent, always-visible emergency actions. Rendered immediately (not
// buried in conversation) whenever a reply's intent is "emergency", and also
// used as the entire body when the assistant is unavailable — hospital
// discovery via the AI must never be a hard dependency for reaching help.
function EmergencyActions({ onFindHospital }) {
  return (
    <div className="stack gap-2 my-2" role="group" aria-label="Emergency actions">
      <a className="btn btn-primary btn-lg" href="tel:112"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>CALL 112</a>
      <a className="btn btn-outline-secondary" href="tel:102"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/><path d="M6 8h4"/><path d="M8 6v4"/></svg>CALL 102</a>
      <Link className="btn btn-outline-secondary" href="/emergency" onClick={onFindHospital}>
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>FIND NEAREST HOSPITAL
      </Link>
    </div>
  );
}

function HospitalResultCard({ hospital }) {
  const detail = hospital.facilityDetail;
  const meta = detail ? availabilityMeta(detail.status) : null;
  const coords = hospital.coordinates;
  return (
    <div className="hospital-result-card">
      <div className="fw-semibold">{hospital.name}</div>
      <div className="d-flex flex-wrap gap-2 text-secondary small">
        {hospital.distanceKm != null && <span>{hospital.distanceKm.toFixed(1)} km</span>}
        {hospital.matchedFacilities?.[0] && <span>{hospital.matchedFacilities[0]}</span>}
      </div>
      {detail && (
        <div className="mt-1">
          <span className={`status-pill tone-${meta.tone}`}>
            <span aria-hidden="true">{meta.symbol}</span> {detail.facility}: {meta.label}
          </span>
          {detail.status === "unknown" && (
            <div className="disclaimer mt-1">Current availability is unknown.</div>
          )}
          {detail.retrievedAtRelative && (
            <div className="disclaimer">Retrieved {detail.retrievedAtRelative} · Confidence: {detail.confidence}</div>
          )}
        </div>
      )}
      <div className="d-flex gap-2 mt-2">
        <a className="btn btn-sm btn-primary" href={`tel:${hospital.phone || "112"}`}><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Call</a>
        {coords && (
          <a
            className="btn btn-sm btn-outline-secondary"
            href={`https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`}
            target="_blank" rel="noopener noreferrer"
          >
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>Navigate
          </a>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg, onFindHospital }) {
  const isUser = msg.role === "user";
  return (
    <div className={`chat-bubble-row ${isUser ? "chat-bubble-row-user" : "chat-bubble-row-assistant"}`}>
      <div className={`chat-bubble ${isUser ? "chat-bubble-user" : "chat-bubble-assistant"}`} role={isUser ? undefined : "status"}>
        {msg.text}
        {!isUser && msg.intent === "emergency" && <EmergencyActions onFindHospital={onFindHospital} />}
        {!isUser && msg.hospitals?.length > 0 && (
          <div className="mt-2">
            {msg.hospitals.map((h) => <HospitalResultCard key={h.id} hospital={h} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AiAssistantModal({ open, onClose }) {
  const { messages, sending, unavailable, send } = useAssistant();
  const { origin, label, useLocality } = useLocation();
  const [input, setInput] = useState("");
  const [showLocalityPicker, setShowLocalityPicker] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const titleId = "aiAssistantTitle";

  useEffect(() => {
    if (open) {
      // Remember what had focus before opening (the SosButton's AI entry
      // button) so we can restore it on close — required for a11y modals.
      triggerRef.current = document.activeElement;
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending]);

  if (!open) return null;

  const submit = (text) => {
    const value = (text ?? input).trim();
    if (!value) return;
    send(value, { locality: label, origin });
    setInput("");
  };

  // Escape closes; Tab/Shift+Tab are trapped inside the dialog so focus never
  // leaks to the page behind the overlay (WCAG 2.4.3 / 2.1.2).
  const handleKeyDown = (e) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll(
      'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="modal-overlay ai-assistant-overlay" role="dialog" aria-modal="true"
      aria-labelledby={titleId} onClick={onClose} onKeyDown={handleKeyDown}
    >
      <div ref={dialogRef} className="modal-content ai-assistant-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="h5 modal-title mb-0" id={titleId}>{ASSISTANT_CHAT_TITLE}</h2>
            <p className="disclaimer mb-0">{ASSISTANT_CHAT_SUBTITLE}</p>
          </div>
          <button type="button" className="btn-close" aria-label="Close AI assistant" onClick={onClose}>×</button>
        </div>

        <div className="modal-body d-flex flex-column p-0">
          {unavailable ? (
            <div className="p-3">
              <p className="mb-2">AI assistant is temporarily unavailable.</p>
              <EmergencyActions onFindHospital={onClose} />
            </div>
          ) : (
            <>
              <div ref={listRef} className="ai-assistant-messages p-3" aria-live="polite" aria-relevant="additions">
                {messages.length === 0 && (
                  <p className="disclaimer">
                    Ask about hospitals, facilities, or what to do in an emergency.
                  </p>
                )}
                {messages.map((msg, i) => (
                  <MessageBubble key={i} msg={msg} onFindHospital={onClose} />
                ))}
                {sending && <p className="disclaimer" aria-live="polite">MedReach AI is typing…</p>}
              </div>

              <div className="px-3">
                <div className="d-flex flex-wrap gap-1 mb-2" role="group" aria-label="Quick actions">
                  {ASSISTANT_QUICK_ACTIONS.map((q) => (
                    <button
                      key={q} type="button" className="btn btn-sm btn-outline-secondary"
                      onClick={() => submit(q)} disabled={sending}
                    >
                      {q}
                    </button>
                  ))}
                </div>

                {!label && (
                  <div className="mb-2">
                    <button
                      type="button" className="btn-link-plain"
                      onClick={() => setShowLocalityPicker((v) => !v)}
                    >
                      {ASSISTANT_LOCALITY_PROMPT}
                    </button>
                    {showLocalityPicker && (
                      <div className="d-flex flex-wrap gap-1 mt-2">
                        {MUMBAI_LOCALITIES.map((loc) => (
                          <button
                            key={loc} type="button" className="btn btn-sm btn-outline-secondary"
                            onClick={() => { useLocality(loc); setShowLocalityPicker(false); }}
                          >
                            {loc}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <form className="d-flex gap-2 p-3 ai-assistant-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <label htmlFor="aiAssistantInput" className="visually-hidden">Message MedReach AI Assistant</label>
                <input
                  id="aiAssistantInput" ref={inputRef} type="text" className="u-full-width"
                  placeholder="Type your message…" value={input}
                  onChange={(e) => setInput(e.target.value)} disabled={sending}
                  maxLength={500}
                />
                <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
                  Send
                </button>
              </form>
            </>
          )}
          <p className="disclaimer px-3 pb-3 mb-0">{ASSISTANT_DISCLAIMER}</p>
        </div>
      </div>
    </div>
  );
}
