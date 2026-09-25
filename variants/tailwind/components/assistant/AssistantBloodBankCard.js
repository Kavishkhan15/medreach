"use client";
import React from "react";
import Link from "next/link";
import EmergencyIcon from "../EmergencyIcons";

export default function AssistantBloodBankCard({ bloodBank, onRequestBlood }) {
  if (!bloodBank) return null;

  const hasCoords =
    Array.isArray(bloodBank.coordinates) &&
    bloodBank.coordinates.length === 2 &&
    Number.isFinite(bloodBank.coordinates[0]) &&
    Number.isFinite(bloodBank.coordinates[1]);

  return (
    <div className="card border-0 shadow-sm rounded-3 mb-2 overflow-hidden bg-white assistant-card">
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
          <h4 className="h6 fw-bold mb-0 text-dark">
            <span className="text-danger me-1">🩸</span>
            {bloodBank.name}
          </h4>
          <span className="badge bg-danger-subtle text-danger border border-danger-subtle" style={{ fontSize: "0.7rem" }}>
            Blood Bank
          </span>
        </div>

        <div className="text-muted small mb-2 d-flex flex-wrap align-items-center gap-1">
          <span className="d-inline-flex align-items-center gap-1">
            <EmergencyIcon name="pin" size={12} className="text-secondary" />
            {bloodBank.locality || "Mumbai"}
          </span>
          {bloodBank.distanceKm != null && (
            <span>· <strong>{bloodBank.distanceKm.toFixed(1)} km</strong></span>
          )}
          {bloodBank.operatingHours && (
            <span>· <span>{bloodBank.operatingHours}</span></span>
          )}
        </div>

        {bloodBank.listedBloodGroups?.length > 0 && (
          <div className="mb-2">
            <div className="text-muted" style={{ fontSize: "0.72rem" }}>Listed Blood Groups:</div>
            <div className="d-flex flex-wrap gap-1 mt-1">
              {bloodBank.listedBloodGroups.map((bg) => (
                <span key={bg} className="badge bg-light text-danger border border-danger-subtle fw-semibold" style={{ fontSize: "0.72rem" }}>
                  {bg}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="d-flex flex-wrap gap-1 mt-2 pt-2 border-top">
          {bloodBank.phone && (
            <a href={`tel:${bloodBank.phone}`} className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1">
              <EmergencyIcon name="phone" size={13} /> Call
            </a>
          )}
          {hasCoords && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${bloodBank.coordinates[1]},${bloodBank.coordinates[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
            >
              <EmergencyIcon name="navigate" size={13} /> Directions
            </a>
          )}
          {onRequestBlood && (
            <button
              type="button"
              className="btn btn-sm btn-danger text-white d-inline-flex align-items-center gap-1"
              onClick={() => onRequestBlood(bloodBank)}
            >
              Request Units
            </button>
          )}
          <Link
            href="/urgent-blood"
            className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1 ms-auto"
          >
            Urgent (6h-2d) ›
          </Link>
        </div>
      </div>
    </div>
  );
}
