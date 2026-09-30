"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@medreach/core";
import { post } from "../lib/productApi";
import EmergencyIcon from "./EmergencyIcons";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

export default function BloodBankActionModal({ bloodBank, onClose }) {
  const [activeTab, setActiveTab] = useState("request"); // 'request' | 'donate'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submittedData, setSubmittedData] = useState(null);

  const { user } = useAuth() || {};
  const isLoggedIn = !!user;

  // Request form state
  const [requestData, setRequestData] = useState({
    patientName: "",
    bloodGroup: "O+",
    units: 1,
    timing: "3 days",
    hospitalName: "",
    contactPhone: "",
    contactEmail: "",
    doctorNotes: "",
  });

  // Donation form state
  const [donateData, setDonateData] = useState({
    donorName: "",
    bloodGroup: "O+",
    age: 25,
    weight: 60,
    preferredDate: new Date().toISOString().slice(0, 10),
    contactPhone: "",
    contactEmail: "",
    healthConfirmed: false,
    notes: "",
  });

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        type: "REQUEST",
        providerId: bloodBank?._id,
        bloodBankName: bloodBank?.name || "Partner Blood Bank",
        bloodGroup: requestData.bloodGroup,
        patientOrDonorName: requestData.patientName,
        units: Number(requestData.units),
        urgency: requestData.timing,
        hospitalName: requestData.hospitalName,
        doctorNotes: requestData.doctorNotes,
        contactPhone: requestData.contactPhone,
        contactEmail: requestData.contactEmail,
      };
      const res = await post("/api/blood-requests/standard", payload);
      const reference = res.reference || res.bloodRequest?.reference;
      if (res.trackingToken && reference) {
        window.sessionStorage.setItem(`medreach:blood-request-token:${reference}`, res.trackingToken);
      }
      setSubmittedData({
        type: "REQUEST",
        reference,
        trackingToken: res.trackingToken,
        bloodBankName: bloodBank?.name,
        details: payload,
      });
    } catch (err) {
      setError(err.message || "Failed to submit blood requisition request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDonateSubmit = async (e) => {
    e.preventDefault();
    if (!donateData.healthConfirmed) {
      setError("Please confirm the health and eligibility declaration.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        type: "DONATION",
        providerId: bloodBank?._id,
        bloodBankName: bloodBank?.name || "Partner Blood Bank",
        bloodGroup: donateData.bloodGroup,
        patientOrDonorName: donateData.donorName,
        age: Number(donateData.age),
        weight: Number(donateData.weight),
        preferredDate: donateData.preferredDate,
        contactPhone: donateData.contactPhone,
        contactEmail: donateData.contactEmail,
        notes: donateData.notes,
      };
      const res = await post("/api/blood-requests/standard", payload);
      const reference = res.reference || res.bloodRequest?.reference;
      if (res.trackingToken && reference) {
        window.sessionStorage.setItem(`medreach:blood-request-token:${reference}`, res.trackingToken);
      }
      setSubmittedData({
        type: "DONATION",
        reference,
        trackingToken: res.trackingToken,
        bloodBankName: bloodBank?.name,
        details: payload,
      });
    } catch (err) {
      setError(err.message || "Failed to submit blood donation pledge");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-content"
        style={{ maxWidth: "560px", padding: "1.5rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3 border-bottom pb-2">
          <div className="flex items-center gap-2">
            <span className="badge badge-soft-danger p-2">
              <EmergencyIcon name="blood" size={22} />
            </span>
            <div>
              <h3 className="h6 fw-bold mb-0 text-dark">
                {submittedData
                  ? "Blood Action Confirmed"
                  : `Blood Services: ${bloodBank?.name || "Blood Centre"}`}
              </h3>
              <p className="disclaimer mb-0">
                {bloodBank?.address || bloodBank?.locality || "Mumbai Blood Services Network"}
              </p>
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

        {submittedData ? (
          <div className="text-center py-4">
            <div className="text-success mb-2">
              <EmergencyIcon name="check" size={36} />
            </div>
            <h4 className="h6 fw-bold text-dark mb-1">
              {submittedData.type === "REQUEST"
                ? "Blood Requisition Submitted"
                : "Donation Pledge Received"}
            </h4>
            <p className="small text-secondary mb-3">
              {submittedData.type === "REQUEST"
                ? "MedReach recorded your request. Contact the blood bank directly to confirm inventory and fulfillment."
                : "MedReach recorded your pledge. Contact the blood bank directly to confirm eligibility and an appointment."}
            </p>

            <div className="surface p-3 mb-3 text-start small">
              <div className="flex justify-between mb-1">
                <span className="text-secondary">Tracking Reference:</span>
                <span className="fw-bold text-danger font-monospace">
                  {submittedData.reference}
                </span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-secondary">Blood Bank:</span>
                <span className="fw-semibold">{submittedData.bloodBankName}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-secondary">
                  {submittedData.type === "REQUEST" ? "Patient Name:" : "Donor Name:"}
                </span>
                <span className="fw-semibold">{submittedData.details.patientOrDonorName}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-secondary">Blood Group:</span>
                <span className="fw-bold text-danger">
                  {submittedData.details.bloodGroup} {submittedData.details.units ? `(${submittedData.details.units} Units)` : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Phone:</span>
                <span>{submittedData.details.contactPhone}</span>
              </div>
            </div>

            <div className="flex justify-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => window.print()}
              >
                Print Receipt
              </button>
              <a className="btn btn-sm btn-outline-danger" href={`/track?type=blood&reference=${encodeURIComponent(submittedData.reference)}${submittedData.trackingToken ? `#token=${encodeURIComponent(submittedData.trackingToken)}` : ""}`}>Track request</a>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Mode Tabs */}
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                className={`btn btn-sm flex-fill ${activeTab === "request" ? "btn-danger fw-bold" : "btn-outline-secondary"}`}
                onClick={() => {
                  setActiveTab("request");
                  setError(null);
                }}
              >
                <EmergencyIcon name="blood" size={14} className="me-1" />
                Request Blood
              </button>
              <button
                type="button"
                className={`btn btn-sm flex-fill ${activeTab === "donate" ? "btn-danger fw-bold" : "btn-outline-secondary"}`}
                onClick={() => {
                  setActiveTab("donate");
                  setError(null);
                }}
              >
                <EmergencyIcon name="donate" size={14} className="me-1" />
                Pledge Donation
              </button>
            </div>

            {error && <div className="alert alert-danger small mb-3">{error}</div>}

            {!isLoggedIn ? (
              <div className="surface p-4 text-center my-2">
                <div className="text-danger mb-2">
                  <EmergencyIcon name="blood" size={32} />
                </div>
                <h4 className="h6 fw-bold mb-1">Sign In Required</h4>
                <p className="disclaimer mb-3">
                  {activeTab === "request"
                    ? "Please sign in to submit a clinical requisition."
                    : "Please sign in to schedule your blood donation pledge."}
                </p>
                <div className="flex justify-center gap-2">
                  <Link href="/login?returnTo=%2Fblood-banks" className="btn btn-sm btn-danger">
                    Sign In / Register
                  </Link>
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : activeTab === "request" ? (
              <form onSubmit={handleRequestSubmit}>
                <div className="grid-2 mb-2">
                  <div>
                    <label className="form-label small fw-bold text-uppercase">Patient Full Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Rajesh Sharma"
                      value={requestData.patientName}
                      onChange={(e) => setRequestData({ ...requestData, patientName: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-uppercase">Blood Group *</label>
                    <select
                      className="form-select"
                      value={requestData.bloodGroup}
                      onChange={(e) => setRequestData({ ...requestData, bloodGroup: e.target.value })}
                      required
                    >
                      {BLOOD_GROUPS.map((bg) => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid-2 mb-2">
                  <div>
                    <label className="form-label small fw-bold text-uppercase">Units Needed *</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      className="form-control"
                      value={requestData.units}
                      onChange={(e) => setRequestData({ ...requestData, units: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-uppercase">Urgency *</label>
                    <select
                      className="form-select"
                      value={requestData.timing}
                      onChange={(e) => setRequestData({ ...requestData, timing: e.target.value })}
                      required
                    >
                      <option value="Immediate Emergency">Immediate Emergency</option>
                      <option value="3 days">Within 3 days</option>
                      <option value="1 week">Within 1 week</option>
                      <option value="Planned surgery">Planned surgery</option>
                    </select>
                  </div>
                </div>

                <div className="mb-2">
                  <label className="form-label small fw-bold text-uppercase">Admitted Hospital</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. KEM Hospital Parel"
                    value={requestData.hospitalName}
                    onChange={(e) => setRequestData({ ...requestData, hospitalName: e.target.value })}
                  />
                </div>

                <div className="grid-2 mb-2">
                  <div>
                    <label className="form-label small fw-bold text-uppercase">Contact Phone *</label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="+91 98200 12345"
                      value={requestData.contactPhone}
                      onChange={(e) => setRequestData({ ...requestData, contactPhone: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-uppercase">Contact Email</label>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="receipt@example.com"
                      value={requestData.contactEmail}
                      onChange={(e) => setRequestData({ ...requestData, contactEmail: e.target.value })}
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label small fw-bold text-uppercase">Doctor Notes / Slips</label>
                  <textarea
                    rows={2}
                    className="form-control"
                    placeholder="Whole blood, PRBC, Platelets..."
                    value={requestData.doctorNotes}
                    onChange={(e) => setRequestData({ ...requestData, doctorNotes: e.target.value })}
                  />
                </div>

                <div className="flex justify-between items-center gap-2 pt-2 border-top">
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-sm btn-danger" disabled={isSubmitting}>
                    {isSubmitting ? "Submitting..." : "Submit Requisition"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleDonateSubmit}>
                <div className="grid-2 mb-2">
                  <div>
                    <label className="form-label small fw-bold text-uppercase">Donor Full Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Ananya Deshmukh"
                      value={donateData.donorName}
                      onChange={(e) => setDonateData({ ...donateData, donorName: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-uppercase">Donor Blood Group *</label>
                    <select
                      className="form-select"
                      value={donateData.bloodGroup}
                      onChange={(e) => setDonateData({ ...donateData, bloodGroup: e.target.value })}
                      required
                    >
                      {BLOOD_GROUPS.map((bg) => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid-3 mb-2">
                  <div>
                    <label className="form-label small fw-bold text-uppercase">Age *</label>
                    <input
                      type="number"
                      min="18"
                      max="65"
                      className="form-control"
                      value={donateData.age}
                      onChange={(e) => setDonateData({ ...donateData, age: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-uppercase">Weight (kg) *</label>
                    <input
                      type="number"
                      min="45"
                      max="200"
                      className="form-control"
                      value={donateData.weight}
                      onChange={(e) => setDonateData({ ...donateData, weight: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-uppercase">Preferred Date *</label>
                    <input
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      className="form-control"
                      value={donateData.preferredDate}
                      onChange={(e) => setDonateData({ ...donateData, preferredDate: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid-2 mb-2">
                  <div>
                    <label className="form-label small fw-bold text-uppercase">Phone *</label>
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="+91 98200 12345"
                      value={donateData.contactPhone}
                      onChange={(e) => setDonateData({ ...donateData, contactPhone: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label small fw-bold text-uppercase">Email</label>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="donor@example.com"
                      value={donateData.contactEmail}
                      onChange={(e) => setDonateData({ ...donateData, contactEmail: e.target.value })}
                    />
                  </div>
                </div>

                <div className="surface p-2 mb-3">
                  <label className="flex items-start gap-2 disclaimer" style={{ cursor: "pointer", margin: 0 }}>
                    <input
                      type="checkbox"
                      style={{ marginTop: "2px" }}
                      checked={donateData.healthConfirmed}
                      onChange={(e) => setDonateData({ ...donateData, healthConfirmed: e.target.checked })}
                      required
                    />
                    <span>
                      I declare that I am 18–65, weigh 45+ kg, have had no recent major surgery, and feel healthy to donate blood.
                    </span>
                  </label>
                </div>

                <div className="flex justify-between items-center gap-2 pt-2 border-top">
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-sm btn-danger" disabled={isSubmitting}>
                    {isSubmitting ? "Recording..." : "Confirm Pledge"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
