"use client";
import { useState, useRef, useEffect } from "react";
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
import { btnPrimary, btnOutlineSecondary } from "../lib/tone";

// Prominent emergency actions shown whenever a reply's intent is "emergency" or
// the AI is unavailable — spec requires these are never buried behind
// conversation and never a broken chat is shown alone.
function EmergencyActions({ onClose }) {
  return (
    <div className="flex flex-col gap-2 p-2 border border-[var(--color-border)] rounded-[var(--radius)] bg-[#f8f9fa]">
      <a className={`${btnPrimary} text-lg`} href="tel:112"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Call 112</a>
      <a className={btnOutlineSecondary} href="tel:102"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/><path d="M6 8h4"/><path d="M8 6v4"/></svg>Call 102</a>
      <a className={btnOutlineSecondary} href="/emergency" onClick={onClose}>
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>Find nearest hospital
      </a>
    </div>
  );
}

function HospitalResultCard({ hospital }) {
  const hasCoords = Array.isArray(hospital.coordinates);
  return (
    <div className="border border-[var(--color-border)] rounded-[var(--radius)] p-2 mb-2 bg-[var(--color-surface)]">
      <div className="font-semibold text-sm">{hospital.name}</div>
      <div className="text-[var(--color-muted)] text-sm mb-1">
        {hospital.locality ? `${hospital.locality}` : ""}
        {hospital.distanceKm != null ? ` · ${hospital.distanceKm.toFixed(1)} km` : ""}
        {hospital.matchedFacilities?.length ? ` · ${hospital.matchedFacilities.join(", ")}` : ""}
      </div>
      {hospital.facilityDetail && (
        <div className="text-[var(--color-muted)] text-sm mb-1">
          {hospital.facilityDetail.facility}:{" "}
          {hospital.facilityDetail.status === "unknown"
            ? "Current availability is unknown."
            : hospital.facilityDetail.status}
          {hospital.facilityDetail.confidence ? ` · Confidence: ${hospital.facilityDetail.confidence}` : ""}
          {hospital.facilityDetail.retrievedAtRelative ? ` · Retrieved ${hospital.facilityDetail.retrievedAtRelative}` : ""}
        </div>
      )}
      <div className="flex gap-1 mt-1">
        <a className={`${btnPrimary} text-sm px-3 py-1`} href={`tel:${hospital.phone || "112"}`}><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Call</a>
        {hasCoords && (
          <a
            className={`${btnOutlineSecondary} text-sm px-3 py-1`}
            href={`https://www.google.com/maps/dir/?api=1&destination=${hospital.coordinates[1]},${hospital.coordinates[0]}`}
            target="_blank" rel="noopener noreferrer"
          >
            <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>Navigate
          </a>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg, onCloseModal }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className={`p-2 rounded-[var(--radius)] ${isUser ? "bg-[var(--color-emergency)] text-white" : "bg-[#f8f9fa]"}`}
        style={{ maxWidth: "85%", whiteSpace: "pre-wrap" }}
      >
        <div className="text-sm">{msg.text}</div>
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aiAssistantTitle"
      style={{ background: "rgba(0,0,0,.5)" }}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div ref={dialogRef} className="w-full ai-assistant-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden flex flex-col ai-assistant-content">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <div>
              <h2 className="text-lg font-bold m-0" id="aiAssistantTitle">{ASSISTANT_CHAT_TITLE}</h2>
              <p className="text-[.78rem] text-[var(--color-muted)] mb-0">{ASSISTANT_CHAT_SUBTITLE}</p>
            </div>
            <button type="button" className="text-2xl leading-none px-2" aria-label="Close" onClick={onClose}>×</button>
          </div>

          <div ref={listRef} className="ai-assistant-messages p-3" aria-live="polite" aria-relevant="additions">
            {messages.length === 0 && (
              <div className="mb-2">
                <p className="text-[.78rem] text-[var(--color-muted)]">Ask about hospitals, facilities, or what to do in an emergency.</p>
                <div className="flex flex-wrap gap-1" role="group" aria-label="Quick actions">
                  {ASSISTANT_QUICK_ACTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className={`${btnOutlineSecondary} text-sm px-3 py-1`}
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
            {sending && <p className="text-[.78rem] text-[var(--color-muted)]" aria-live="polite">MedReach AI is typing…</p>}
            {unavailable && messages.length === 0 && (
              <div className="mt-2">
                <p className="text-[.78rem] text-[var(--color-muted)]">AI assistant is temporarily unavailable.</p>
                <EmergencyActions onClose={onClose} />
              </div>
            )}
          </div>

          {showLocalityPicker && (
            <div className="border-t border-[var(--color-border)] p-2 flex flex-wrap gap-1">
              <span className="text-[.78rem] text-[var(--color-muted)] w-full mb-1">{ASSISTANT_LOCALITY_PROMPT}</span>
              {MUMBAI_LOCALITIES.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  className={`${btnOutlineSecondary} text-sm px-3 py-1`}
                  onClick={() => { useLocality(loc); setShowLocalityPicker(false); }}
                >
                  {loc}
                </button>
              ))}
            </div>
          )}

          <form
            className="border-t border-[var(--color-border)] p-2 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          >
            <label htmlFor="aiAssistantInput" className="sr-only">Message MedReach AI Assistant</label>
            <input
              ref={inputRef}
              id="aiAssistantInput"
              type="text"
              className="flex-1 border border-[var(--color-border)] rounded-[var(--radius)] px-3 py-2"
              placeholder="Type a message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              disabled={sending}
            />
            <button type="submit" className={btnPrimary} disabled={sending || !input.trim()}>
              Send
            </button>
          </form>
          <div className="px-2 pb-2 flex justify-between items-center">
            <button
              type="button"
              className="text-sm text-[var(--color-emergency)] underline"
              onClick={() => setShowLocalityPicker((v) => !v)}
            >
              {label ? <>{S.pin}{label}</> : <>{S.pin}Set your area</>}
            </button>
            {messages.length > 0 && (
              <button type="button" className="text-sm text-[var(--color-muted)] underline" onClick={reset}>
                Clear chat
              </button>
            )}
          </div>
          <p className="text-[.78rem] text-[var(--color-muted)] px-2 pb-2 mb-0">{ASSISTANT_DISCLAIMER}</p>
        </div>
      </div>
    </div>
  );
}
