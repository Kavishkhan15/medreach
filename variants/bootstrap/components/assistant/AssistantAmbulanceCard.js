"use client";
import React from "react";
import EmergencyIcon from "../EmergencyIcons";

export default function AssistantAmbulanceCard({ ambulance, onBookAmbulance }) {
  if (!ambulance) return null;

  const phone = ambulance.phone || "108";

  return (
    <div className="card border-0 shadow-sm rounded-3 mb-2 overflow-hidden bg-white assistant-card">
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
          <h4 className="h6 fw-bold mb-0 text-dark">
            <span className="text-warning-emphasis me-1">🚑</span>
            {ambulance.name}
          </h4>
          <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle" style={{ fontSize: "0.7rem" }}>
            24/7 Transit
          </span>
        </div>

        <div className="text-muted small mb-1">
          <span className="fw-semibold text-dark">{ambulance.providerType || "Medical Ambulance"}</span>
        </div>

        <div className="text-muted small mb-2 d-flex flex-wrap align-items-center gap-1">
          <span className="d-inline-flex align-items-center gap-1">
            <EmergencyIcon name="pin" size={12} className="text-secondary" />
            {ambulance.locality || "Mumbai"}
          </span>
          {ambulance.distanceKm != null && (
            <span>· <strong>{ambulance.distanceKm.toFixed(1)} km</strong></span>
          )}
          {ambulance.coverageArea && (
            <span>· <span>Coverage: {ambulance.coverageArea}</span></span>
          )}
        </div>

        <div className="d-flex flex-wrap gap-1 mt-2 pt-2 border-top align-items-center">
          <a href={`tel:${phone}`} className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1">
            <EmergencyIcon name="phone" size={13} /> Call {phone}
          </a>

          {onBookAmbulance && (
            <button
              type="button"
              className="btn btn-sm btn-primary text-white d-inline-flex align-items-center gap-1"
              onClick={() => onBookAmbulance(ambulance)}
            >
              <EmergencyIcon name="ambulance" size={13} /> Book Ambulance
            </button>
          )}

          <a href="tel:108" className="btn btn-sm btn-light border text-danger ms-auto d-inline-flex align-items-center gap-1" title="Government Emergency Ambulance">
            Dial 108
          </a>
        </div>
      </div>
    </div>
  );
}
