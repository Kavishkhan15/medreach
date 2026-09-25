"use client";
import React from "react";
import HealthcareAssistant from "./HealthcareAssistant";

// Forwarding wrapper for backward compatibility with SosButton or any existing call sites
export default function AiAssistantModal({ open, onClose }) {
  if (!open) return null;
  return <HealthcareAssistant initialOpen={true} onCloseModal={onClose} />;
}
