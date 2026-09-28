"use client";
import React, { useState, useRef, useEffect } from "react";
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

  const handleSend = (textToSend) => {
    const message = typeof textToSend === "string" ? textToSend : input;
    if (!message || !message.trim() || sending) return;

    send(message.trim(), { locality: label, coordinates: origin?.coordinates });
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
        <div className="fixed bottom-6 right-6 z-50">
          <button
            type="button"
            className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white font-semibold text-sm shadow-xl hover:shadow-2xl transition-all duration-200 hover:-translate-y-0.5 group focus:outline-none focus:ring-4 focus:ring-red-200"
            onClick={() => setIsOpen(true)}
            aria-label="Open MedReach Healthcare Assistant"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-200 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
            </span>
            <EmergencyIcon name="bot" size={18} className="text-white" />
            <span className="hidden sm:inline font-semibold">MedReach Assistant</span>
          </button>
        </div>
      )}

      {/* Expandable Chat Window */}
      {isOpen && (
        <div
          className={`fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden transition-all duration-300 ${
            isExpanded
              ? "w-[calc(100vw-32px)] sm:w-[640px] h-[calc(100vh-48px)] sm:h-[760px] max-h-[880px]"
              : "w-[calc(100vw-32px)] sm:w-[410px] h-[calc(100vh-48px)] sm:h-[620px] max-h-[700px]"
          }`}
        >
          {/* Header */}
          <div className="p-3.5 bg-gradient-to-r from-gray-50 via-white to-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <EmergencyIcon name="bot" size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  {ASSISTANT_CHAT_TITLE}
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Online
                  </span>
                </h3>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span>Mumbai Care Network</span>
                  {label && (
                    <>
                      <span>·</span>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-gray-600 hover:text-red-600 font-medium transition-colors"
                        onClick={() => setShowLocalityMenu((v) => !v)}
                      >
                        <EmergencyIcon name="pin" size={11} className="text-red-500" /> {label}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                onClick={() => setIsExpanded((v) => !v)}
                title={isExpanded ? "Collapse" : "Expand"}
                aria-label={isExpanded ? "Collapse panel" : "Expand panel"}
              >
                {isExpanded ? "🗗" : "🗖"}
              </button>
              {messages.length > 0 && (
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                  onClick={reset}
                  title="Clear conversation"
                  aria-label="Clear chat"
                >
                  <EmergencyIcon name="refresh" size={14} />
                </button>
              )}
              <button
                type="button"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors ml-1"
                aria-label="Close Assistant"
                onClick={() => {
                  setIsOpen(false);
                  onCloseModal?.();
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Locality Dropdown Selector */}
          {showLocalityMenu && (
            <div className="p-3 border-b border-gray-200 bg-white shadow-sm max-h-36 overflow-y-auto shrink-0">
              <div className="text-xs font-semibold text-gray-500 mb-1.5">Select your Mumbai locality:</div>
              <div className="flex flex-wrap gap-1.5">
                {MUMBAI_LOCALITIES.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      label === loc
                        ? "bg-red-600 text-white"
                        : "bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200"
                    }`}
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
          <div className="p-2 border-b border-gray-200 bg-gray-50/70 flex gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
            {ASSISTANT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className="px-3 py-1 rounded-full text-xs font-medium bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 shadow-2xs shrink-0 transition-colors"
                onClick={() => handleSend(cat.prompt)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Message List */}
          <div className="flex-1 p-4 overflow-y-auto bg-slate-50 space-y-3.5">
            {messages.length === 0 ? (
              <div className="text-center py-6">
                <div className="mb-4">
                  <div className="inline-flex p-3 rounded-2xl bg-red-50 text-red-600 mb-2 border border-red-100 shadow-sm">
                    <EmergencyIcon name="bot" size={30} />
                  </div>
                  <h4 className="text-sm font-bold text-gray-900 mb-1">How can MedReach help you today?</h4>
                  <p className="text-xs text-gray-500 px-4 max-w-sm mx-auto">
                    Ask about emergency care, hospital beds, urgent blood requirements, ambulances, diagnostics, or jobs.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5 text-left max-w-sm mx-auto">
                  <div className="text-xs font-semibold text-gray-400 px-1 uppercase tracking-wider">Suggested inquiries:</div>
                  {ASSISTANT_QUICK_ACTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="w-full text-left text-xs font-medium p-2.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 shadow-2xs hover:border-gray-300 transition-colors"
                      onClick={() => handleSend(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col space-y-3.5">
                {messages.map((msg) => (
                  <div
                    key={msg.id || Math.random()}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`p-3.5 shadow-sm text-sm ${
                        msg.role === "user"
                          ? "rounded-2xl rounded-tr-xs bg-red-600 text-white max-w-[85%]"
                          : "rounded-2xl rounded-tl-xs bg-white text-gray-900 border border-gray-200 max-w-[92%]"
                      }`}
                    >
                      {/* Message Content */}
                      <div className="text-xs leading-relaxed whitespace-pre-wrap">
                        {msg.text}
                      </div>

                      {/* Code Red Emergency Dialers if intent is emergency or unavailable */}
                      {(msg.intent === "emergency" || msg.intent === "unavailable") && (
                        <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200">
                          <div className="font-bold text-red-700 text-xs mb-1.5 flex items-center gap-1.5">
                            <EmergencyIcon name="siren" size={14} /> Immediate Emergency Contacts:
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <a
                              href="tel:112"
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors"
                            >
                              <EmergencyIcon name="phone" size={12} /> Call 112 (Emergency)
                            </a>
                            <a
                              href="tel:108"
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-red-300 bg-white text-red-700 hover:bg-red-50 transition-colors"
                            >
                              <EmergencyIcon name="ambulance" size={12} /> Call 108 (Ambulance)
                            </a>
                            <Link
                              href="/emergency"
                              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                              Emergency Mode ›
                            </Link>
                          </div>
                        </div>
                      )}

                      {/* Render Hospital Result Cards */}
                      {msg.hospitals?.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs font-semibold text-gray-500 mb-2">Verified Hospital Matches:</div>
                          {msg.hospitals.map((h) => (
                            <AssistantHospitalCard
                              key={h.id || h.slug}
                              hospital={h}
                              emergency={msg.intent === "emergency"}
                            />
                          ))}
                        </div>
                      )}

                      {/* Render Blood Bank Result Cards */}
                      {msg.bloodBanks?.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs font-semibold text-gray-500 mb-2">Verified Blood Banks:</div>
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
                          <div className="text-xs font-semibold text-gray-500 mb-2">Verified Ambulance Providers:</div>
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
                          <div className="text-xs font-semibold text-gray-500 mb-2">Diagnostic & Scan Centers:</div>
                          {msg.diagnostics.map((d) => (
                            <AssistantDiagnosticCard key={d.id || d.name} diagnostic={d} />
                          ))}
                        </div>
                      )}

                      {/* Render Job Result Cards */}
                      {msg.jobs?.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs font-semibold text-gray-500 mb-2">Active Clinical Openings:</div>
                          {msg.jobs.map((j) => (
                            <AssistantJobCard key={j.id} job={j} />
                          ))}
                        </div>
                      )}

                      {/* Suggested Actions Buttons */}
                      {msg.suggestedActions?.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-gray-100 flex flex-wrap gap-1.5">
                          {msg.suggestedActions.map((act, idx) => {
                            if (act.type === "call") {
                              return (
                                <a
                                  key={idx}
                                  href={`tel:${act.phone}`}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                                    act.primary
                                      ? "bg-red-600 hover:bg-red-700 text-white"
                                      : "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                  }`}
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
                                  className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                                    act.primary
                                      ? "bg-red-600 hover:bg-red-700 text-white"
                                      : "border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                                  }`}
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
                        <div className="mt-2.5 pt-2 border-t border-gray-100">
                          <div className="text-gray-400 text-[11px] mb-1">Suggested follow-ups:</div>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.suggestedPrompts.map((p) => (
                              <button
                                key={p}
                                type="button"
                                className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
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
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-xs p-3.5 shadow-sm">
                      <div className="flex items-center gap-2 text-gray-500 text-xs">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
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
          <div className="p-3.5 bg-white border-t border-gray-200 shrink-0">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <input
                ref={inputRef}
                type="text"
                className="flex-1 px-3.5 py-2 text-xs sm:text-sm rounded-xl border border-gray-300 focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none transition-all"
                placeholder="Ask about hospitals, urgent blood, ambulances…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={500}
                disabled={sending}
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white shadow-sm transition-colors shrink-0"
                disabled={sending || !input.trim()}
              >
                <span>Send</span> <EmergencyIcon name="navigate" size={14} />
              </button>
            </form>
            <div className="text-gray-400 mt-2 text-center text-[10px] sm:text-[11px] leading-tight">
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
