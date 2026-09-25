"use client";
import React from "react";
import Link from "next/link";
import EmergencyIcon from "../EmergencyIcons";

export default function AssistantDiagnosticCard({ diagnostic }) {
  if (!diagnostic) return null;

  const hasCoords =
    Array.isArray(diagnostic.coordinates) &&
    diagnostic.coordinates.length === 2 &&
    Number.isFinite(diagnostic.coordinates[0]) &&
    Number.isFinite(diagnostic.coordinates[1]);

  return (
    <div className="card border-0 shadow-sm rounded-3 mb-2 overflow-hidden bg-white assistant-card">
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
          <h4 className="h6 fw-bold mb-0 text-dark">
            <span className="text-info me-1">🔬</span>
            {diagnostic.name}
          </h4>
          <span className="badge bg-info-subtle text-info-emphasis border border-info-subtle" style={{ fontSize: "0.7rem" }}>
            Diagnostics
          </span>
        </div>

        <div className="text-muted small mb-2 d-flex flex-wrap align-items-center gap-1">
          <span className="d-inline-flex align-items-center gap-1">
            <EmergencyIcon name="pin" size={12} className="text-secondary" />
            {diagnostic.locality || "Mumbai"}
          </span>
          {diagnostic.distanceKm != null && (
            <span>· <strong>{diagnostic.distanceKm.toFixed(1)} km</strong></span>
          )}
          {diagnostic.operatingHours && (
            <span>· <span>{diagnostic.operatingHours}</span></span>
          )}
        </div>

        {diagnostic.services?.length > 0 && (
          <div className="mb-2">
            <div className="text-muted" style={{ fontSize: "0.72rem" }}>Available Tests & Scans:</div>
            <div className="d-flex flex-wrap gap-1 mt-1">
              {diagnostic.services.slice(0, 5).map((srv) => (
                <span key={srv} className="badge bg-light text-dark border fw-normal" style={{ fontSize: "0.72rem" }}>
                  {srv}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="d-flex flex-wrap gap-1 mt-2 pt-2 border-top">
          {diagnostic.phone && (
            <a href={`tel:${diagnostic.phone}`} className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1">
              <EmergencyIcon name="phone" size={13} /> Call
            </a>
          )}
          {hasCoords && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${diagnostic.coordinates[1]},${diagnostic.coordinates[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
            >
              <EmergencyIcon name="navigate" size={13} /> Directions
            </a>
          )}
          <Link href="/diagnostics" className="btn btn-sm btn-light border text-secondary ms-auto">
            Directory ›
          </Link>
        </div>
      </div>
    </div>
  );
}
