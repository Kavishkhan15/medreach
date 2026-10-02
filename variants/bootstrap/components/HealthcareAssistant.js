"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import EmergencyIcon from "./EmergencyIcons";
import {
  useAssistant, useLocation, ASSISTANT_CHAT_TITLE, ASSISTANT_DISCLAIMER,
  ASSISTANT_CATEGORIES, ASSISTANT_QUICK_ACTIONS, MUMBAI_LOCALITIES,
} from "@medreach/core";
import {
  AssistantHospitalCard, AssistantBloodBankCard, AssistantAmbulanceCard,
  AssistantDiagnosticCard, AssistantJobCard,
} from "./assistant";
import AmbulanceBookingModal from "./AmbulanceBookingModal";
import BloodBankActionModal from "./BloodBankActionModal";
import styles from "./HealthcareAssistant.module.css";

const initialQuestions = [
  "Cardiac emergency hospital in Andheri",
  "Maternity hospitals in Bandra",
  "Trauma centers near Dadar",
];

export default function HealthcareAssistant({ initialOpen = false, onCloseModal }) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState("");
  const {
    messages, sending, unavailable, send, reset, activeModal, modalData,
    openAmbulanceModal, openBloodModal, closeModals,
  } = useAssistant();
  const { origin, label, useLocality } = useLocation();
  const conversationRef = useRef(null);
  const inputRef = useRef(null);
  const actionModalRef = useRef(null);
  const actionTriggerRef = useRef(null);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      const body = conversationRef.current;
      if (!body) return;
      const latestMessage = body.querySelector("[data-message]:last-child");
      const top = sending ? body.scrollHeight : latestMessage
        ? body.scrollTop + latestMessage.getBoundingClientRect().top - body.getBoundingClientRect().top - 16
        : 0;
      body.scrollTo({ top, behavior: "smooth" });
    }
  }, [messages, sending, isOpen, isMinimized]);

  useEffect(() => {
    if (!isOpen || isMinimized) return;
    const timer = setTimeout(() => {
      if (!actionModalRef.current?.childElementCount) inputRef.current?.focus({ preventScroll: true });
    }, 100);
    return () => clearTimeout(timer);
  }, [isOpen, isMinimized]);

  useEffect(() => {
    if (!activeModal) return;
    actionTriggerRef.current = document.activeElement;
    const timer = setTimeout(() => {
      actionModalRef.current?.querySelector("button, input, select, textarea, a[href]")?.focus({ preventScroll: true });
    }, 0);
    return () => {
      clearTimeout(timer);
      actionTriggerRef.current?.focus({ preventScroll: true });
    };
  }, [activeModal]);

  useEffect(() => {
    const handleOpen = (event) => {
      setIsOpen(true);
      setIsMinimized(false);
      if (event?.detail?.query) send(event.detail.query, { locality: label, origin });
    };
    window.addEventListener("medreach:open-assistant", handleOpen);
    return () => window.removeEventListener("medreach:open-assistant", handleOpen);
  }, [label, origin, send]);

  const close = () => { setIsOpen(false); onCloseModal?.(); };
  const handleSend = (textToSend) => {
    const text = (textToSend ?? input).trim();
    if (!text || sending) return;
    send(text, { locality: label, origin });
    setInput("");
  };
  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return <>
    {isOpen && <section className={styles.panel} data-expanded={isExpanded} data-minimized={isMinimized} data-action-open={Boolean(activeModal)}
      aria-hidden={Boolean(activeModal)}
      role="dialog" aria-label={ASSISTANT_CHAT_TITLE}
      onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <header className={styles.header}>
        <div className={styles.avatar}><EmergencyIcon name="bot" size={21} /></div>
        <div className={styles.identity}>
          <h2>{ASSISTANT_CHAT_TITLE}</h2>
          <div className={styles.meta}>
            <span>Mumbai Care Network</span>
            <span className={styles.status} data-unavailable={unavailable}><i />{unavailable ? "Unavailable" : "Online"}</span>
          </div>
        </div>
        <div className={styles.controls}>
          <button type="button" className={styles.windowControl} aria-label={isMinimized ? "Restore Assistant" : "Minimize Assistant"}
            onClick={() => setIsMinimized(value => !value)}><span aria-hidden="true">{isMinimized ? "+" : "−"}</span></button>
          <button type="button" className={styles.windowControl} aria-label="Close Assistant" onClick={close}><span aria-hidden="true">×</span></button>
        </div>
      </header>
      {!isMinimized && <>
        <div className={styles.conversation} ref={conversationRef} aria-label="Conversation" role="log" aria-live="polite">
          {messages.length === 0 ? <div className={styles.welcome}>
            <h3>How can I help you today?</h3>
            <p>Find healthcare providers, explore care options, or get help with a request in Mumbai.</p>
            <nav className={styles.actionRow} aria-label="Healthcare directories">
              <Link className={styles.action} href="/hospitals"><EmergencyIcon name="hospital" size={14} />Browse All Mumbai Hospitals</Link>
              <Link className={styles.action} href="/map"><EmergencyIcon name="pin" size={14} />Open Interactive Care Map</Link>
            </nav>
            <div className={styles.followups}>
              <p className={styles.sectionLabel}>You could ask</p>
              <div className={styles.chips}>{initialQuestions.map(question => <button type="button" className={styles.chip}
                key={question} onClick={() => handleSend(question)} disabled={sending}>{question}</button>)}</div>
            </div>

          </div> : <div className={styles.messages}>
            {messages.map((message, index) => <article key={message.id || `${message.role}-${index}`}
              className={message.role === "user" ? styles.userMessage : styles.assistantMessage} data-message={message.role}>
              <p className={styles.messageText}>{message.text}</p>
              {(message.intent === "emergency" || message.intent === "unavailable") && <div className={styles.emergency}>
                <p className={styles.sectionLabel}><EmergencyIcon name="siren" size={14} />Immediate emergency contacts</p>
                <div className={styles.actionRow}>
                  <a className={styles.primaryAction} href="tel:112"><EmergencyIcon name="phone" size={13} />Call 112 (Emergency)</a>
                  <a className={styles.action} href="tel:108"><EmergencyIcon name="ambulance" size={13} />Call 108 (Ambulance)</a>
                  <Link className={styles.action} href="/emergency">Emergency Mode ›</Link>
                </div>
              </div>}
              {message.hospitals?.length > 0 && <section className={styles.results} aria-label="Hospital matches">
                <p className={styles.sectionLabel}>Hospital matches</p>
                {message.hospitals.map(hospital => <AssistantHospitalCard key={hospital.id || hospital.slug} hospital={hospital} emergency={message.intent === "emergency"} />)}
              </section>}
              {message.bloodBanks?.length > 0 && <section className={styles.results} aria-label="Blood banks">
                <p className={styles.sectionLabel}>Blood banks</p>
                {message.bloodBanks.map(bank => <AssistantBloodBankCard key={bank.id || bank.name} bloodBank={bank} onRequestBlood={openBloodModal} />)}
              </section>}
              {message.ambulances?.length > 0 && <section className={styles.results} aria-label="Ambulance providers">
                <p className={styles.sectionLabel}>Ambulance providers</p>
                {message.ambulances.map(ambulance => <AssistantAmbulanceCard key={ambulance.id || ambulance.name} ambulance={ambulance} onBookAmbulance={openAmbulanceModal} />)}
              </section>}
              {message.diagnostics?.length > 0 && <section className={styles.results} aria-label="Diagnostics">
                <p className={styles.sectionLabel}>Diagnostic & scan centers</p>
                {message.diagnostics.map(diagnostic => <AssistantDiagnosticCard key={diagnostic.id || diagnostic.name} diagnostic={diagnostic} />)}
              </section>}
              {message.jobs?.length > 0 && <section className={styles.results} aria-label="Healthcare jobs">
                <p className={styles.sectionLabel}>Clinical openings</p>
                {message.jobs.map(job => <AssistantJobCard key={job.id} job={job} />)}
              </section>}
              {message.suggestedActions?.length > 0 && <div className={styles.actionRow}>
                {message.suggestedActions.map((action, index) => action.type === "call"
                  ? <a key={index} className={action.primary ? styles.primaryAction : styles.action} href={`tel:${action.phone}`}><EmergencyIcon name="phone" size={13} />{action.label}</a>
                  : action.url ? <Link key={index} className={action.primary ? styles.primaryAction : styles.action} href={action.url}>{action.label}</Link> : null)}
              </div>}
              {message.suggestedPrompts?.length > 0 && <div className={styles.followups}>
                <p className={styles.sectionLabel}>Suggested follow-ups</p>
                <div className={styles.chips}>{message.suggestedPrompts.map(prompt => <button type="button" key={prompt} className={styles.chip}
                  onClick={() => handleSend(prompt)} disabled={sending}>{prompt}</button>)}</div>
              </div>}
            </article>)}
          </div>}
          {sending && <p className={styles.typing} role="status"><span />Consulting MedReach records…</p>}
            <details className={styles.options}>
              <summary>More ways to ask</summary>
              <div className={styles.chips}>
                {ASSISTANT_QUICK_ACTIONS.map(question => <button type="button" className={styles.chip} key={question}
                  onClick={() => handleSend(question)} disabled={sending}>{question}</button>)}
                {ASSISTANT_CATEGORIES.map(category => <button type="button" className={styles.chip} key={category.id}
                  onClick={() => handleSend(category.prompt)} disabled={sending}>{category.label}</button>)}
              </div>
            </details>
          <details className={styles.options}>
            <summary>Conversation options</summary>
            <label className={styles.locality}>Mumbai locality
              <select aria-label="Mumbai locality" value={MUMBAI_LOCALITIES.includes(label) ? label : ""}
                onChange={(event) => { if (event.target.value) useLocality(event.target.value); }}>
                <option value="" disabled>{label || "Choose an area"}</option>
                {MUMBAI_LOCALITIES.map(locality => <option key={locality} value={locality}>{locality}</option>)}
              </select>
            </label>
            <div className={styles.actionRow}>
              <button type="button" className={styles.action} onClick={() => setIsExpanded(value => !value)}>{isExpanded ? "Compact view" : "Expand view"}</button>
              {messages.length > 0 && <button type="button" className={styles.action} onClick={reset} disabled={sending} aria-label="Clear chat">Clear conversation</button>}
            </div>
          </details>
        </div>
        <footer className={styles.footer}>
          <form className={styles.inputRow} onSubmit={(event) => { event.preventDefault(); handleSend(); }}>
            <input ref={inputRef} type="text" className={styles.input} aria-label="Message MedReach Healthcare Assistant"
              placeholder="Ask about hospitals, urgent blood, ambulances..." value={input} onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown} maxLength={500} disabled={sending} />
            <button type="submit" className={styles.send} disabled={sending || !input.trim()}>Send<EmergencyIcon name="navigate" size={13} /></button>
          </form>
          <p className={styles.disclaimer}>{ASSISTANT_DISCLAIMER}</p>
        </footer>
      </>}
    </section>}
    <div ref={actionModalRef}>
    {activeModal === "ambulance" && <AmbulanceBookingModal provider={modalData} onClose={closeModals} />}
    {activeModal === "blood" && <BloodBankActionModal bloodBank={modalData} onClose={closeModals} />}
    </div>
  </>;
}
