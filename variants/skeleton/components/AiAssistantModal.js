"use client";
import HealthcareAssistant from "./HealthcareAssistant";

export default function AiAssistantModal({ open, onClose }) {
  if (!open) return null;
  return <HealthcareAssistant initialOpen={true} onCloseModal={onClose} />;
}
