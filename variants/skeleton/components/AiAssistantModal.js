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
      <a className="btn btn-primary btn-lg" href="tel:112">📞 CALL 112</a>
      <a className="btn btn-outline-secondary" href="tel:102">🚑 CALL 102</a>
      <Link className="btn btn-outline-secondary" href="/emergency" onClick={onFindHospital}>
        🏥 FIND NEAREST HOSPITAL
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
        <a className="btn btn-sm btn-primary" href={`tel:${hospital.phone || "112"}`}>📞 Call</a>
        {coords && (
          <a
            className="btn btn-sm btn-outline-secondary"
            href={`https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`}
            target="_blank" rel="noopener noreferrer"
          >
            🧭 Navigate
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
