"use client";
import { useState, useRef, useEffect } from "react";
import EmergencyIcon from "./EmergencyIcons";
import {
  useAssistant,
  useLocation,
  ASSISTANT_CHAT_TITLE,
  ASSISTANT_CHAT_SUBTITLE,
  ASSISTANT_DISCLAIMER,
  ASSISTANT_QUICK_ACTIONS,
  ASSISTANT_LOCALITY_PROMPT,
  MUMBAI_LOCALITIES,
} from "@medreach/core";

// Prominent emergency actions shown whenever a reply's intent is "emergency" or
// the AI is unavailable — spec requires these are never buried behind
// conversation and never a broken chat is shown alone.
function EmergencyActions({ onClose }) {
  return (
    <div className="d-flex flex-column gap-2 p-2 border rounded bg-light">
      <a className="btn btn-primary btn-lg" href="tel:112"><EmergencyIcon name="phone" size={16} className="me-1" /> Call 112</a>
      <a className="btn btn-outline-secondary" href="tel:102"><EmergencyIcon name="ambulance" size={16} className="me-1" /> Call 102</a>
      <a className="btn btn-outline-secondary" href="/emergency" onClick={onClose}>
        <EmergencyIcon name="hospital" size={16} className="me-1" /> Find nearest hospital
      </a>
    </div>
  );
}

function HospitalResultCard({ hospital }) {
  const hasCoords =
    Array.isArray(hospital.coordinates) &&
    hospital.coordinates.length === 2 &&
    Number.isFinite(hospital.coordinates[0]) &&
    Number.isFinite(hospital.coordinates[1]);
  return (
    <div className="border rounded p-2 mb-2 bg-white">
      <div className="fw-semibold small">{hospital.name}</div>
      <div className="text-secondary small mb-1">
        {hospital.locality ? `${hospital.locality}` : ""}
        {hospital.distanceKm != null ? ` · ${hospital.distanceKm.toFixed(1)} km` : ""}
        {hospital.matchedFacilities?.length ? ` · ${hospital.matchedFacilities.join(", ")}` : ""}
      </div>
      {hospital.facilityDetail && (
        <div className="text-secondary small mb-1">
          {hospital.facilityDetail.facility}:{" "}
          {hospital.facilityDetail.status === "unknown"
            ? "Current availability is unknown."
            : hospital.facilityDetail.status}
          {hospital.facilityDetail.confidence ? ` · Confidence: ${hospital.facilityDetail.confidence}` : ""}
          {hospital.facilityDetail.retrievedAtRelative ? ` · Retrieved ${hospital.facilityDetail.retrievedAtRelative}` : ""}
        </div>
      )}
      <div className="d-flex gap-1 mt-1">
        <a className="btn btn-sm btn-primary" href={`tel:${hospital.emergencyPhone || hospital.phone || "112"}`}><EmergencyIcon name="phone" size={14} className="me-1" /> Call</a>
        {hasCoords && (
          <a
            className="btn btn-sm btn-outline-secondary"
            href={`https://www.google.com/maps/dir/?api=1&destination=${hospital.coordinates[1]},${hospital.coordinates[0]}`}
            target="_blank" rel="noopener noreferrer"
          >
            <EmergencyIcon name="navigate" size={14} className="me-1" /> Navigate
          </a>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg, onCloseModal }) {
  const isUser = msg.role === "user";
  return (
    <div className={`d-flex ${isUser ? "justify-content-end" : "justify-content-start"} mb-2`}>
      <div
        className={`p-2 rounded ${isUser ? "bg-primary text-white" : "bg-light"}`}
        style={{ maxWidth: "85%", whiteSpace: "pre-wrap" }}
      >
        <div className="small">{msg.text}</div>
        {!isUser && msg.hospitals?.length > 0 && (
          <div className="mt-2">
            {msg.hospitals.map((h) => <HospitalResultCard key={h.id} hospital={h} />)}
          </div>
        )}
        {!isUser && (msg.intent === "emergency" || msg.intent === "unavailable") && (
          <div className="mt-2">
            <EmergencyActions onClose={onCloseModal} />
          </div>
        )}
      </div>
    </div>
  );
}

// Dedicated AI chat modal, opened from SosButton's 4th action. Always keeps
// the real emergency actions (112/102/find hospital) one tap away — never a
// dead-end chat. Bottom-sheet on small viewports via CSS (see globals.css).
export default function AiAssistantModal({ open, onClose }) {
  const { messages, sending, unavailable, send, reset } = useAssistant();
  const { origin, label, useLocality } = useLocation();
  const [input, setInput] = useState("");
  const [showLocalityPicker, setShowLocalityPicker] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);

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
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  if (!open) return null;

  const handleSend = (text) => {
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
      className="modal d-block"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aiAssistantTitle"
      style={{ background: "rgba(0,0,0,.5)" }}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        className="modal-dialog modal-dialog-centered ai-assistant-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <div>
              <h2 className="h5 modal-title mb-0" id="aiAssistantTitle">{ASSISTANT_CHAT_TITLE}</h2>
              <p className="disclaimer mb-0">{ASSISTANT_CHAT_SUBTITLE}</p>
            </div>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>

          <div className="modal-body d-flex flex-column p-0">
            <div ref={listRef} className="ai-assistant-messages p-3" aria-live="polite" aria-relevant="additions">
              {messages.length === 0 && (
                <div className="mb-2">
                  <p className="disclaimer">Ask about hospitals, facilities, or what to do in an emergency.</p>
                  <div className="d-flex flex-wrap gap-1" role="group" aria-label="Quick actions">
                    {ASSISTANT_QUICK_ACTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => handleSend(q)}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} onCloseModal={onClose} />
              ))}
              {sending && <p className="disclaimer small" aria-live="polite">MedReach AI is typing…</p>}
              {unavailable && messages.length === 0 && (
                <div className="mt-2">
                  <p className="disclaimer">AI assistant is temporarily unavailable.</p>
                  <EmergencyActions onClose={onClose} />
                </div>
              )}
            </div>

            {showLocalityPicker && (
              <div className="border-top p-2 d-flex flex-wrap gap-1">
                <span className="disclaimer w-100 mb-1">{ASSISTANT_LOCALITY_PROMPT}</span>
                {MUMBAI_LOCALITIES.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => { useLocality(loc); setShowLocalityPicker(false); }}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            )}

            <form
              className="border-top p-2 d-flex gap-2"
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            >
              <label htmlFor="aiAssistantInput" className="visually-hidden">Message MedReach AI Assistant</label>
              <input
                ref={inputRef}
                id="aiAssistantInput"
                type="text"
                className="form-control"
                placeholder="Type a message…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={500}
                disabled={sending}
              />
              <button type="submit" className="btn btn-primary" disabled={sending || !input.trim()}>
                Send
              </button>
            </form>
            <div className="px-2 pb-2 d-flex justify-content-between align-items-center">
              <button
                type="button"
                className="btn btn-link btn-sm p-0"
                onClick={() => setShowLocalityPicker((v) => !v)}
              >
                {label ? <><EmergencyIcon name="pin" size={14} className="me-1" /> {label}</> : <><EmergencyIcon name="pin" size={14} className="me-1" /> Set your area</>}
              </button>
              {messages.length > 0 && (
                <button type="button" className="btn btn-link btn-sm p-0 text-secondary" onClick={reset}>
                  Clear chat
                </button>
              )}
            </div>
            <p className="disclaimer px-2 pb-2 mb-0 small">{ASSISTANT_DISCLAIMER}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
