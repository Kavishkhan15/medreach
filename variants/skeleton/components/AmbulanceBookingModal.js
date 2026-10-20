"use client";

import React, { useState, useEffect } from "react";
import EmergencyIcon from "./EmergencyIcons";
import { useAuth } from "@medreach/core";
import { post } from "../lib/productApi";

export default function AmbulanceBookingModal({ provider, onClose }) {
  const { user } = useAuth() || {};

  // Form state
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [ambulanceRequired, setAmbulanceRequired] = useState(false);
  const [bookingPickup, setBookingPickup] = useState("");
  const [bookingDetails, setBookingDetails] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [tracking, setTracking] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.email && !contactEmail) setContactEmail(user.email);
    if ((user?.emergencyContact || user?.phone) && !contactPhone) {
      setContactPhone(user.emergencyContact || user.phone);
    }
  }, [user]);

  const validate = () => {
    if (!patientName.trim()) return "Patient Name is required";
    if (!patientAge || isNaN(patientAge) || Number(patientAge) <= 0) return "Valid Patient Age is required";
    if (!contactPhone.trim() && !contactEmail.trim()) return "A contact phone or email is required";
    if (ambulanceRequired && !bookingPickup.trim()) return "Pickup address is required when ambulance is needed";
    return null;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }
    setErrorMsg("");
    setSubmitting(true);
    try {
      const res = await post("/api/ambulances/book", {
        providerId: provider?._id || provider?.id,
        providerName: provider?.name,
        patientName,
        patientAge: Number(patientAge),
        isEmergency,
        ambulanceRequired,
        bookingPickup,
        bookingDetails,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
      });
      if (res.trackingToken) {
        window.sessionStorage.setItem(`medreach:ambulance-booking-token:${res.reference}`, res.trackingToken);
      }
      const delivery = res.delivery?.provider;
      let providerMessage;
      if (delivery?.status === "pending") {
        providerMessage = "The provider notification email is queued. Call the provider to confirm availability and dispatch.";
      } else if (delivery?.status === "uncertain") {
        providerMessage = "The provider notification outcome is unconfirmed. Call the provider directly to confirm availability.";
      } else if (delivery?.status === "sent" || delivery?.sent) {
        providerMessage = "The mail service accepted the provider notification. Call to confirm dispatch.";
      } else {
        providerMessage = "The provider notification email was not sent. Call the provider directly to confirm availability.";
      }
      setTracking({ reference: res.reference, token: res.trackingToken });
      setSuccessMsg(`Request ${res.reference} was recorded. ${providerMessage}`);
    } catch (err) {
      setErrorMsg(err.message || "Failed to submit ambulance booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="skeleton-ambulance-booking-title"
      style={{ zIndex: 1060 }}
    >
      <div
        className="modal-content"
        style={{ maxWidth: "520px", padding: "1.5rem", maxHeight: "calc(100vh - 2rem)", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 border-bottom pb-2">
          <div className="flex items-center gap-2">
            <span className="badge badge-soft-warning p-2">
              <EmergencyIcon name="ambulance" size={22} />
            </span>
            <div>
              <h3 id="skeleton-ambulance-booking-title" className="h6 fw-bold mb-0 text-dark">
                Book Ambulance
              </h3>
              <p className="disclaimer mb-0">{provider?.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-close"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="alert alert-danger small mb-3">
          <strong>Emergency Protocol:</strong> For immediate critical response, dial{" "}
          <a href="tel:108" className="fw-bold">108</a> or{" "}
          <a href="tel:112" className="fw-bold">112</a> directly.
        </div>

        {errorMsg && <div className="alert alert-danger small mb-3">{errorMsg}</div>}

        {successMsg ? (
          <div className="text-center py-4">
            <div className="text-success mb-2">
              <EmergencyIcon name="check" size={36} />
            </div>
            <h4 className="h6 fw-bold text-dark mb-1">Booking Recorded</h4>
            <p className="small text-secondary mb-3">{successMsg}</p>
            {tracking && <div className="mb-3"><a href={`/track?type=ambulance&reference=${encodeURIComponent(tracking.reference)}${tracking.token ? `#token=${encodeURIComponent(tracking.token)}` : ""}`} className="btn btn-sm btn-outline-danger">Track request</a></div>}
            <button
              type="button"
              onClick={onClose}
              className="btn btn-sm btn-outline-secondary"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
<label><input type="checkbox" checked={isEmergency} onChange={(e) => setIsEmergency(e.target.checked)} /> This is an emergency request</label><p>Ordinary transport stays separate. For immediate emergency assistance call 112.</p>

            <div className="mb-2">
              <label className="form-label small fw-bold text-uppercase">Patient Full Name *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Rahul Sharma"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                required
              />
            </div>

            <div className="grid-2 mb-2">
              <div>
                <label className="form-label small fw-bold text-uppercase">Patient Age *</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  className="form-control"
                  placeholder="Age in years"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="form-label small fw-bold text-uppercase">Ambulance Needed?</label>
                <select
                  className="form-select"
                  value={ambulanceRequired ? "yes" : "no"}
                  onChange={(e) => setAmbulanceRequired(e.target.value === "yes")}
                >


                  <option value="no">No (Consultation)</option>
                  <option value="yes">Yes (Pickup requested)</option>
                </select>
              </div>
            </div>

            {ambulanceRequired && (
              <div className="mb-2">
                <label className="form-label small fw-bold text-uppercase">Pickup Address *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Street address, landmark, locality"
                  value={bookingPickup}
                  onChange={(e) => setBookingPickup(e.target.value)}
                  required={ambulanceRequired}
                />
              </div>
            )}

            <div className="grid-2 mb-2">
              <div>
                <label className="form-label small fw-bold text-uppercase">Contact Phone (or email required)</label>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="+91 98200 12345"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label small fw-bold text-uppercase">Email (or phone required)</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="email@example.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label small fw-bold text-uppercase">Medical Notes</label>
              <textarea
                rows={2}
                className="form-control"
                placeholder="Chief complaints, emergency condition"
                value={bookingDetails}
                onChange={(e) => setBookingDetails(e.target.value)}
              />
            </div>

            <div className="flex justify-between items-center gap-2 pt-2 border-top">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-sm btn-danger"
              >
                {submitting ? "Booking Ambulance..." : "Confirm Booking"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
