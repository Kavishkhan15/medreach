"use client";
import React from "react";
import Link from "next/link";
import EmergencyIcon from "../EmergencyIcons";

export default function AssistantHospitalCard({ hospital, onAction }) {
  if (!hospital) return null;

  const hasCoords =
    Array.isArray(hospital.coordinates) &&
    hospital.coordinates.length === 2 &&
    Number.isFinite(hospital.coordinates[0]) &&
    Number.isFinite(hospital.coordinates[1]);

  const phone = hospital.phone || hospital.emergencyPhone;
  const slug = hospital.slug || hospital.id;

  const requestBedUrl = `/requests/new?hospital=${encodeURIComponent(hospital.id || slug)}&isEmergency=true&flow=emergency&facility=Emergency%20Department`;

  return (
    <div className="card border-0 shadow-sm rounded-3 mb-2 overflow-hidden bg-white assistant-card">
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
          <h4 className="h6 fw-bold mb-0 text-dark">
            <Link href={`/hospitals/${slug}`} className="text-dark text-decoration-none hover-primary">
              {hospital.name}
            </Link>
          </h4>
          {hospital.verificationStatus === "verified" && (
            <span className="badge bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1 flex-shrink-0" style={{ fontSize: "0.7rem" }}>
              <EmergencyIcon name="verified" size={12} /> Verified
            </span>
          )}
        </div>

        <div className="text-muted small mb-2 d-flex flex-wrap align-items-center gap-1">
          <span className="d-inline-flex align-items-center gap-1">
            <EmergencyIcon name="pin" size={12} className="text-secondary" />
            {hospital.locality || "Mumbai"}
          </span>
          {hospital.distanceKm != null && (
            <span>· <strong>{hospital.distanceKm.toFixed(1)} km</strong></span>
          )}
          {hospital.hospitalType && (
            <span>· <span className="text-capitalize">{hospital.hospitalType}</span></span>
          )}
        </div>

        {hospital.facilityDetail && (
          <div className="p-2 mb-2 rounded bg-light border text-secondary small">
            <div className="d-flex justify-content-between align-items-center">
              <span className="fw-semibold text-dark">{hospital.facilityDetail.facility}:</span>
              <span className={`badge ${hospital.facilityDetail.status === "available" ? "bg-success" : hospital.facilityDetail.status === "limited" ? "bg-warning text-dark" : "bg-secondary"}`}>
                {hospital.facilityDetail.status === "unknown" ? "Status unconfirmed" : hospital.facilityDetail.status}
              </span>
            </div>
            {hospital.facilityDetail.retrievedAtRelative && (
              <div className="text-muted mt-1" style={{ fontSize: "0.72rem" }}>
                Updated {hospital.facilityDetail.retrievedAtRelative}
              </div>
            )}
          </div>
        )}

        {hospital.specialties?.length > 0 && (
          <div className="d-flex flex-wrap gap-1 mb-2">
            {hospital.specialties.slice(0, 3).map((spec) => (
              <span key={spec} className="badge bg-light text-secondary border fw-normal" style={{ fontSize: "0.72rem" }}>
                {spec}
              </span>
            ))}
          </div>
        )}

        <div className="d-flex flex-wrap gap-1 mt-2 pt-2 border-top">
          {phone && (
            <a href={`tel:${phone}`} className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1">
              <EmergencyIcon name="phone" size={13} /> Call
            </a>
          )}
          {hasCoords && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${hospital.coordinates[1]},${hospital.coordinates[0]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
            >
              <EmergencyIcon name="navigate" size={13} /> Directions
            </a>
          )}
          <Link
            href={requestBedUrl}
            className="btn btn-sm btn-danger text-white d-inline-flex align-items-center gap-1"
          >
            <EmergencyIcon name="bed" size={13} /> Bed Request
          </Link>
          <Link
            href={`/hospitals/${slug}`}
            className="btn btn-sm btn-light border text-secondary ms-auto"
          >
            Details ›
          </Link>
        </div>
      </div>
    </div>
  );
}
