"use client";
import React, { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import EmergencyIcon from "./EmergencyIcons";
import {
  useAssistant,
  useLocation,
  ASSISTANT_CHAT_TITLE,
  ASSISTANT_DISCLAIMER,
  ASSISTANT_CATEGORIES,
  ASSISTANT_QUICK_ACTIONS,
  MUMBAI_LOCALITIES,
} from "@medreach/core";
import {
  AssistantHospitalCard,
  AssistantBloodBankCard,
  AssistantAmbulanceCard,
  AssistantDiagnosticCard,
  AssistantJobCard,
} from "./assistant";
import AmbulanceBookingModal from "./AmbulanceBookingModal";
import BloodBankActionModal from "./BloodBankActionModal";

export default function HealthcareAssistant({ initialOpen = false, onCloseModal }) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [showLocalityMenu, setShowLocalityMenu] = useState(false);

  const {
    messages,
    sending,
    unavailable,
    send,
    reset,
    activeModal,
    modalData,
    openAmbulanceModal,
    openBloodModal,
    closeModals,
  } = useAssistant();

  const { origin, label, useLocality } = useLocation();

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll on new message or sending
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, sending, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Listen for global custom event to open assistant (e.g. from SosButton or Hero)
  useEffect(() => {
    const handleOpen = (e) => {
      setIsOpen(true);
      if (e?.detail?.query) {
        send(e.detail.query, { locality: label, origin });
      }
    };
    window.addEventListener("medreach:open-assistant", handleOpen);
    return () => window.removeEventListener("medreach:open-assistant", handleOpen);
  }, [label, origin, send]);

  const handleSend = (textToSend) => {
    const text = (textToSend ?? input).trim();
    if (!text || sending) return;
    send(text, { locality: label, origin });
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === "Escape") {
      setIsOpen(false);
      onCloseModal?.();
    }
  };

  return (
    <>
      {/* Floating Assistant Launcher Button (Bottom Right) */}
      {!isOpen && (
        <div className="assistant-launcher-container" style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 1050 }}>
          <button
            type="button"
            className="btn btn-primary shadow-lg rounded-pill px-3 py-2 d-inline-flex align-items-center gap-2 assistant-launcher-btn"
            onClick={() => setIsOpen(true)}
            aria-label="Open MedReach Healthcare Assistant"
          >
            <span className="assistant-pulse-indicator" />
            <EmergencyIcon name="bot" size={20} className="text-white" />
            <span className="fw-semibold small d-none d-sm-inline">MedReach Assistant</span>
          </button>
        </div>
      )}

      {/* Expandable Chat Window */}
      {isOpen && (
        <div
          className={`assistant-chat-panel shadow-lg rounded-4 d-flex flex-column ${isExpanded ? "assistant-expanded" : ""}`}
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            width: isExpanded ? "640px" : "400px",
            maxWidth: "calc(100vw - 32px)",
            height: isExpanded ? "760px" : "620px",
            maxHeight: "calc(100vh - 48px)",
            backgroundColor: "#ffffff",
            zIndex: 1060,
            border: "1px solid #e2e8f0",
            transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Header */}
          <div className="p-3 bg-light border-bottom d-flex align-items-center justify-content-between rounded-top-4">
            <div className="d-flex align-items-center gap-2">
              <div className="assistant-avatar bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style={{ width: "36px", height: "36px" }}>
                <EmergencyIcon name="bot" size={20} />
              </div>
              <div>
                <h3 className="h6 mb-0 fw-bold text-dark d-flex align-items-center gap-2">
                  {ASSISTANT_CHAT_TITLE}
                  <span className="badge bg-success-subtle text-success border border-success-subtle" style={{ fontSize: "0.68rem" }}>
                    Online
                  </span>
                </h3>
                <div className="d-flex align-items-center gap-1 text-muted" style={{ fontSize: "0.75rem" }}>
                  <span>Mumbai Care Network</span>
                  {label && (
                    <>
                      <span>·</span>
                      <button
                        type="button"
                        className="btn btn-link p-0 text-secondary text-decoration-none d-inline-flex align-items-center gap-1"
                        style={{ fontSize: "0.75rem" }}
                        onClick={() => setShowLocalityMenu((v) => !v)}
                      >
                        <EmergencyIcon name="pin" size={11} /> {label}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="d-flex align-items-center gap-1">
              <button
                type="button"
                className="btn btn-sm btn-light border-0 text-secondary"
                onClick={() => setIsExpanded((v) => !v)}
                title={isExpanded ? "Collapse" : "Expand"}
                aria-label={isExpanded ? "Collapse panel" : "Expand panel"}
              >
                {isExpanded ? "🗗" : "🗖"}
              </button>
              {messages.length > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-light border-0 text-secondary"
                  onClick={reset}
                  title="Clear conversation"
                  aria-label="Clear chat"
                >
                  <EmergencyIcon name="refresh" size={14} />
                </button>
              )}
              <button
                type="button"
                className="btn-close ms-1"
                aria-label="Close Assistant"
                onClick={() => {
                  setIsOpen(false);
                  onCloseModal?.();
                }}
              />
            </div>
          </div>

          {/* Locality Dropdown Selector */}
          {showLocalityMenu && (
            <div className="p-2 border-bottom bg-white shadow-sm" style={{ maxHeight: "140px", overflowY: "auto" }}>
              <div className="small fw-semibold text-muted mb-1 px-1">Select your Mumbai locality:</div>
              <div className="d-flex flex-wrap gap-1">
                {MUMBAI_LOCALITIES.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    className={`btn btn-sm ${label === loc ? "btn-primary text-white" : "btn-light border text-secondary"}`}
                    style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                    onClick={() => {
                      useLocality(loc);
                      setShowLocalityMenu(false);
                    }}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Category Launchers */}
          <div className="p-2 border-bottom bg-light d-flex gap-1 overflow-x-auto" style={{ whiteSpace: "nowrap" }}>
            {ASSISTANT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className="btn btn-sm btn-white border rounded-pill shadow-xs text-secondary flex-shrink-0"
                style={{ fontSize: "0.74rem", padding: "3px 10px", backgroundColor: "#fff" }}
                onClick={() => handleSend(cat.prompt)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Message List */}
          <div className="flex-grow-1 p-3 overflow-y-auto" style={{ backgroundColor: "#f8fafc" }}>
            {messages.length === 0 ? (
              <div className="text-center py-4">
                <div className="mb-3 text-primary">
                  <div className="d-inline-flex p-3 rounded-circle bg-primary-subtle text-primary mb-2">
                    <EmergencyIcon name="bot" size={32} />
                  </div>
                  <h4 className="h6 fw-bold mb-1 text-dark">How can MedReach help you today?</h4>
                  <p className="text-muted small px-3 mb-3">
                    Ask about emergency care, hospital beds, urgent blood requirements, ambulances, diagnostics, or jobs.
                  </p>
                </div>

                <div className="d-flex flex-column gap-1 text-start">
                  <div className="text-muted fw-semibold small mb-1 px-1">Suggested inquiries:</div>
                  {ASSISTANT_QUICK_ACTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="btn btn-white border text-dark text-start small p-2 rounded-3 shadow-xs hover-bg-light"
                      style={{ backgroundColor: "#ffffff" }}
                      onClick={() => handleSend(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="d-flex flex-column gap-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id || Math.random()}
                    className={`d-flex ${msg.role === "user" ? "justify-content-end" : "justify-content-start"}`}
                  >
                    <div
                      className={`rounded-4 p-3 shadow-xs ${
                        msg.role === "user"
                          ? "bg-primary text-white"
                          : "bg-white border text-dark"
                      }`}
                      style={{ maxWidth: "90%" }}
                    >
                      {/* Message Content */}
                      <div className="small" style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                        {msg.text}
                      </div>

                      {/* Code Red Emergency Dialers if intent is emergency or unavailable */}
                      {(msg.intent === "emergency" || msg.intent === "unavailable") && (
                        <div className="mt-3 p-2 rounded-3 bg-danger-subtle border border-danger-subtle">
                          <div className="fw-bold text-danger small mb-1 d-flex align-items-center gap-1">
                            <EmergencyIcon name="siren" size={14} /> Immediate Emergency Contacts:
                          </div>
                          <div className="d-flex flex-wrap gap-1 mt-2">
                            <a href="tel:112" className="btn btn-sm btn-danger fw-bold d-inline-flex align-items-center gap-1">
                              <EmergencyIcon name="phone" size={12} /> Call 112 (Emergency)
                            </a>
                            <a href="tel:108" className="btn btn-sm btn-outline-danger fw-semibold d-inline-flex align-items-center gap-1">
                              <EmergencyIcon name="ambulance" size={12} /> Call 108 (Ambulance)
                            </a>
                            <Link href="/emergency" className="btn btn-sm btn-light border text-danger fw-semibold">
                              Emergency Mode ›
                            </Link>
                          </div>
                        </div>
                      )}

                      {/* Render Hospital Result Cards */}
                      {msg.hospitals?.length > 0 && (
                        <div className="mt-3">
                          <div className="small fw-semibold text-muted mb-2">Verified Hospital Matches:</div>
                          {msg.hospitals.map((h) => (
                            <AssistantHospitalCard key={h.id || h.slug} hospital={h} />
                          ))}
                        </div>
                      )}

                      {/* Render Blood Bank Result Cards */}
                      {msg.bloodBanks?.length > 0 && (
                        <div className="mt-3">
                          <div className="small fw-semibold text-muted mb-2">Verified Blood Banks:</div>
                          {msg.bloodBanks.map((b) => (
                            <AssistantBloodBankCard
                              key={b.id || b.name}
                              bloodBank={b}
                              onRequestBlood={openBloodModal}
                            />
                          ))}
                        </div>
                      )}

                      {/* Render Ambulance Result Cards */}
                      {msg.ambulances?.length > 0 && (
                        <div className="mt-3">
                          <div className="small fw-semibold text-muted mb-2">Verified Ambulance Providers:</div>
                          {msg.ambulances.map((a) => (
                            <AssistantAmbulanceCard
                              key={a.id || a.name}
                              ambulance={a}
                              onBookAmbulance={openAmbulanceModal}
                            />
                          ))}
                        </div>
                      )}

                      {/* Render Diagnostic Result Cards */}
                      {msg.diagnostics?.length > 0 && (
                        <div className="mt-3">
                          <div className="small fw-semibold text-muted mb-2">Diagnostic & Scan Centers:</div>
                          {msg.diagnostics.map((d) => (
                            <AssistantDiagnosticCard key={d.id || d.name} diagnostic={d} />
                          ))}
                        </div>
                      )}

                      {/* Render Job Result Cards */}
                      {msg.jobs?.length > 0 && (
                        <div className="mt-3">
                          <div className="small fw-semibold text-muted mb-2">Active Clinical Openings:</div>
                          {msg.jobs.map((j) => (
                            <AssistantJobCard key={j.id} job={j} />
                          ))}
                        </div>
                      )}

                      {/* Suggested Actions Buttons */}
                      {msg.suggestedActions?.length > 0 && (
                        <div className="mt-2 pt-2 border-top d-flex flex-wrap gap-1">
                          {msg.suggestedActions.map((act, idx) => {
                            if (act.type === "call") {
                              return (
                                <a
                                  key={idx}
                                  href={`tel:${act.phone}`}
                                  className={`btn btn-sm ${act.primary ? "btn-danger" : "btn-outline-danger"} d-inline-flex align-items-center gap-1`}
                                >
                                  <EmergencyIcon name="phone" size={12} /> {act.label}
                                </a>
                              );
                            }
                            if (act.url) {
                              return (
                                <Link
                                  key={idx}
                                  href={act.url}
                                  className={`btn btn-sm ${act.primary ? "btn-primary" : "btn-outline-primary"}`}
                                >
                                  {act.label}
                                </Link>
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}

                      {/* Follow-up Prompts */}
                      {msg.suggestedPrompts?.length > 0 && (
                        <div className="mt-2 pt-2 border-top">
                          <div className="text-muted" style={{ fontSize: "0.72rem" }}>Suggested follow-ups:</div>
                          <div className="d-flex flex-wrap gap-1 mt-1">
                            {msg.suggestedPrompts.map((p) => (
                              <button
                                key={p}
                                type="button"
                                className="btn btn-sm btn-light border text-secondary rounded-pill py-0 px-2"
                                style={{ fontSize: "0.72rem" }}
                                onClick={() => handleSend(p)}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Animated Typing Indicator */}
                {sending && (
                  <div className="d-flex justify-content-start">
                    <div className="bg-white border rounded-4 p-3 shadow-xs">
                      <div className="d-flex align-items-center gap-2 text-muted small">
                        <span className="spinner-grow spinner-grow-sm text-primary" role="status" />
                        <span>Consulting verified MedReach records…</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Form & Footer */}
          <div className="p-3 bg-white border-top rounded-bottom-4">
            <form
              className="d-flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <input
                ref={inputRef}
                type="text"
                className="form-control"
                placeholder="Ask about hospitals, urgent blood, ambulances…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={500}
                disabled={sending}
              />
              <button
                type="submit"
                className="btn btn-primary d-inline-flex align-items-center gap-1 flex-shrink-0"
                disabled={sending || !input.trim()}
              >
                Send <EmergencyIcon name="navigate" size={14} />
              </button>
            </form>
            <div className="text-muted mt-2 text-center" style={{ fontSize: "0.68rem" }}>
              {ASSISTANT_DISCLAIMER}
            </div>
          </div>
        </div>
      )}

      {/* Embedded Modals triggered from in-chat card actions */}
      {activeModal === "ambulance" && (
        <AmbulanceBookingModal
          provider={modalData}
          onClose={closeModals}
        />
      )}
      {activeModal === "blood" && (
        <BloodBankActionModal
          bloodBank={modalData}
          onClose={closeModals}
        />
      )}
    </>
  );
}
