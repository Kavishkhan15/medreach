"use client";
import React, { useState, useEffect } from "react";
import EmergencyIcon from "../components/EmergencyIcons";
import { useAuth } from "@medreach/core";
import { post } from "../lib/productApi";

export default function AmbulanceBookingModal({ provider, onClose }) {
  const { user } = useAuth() || {};

  // Form state
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
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
    if ((user?.emergencyContact || user?.phone) && !contactPhone) setContactPhone(user.emergencyContact || user.phone);
  }, [user]);

  const validate = () => {
    if (!patientName.trim()) return "Patient Name is required";
    if (!patientAge || isNaN(patientAge) || Number(patientAge) <= 0) return "Valid Patient Age is required";
    if (!contactPhone.trim() && !contactEmail.trim()) return "A contact phone or email is required";
    if (ambulanceRequired && !bookingPickup.trim()) return "Pickup address is required when ambulance is needed";
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }
    setErrorMsg("");
    setSubmitting(true);
    try {
      const res = await post("/api/ambulances/book", {
        providerId: provider?._id,
        providerName: provider?.name,
        patientName,
        patientAge: Number(patientAge),
        ambulanceRequired,
        bookingPickup,
        bookingDetails,
        contactEmail: contactEmail.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
      });
      if (res.trackingToken) {
        window.sessionStorage.setItem(`medreach:ambulance-booking-token:${res.reference}`, res.trackingToken);
      }
      const providerMessage = res.delivery?.provider?.sent
        ? "The provider notification email was sent. Call to confirm dispatch."
        : "The provider notification email was not sent. Call the provider directly to confirm availability.";
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
      aria-labelledby="ambulance-booking-title"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1060,
      }}
    >
      <div
        className="modal-content bg-white p-4 rounded shadow"
        style={{ width: "90%", maxWidth: "500px", maxHeight: "calc(100vh - 2rem)", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="ambulance-booking-title" className="text-lg font-bold mb-1">
          Book Ambulance – {provider?.name}
        </h3>
        <p className="small text-muted mb-3">
          For acute life-threatening emergencies, dial <a href="tel:108" className="fw-bold text-danger">108</a> or <a href="tel:112" className="fw-bold text-danger">112</a> immediately.
        </p>
        {errorMsg && (
          <div className="alert alert-danger" role="alert" style={{ marginBottom: "1rem" }}>
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="alert alert-success" role="alert" style={{ marginBottom: "1rem" }}>
            {successMsg}
            {tracking && <div className="mt-2"><a href={`/track?type=ambulance&reference=${encodeURIComponent(tracking.reference)}${tracking.token ? `#token=${encodeURIComponent(tracking.token)}` : ""}`} className="btn btn-sm btn-outline-danger">Track request</a></div>}
          </div>
        )}
        <form className="row g-3">
          <div className="col-12">
            <label className="form-label fw-semibold">
              Patient Name *
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="Enter patient name"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              required
            />
          </div>
          <div className="col-12">
            <label className="form-label fw-semibold">
              Patient Age *
            </label>
            <input
              type="number"
              className="form-control"
              min="0"
              placeholder="Age in years"
              value={patientAge}
              onChange={(e) => setPatientAge(e.target.value)}
              required
            />
          </div>
          <div className="col-md-6 col-12">
            <label className="form-label fw-semibold">
              Contact Email (for confirmation)
            </label>
            <input
              type="email"
              className="form-control"
              placeholder="name@example.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>
          <div className="col-md-6 col-12">
            <label className="form-label fw-semibold">
              Contact Phone
            </label>
            <input
              type="tel"
              className="form-control"
              placeholder="e.g. 9876543210"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
          <div className="col-12">
            <label className="form-label fw-semibold">
              Ambulance Required?
            </label>
            <select
              className="form-select"
              value={ambulanceRequired ? "yes" : "no"}
              onChange={(e) => setAmbulanceRequired(e.target.value === "yes")}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
          {ambulanceRequired && (
            <div className="col-12">
              <label className="form-label fw-semibold">
                Pickup Address
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Enter address"
                value={bookingPickup}
                onChange={(e) => setBookingPickup(e.target.value)}
                required={ambulanceRequired}
              />
            </div>
          )}
          <div className="col-12">
            <label className="form-label fw-semibold">
              Notes / Additional Information
            </label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Any extra info"
              value={bookingDetails}
              onChange={(e) => setBookingDetails(e.target.value)}
            />
          </div>
          <div className="col-12 d-flex justify-content-end gap-2 mt-3">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting || Boolean(successMsg)}
            >
              {submitting ? "Submitting..." : "Submit Booking"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
