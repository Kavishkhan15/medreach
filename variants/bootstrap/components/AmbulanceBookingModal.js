"use client";
import React, { useState } from "react";
import EmergencyIcon from "../components/EmergencyIcons";

export default function AmbulanceBookingModal({ provider, onClose }) {
  // Form state
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [ambulanceRequired, setAmbulanceRequired] = useState(false);
  const [bookingPickup, setBookingPickup] = useState("");
  const [bookingDetails, setBookingDetails] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const validate = () => {
    if (!patientName.trim()) return "Patient Name is required";
    if (!patientAge || isNaN(patientAge) || Number(patientAge) <= 0) return "Valid Patient Age is required";
    if (ambulanceRequired && !bookingPickup.trim()) return "Pickup address is required when ambulance is needed";
    return null;
  };

  const handleSubmit = () => {
    const validationError = validate();
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }
    console.log({
      providerId: provider?._id,
      providerSlug: provider?.slug,
      patientName,
      patientAge: Number(patientAge),
      ambulanceRequired,
      bookingPickup,
      bookingDetails,
    });
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        className="modal-content bg-white p-4 rounded shadow"
        style={{ width: "90%", maxWidth: "500px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-1">
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
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit}>
              Submit Booking
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
