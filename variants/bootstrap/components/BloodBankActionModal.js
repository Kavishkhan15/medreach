"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@medreach/core";
import { post } from "../lib/productApi";
import { EmergencyIcon } from "./EmergencyIcons";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

export default function BloodBankActionModal({ bloodBank, onClose }) {
  const [activeTab, setActiveTab] = useState("request"); // 'request' | 'donate'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submittedData, setSubmittedData] = useState(null);

  // Request form state
    const { user } = useAuth();
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
      className="modal d-block bg-dark bg-opacity-50"
      tabIndex="-1"
      style={{ zIndex: 1055, position: "fixed", top: 0, left: 0, width: "100%", height: "100%" }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content shadow-lg border-0">
          <div className="modal-header bg-danger text-white">
            <div className="d-flex align-items-center gap-2">
              <EmergencyIcon name="blood" size={24} className="text-white" />
              <div>
                <h5 className="modal-title mb-0">
                  {submittedData
                    ? "Blood Action Confirmed"
                    : `Blood Services: ${bloodBank?.name || "Blood Bank"}`}
                </h5>
                <small className="opacity-75">
                  {bloodBank?.address || bloodBank?.locality || "Mumbai Blood Services Network"}
                </small>
              </div>
            </div>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              aria-label="Close"
            ></button>
          </div>

          <div className="modal-body p-4">
            {submittedData ? (
              <div className="text-center py-3">
                <div className="text-success mb-3">
                  <EmergencyIcon name="approved" size={54} className="text-success" />
                </div>
                <h4 className="fw-bold mb-2">
                  {submittedData.type === "REQUEST"
                    ? "Blood Requisition Submitted!"
                    : "Blood Donation Pledge Received!"}
                </h4>
                <p className="text-secondary mb-3">
                  {submittedData.type === "REQUEST"
                    ? "MedReach recorded your request. Contact the blood bank directly to confirm inventory and fulfillment."
                    : "MedReach recorded your pledge. Contact the blood bank directly to confirm eligibility and an appointment."}
                </p>

                <div className="card bg-light border-0 p-3 mb-4 text-start">
                  <div className="row g-2">
                    <div className="col-sm-6">
                      <span className="text-muted small">Tracking Reference:</span>
                      <p className="fw-bold text-danger mb-1 font-monospace fs-5">
                        {submittedData.reference}
                      </p>
                    </div>
                    <div className="col-sm-6">
                      <span className="text-muted small">Blood Bank:</span>
                      <p className="fw-semibold mb-1">{submittedData.bloodBankName}</p>
                    </div>
                    <div className="col-sm-6">
                      <span className="text-muted small">
                        {submittedData.type === "REQUEST" ? "Patient Name:" : "Donor Name:"}
                      </span>
                      <p className="fw-semibold mb-1">
                        {submittedData.details.patientOrDonorName}
                      </p>
                    </div>
                    <div className="col-sm-6">
                      <span className="text-muted small">Blood Group & Units:</span>
                      <p className="fw-bold text-danger mb-1">
                        {submittedData.details.bloodGroup}{" "}
                        {submittedData.details.units ? `(${submittedData.details.units} unit)` : ""}
                      </p>
                    </div>
                    <div className="col-sm-6">
                      <span className="text-muted small">Contact Phone:</span>
                      <p className="mb-0">{submittedData.details.contactPhone}</p>
                    </div>
                    {submittedData.details.contactEmail && (
                      <div className="col-sm-6">
                        <span className="text-muted small">Confirmation Email:</span>
                        <p className="mb-0">{submittedData.details.contactEmail}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="d-flex justify-content-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => window.print()}
                  >
                    Save / Print Confirmation
                  </button>
                  <button type="button" className="btn btn-danger" onClick={onClose}>
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* Mode Tabs */}
                <ul className="nav nav-pills nav-fill mb-4 p-1 bg-light rounded">
                  <li className="nav-item">
                    <button
                      type="button"
                      className={`nav-link fw-semibold d-flex align-items-center justify-content-center gap-2 ${
                        activeTab === "request" ? "active bg-danger text-white" : "text-dark"
                      }`}
                      onClick={() => {
                        setActiveTab("request");
                        setError(null);
                      }}
                    >
                      <EmergencyIcon name="blood" size={18} />
                      Request Blood Units
                    </button>
                  </li>
                  <li className="nav-item">
                    <button
                      type="button"
                      className={`nav-link fw-semibold d-flex align-items-center justify-content-center gap-2 ${
                        activeTab === "donate" ? "active bg-danger text-white" : "text-dark"
                      }`}
                      onClick={() => {
                        setActiveTab("donate");
                        setError(null);
                      }}
                    >
                      <EmergencyIcon name="donate" size={18} />
                      Donate Blood (Donor Pledge)
                    </button>
                  </li>
                </ul>

                {error && <div className="alert alert-danger py-2">{error}</div>}

                {!isLoggedIn ? (
                  <div className="card text-center p-4 border-0 bg-light my-2 shadow-sm">
                    <div className="mb-3 text-danger">
                      <EmergencyIcon name="blood" size={44} />
                    </div>
                    <h5 className="fw-bold mb-2">Login Required</h5>
                    <p className="text-secondary mb-3">
                      {activeTab === "request"
                        ? "You must be signed in to submit a verified blood requisition to this blood bank."
                        : "You must be signed in to submit a blood donation pledge and schedule an appointment."}
                    </p>
                    <div className="d-flex justify-content-center gap-2">
                      <Link
                        href="/login?returnTo=%2Fblood-banks"
                        className="btn btn-danger fw-semibold px-4"
                      >
                        Sign In / Register
                      </Link>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={onClose}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Form: Request Blood */}
                    {activeTab === "request" && (
                  <form onSubmit={handleRequestSubmit}>
                    <div className="row g-3">
                      <div className="col-md-7">
                        <label className="form-label fw-semibold">Patient Full Name *</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="e.g. Rajesh Sharma"
                          value={requestData.patientName}
                          onChange={(e) =>
                            setRequestData({ ...requestData, patientName: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="col-md-5">
                        <label className="form-label fw-semibold">Blood Group Required *</label>
                        <select
                          className="form-select"
                          value={requestData.bloodGroup}
                          onChange={(e) =>
                            setRequestData({ ...requestData, bloodGroup: e.target.value })
                          }
                          required
                        >
                          {BLOOD_GROUPS.map((bg) => (
                            <option key={bg} value={bg}>
                              {bg}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-md-4">
                        <label className="form-label fw-semibold">Units Needed *</label>
                        <input
                          type="number"
                          className="form-control"
                          min="1"
                          max="20"
                          value={requestData.units}
                          onChange={(e) =>
                            setRequestData({ ...requestData, units: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label fw-semibold">Requirement Timing *</label>
                        <select
                          className="form-select"
                          value={requestData.timing}
                          onChange={(e) =>
                            setRequestData({ ...requestData, timing: e.target.value })
                          }
                          required
                        >
                          <option value="3 days">3 days</option>
                          <option value="1 week">1 week</option>
                          <option value="2 weeks">2 weeks</option>
                          <option value="1 month">1 month</option>
                        </select>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label fw-semibold">Hospital Admitted</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="e.g. KEM Hospital Parel"
                          value={requestData.hospitalName}
                          onChange={(e) =>
                            setRequestData({ ...requestData, hospitalName: e.target.value })
                          }
                        />
                      </div>

                      <div className="col-md-6">
                        <label className="form-label fw-semibold">Contact Phone Number *</label>
                        <input
                          type="tel"
                          className="form-control"
                          placeholder="e.g. +91 98200 12345"
                          value={requestData.contactPhone}
                          onChange={(e) =>
                            setRequestData({ ...requestData, contactPhone: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label fw-semibold">Contact Email</label>
                        <input
                          type="email"
                          className="form-control"
                          placeholder="For confirmation tracking receipt"
                          value={requestData.contactEmail}
                          onChange={(e) =>
                            setRequestData({ ...requestData, contactEmail: e.target.value })
                          }
                        />
                      </div>

                      <div className="col-12">
                        <label className="form-label fw-semibold">
                          Doctor Prescription / Cross-matching Slip Notes
                        </label>
                        <textarea
                          className="form-control"
                          rows="2"
                          placeholder="Specific component (e.g. PRBC, FFP, Platelets) or doctor instructions"
                          value={requestData.doctorNotes}
                          onChange={(e) =>
                            setRequestData({ ...requestData, doctorNotes: e.target.value })
                          }
                        ></textarea>
                      </div>
                    </div>

                    <div className="mt-4 pt-2 border-top d-flex justify-content-end gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={onClose}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-danger d-flex align-items-center gap-2"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Submitting Request..." : "Submit Blood Requisition"}
                      </button>
                    </div>
                  </form>
                )}

                {/* Form: Donate Blood */}
                {activeTab === "donate" && (
                  <form onSubmit={handleDonateSubmit}>
                    <div className="row g-3">
                      <div className="col-md-7">
                        <label className="form-label fw-semibold">Donor Full Name *</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="e.g. Ananya Deshmukh"
                          value={donateData.donorName}
                          onChange={(e) =>
                            setDonateData({ ...donateData, donorName: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="col-md-5">
                        <label className="form-label fw-semibold">Donor Blood Group *</label>
                        <select
                          className="form-select"
                          value={donateData.bloodGroup}
                          onChange={(e) =>
                            setDonateData({ ...donateData, bloodGroup: e.target.value })
                          }
                          required
                        >
                          {BLOOD_GROUPS.map((bg) => (
                            <option key={bg} value={bg}>
                              {bg}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-md-4">
                        <label className="form-label fw-semibold">Age (18-65) *</label>
                        <input
                          type="number"
                          className="form-control"
                          min="18"
                          max="65"
                          value={donateData.age}
                          onChange={(e) =>
                            setDonateData({ ...donateData, age: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label fw-semibold">Weight (min 45 kg) *</label>
                        <input
                          type="number"
                          className="form-control"
                          min="45"
                          max="200"
                          value={donateData.weight}
                          onChange={(e) =>
                            setDonateData({ ...donateData, weight: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label fw-semibold">Preferred Date *</label>
                        <input
                          type="date"
                          className="form-control"
                          min={new Date().toISOString().slice(0, 10)}
                          value={donateData.preferredDate}
                          onChange={(e) =>
                            setDonateData({ ...donateData, preferredDate: e.target.value })
                          }
                          required
                        />
                      </div>

                      <div className="col-md-6">
                        <label className="form-label fw-semibold">Contact Phone Number *</label>
                        <input
                          type="tel"
                          className="form-control"
                          placeholder="e.g. +91 98200 54321"
                          value={donateData.contactPhone}
                          onChange={(e) =>
                            setDonateData({ ...donateData, contactPhone: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label fw-semibold">Contact Email</label>
                        <input
                          type="email"
                          className="form-control"
                          placeholder="For appointment verification"
                          value={donateData.contactEmail}
                          onChange={(e) =>
                            setDonateData({ ...donateData, contactEmail: e.target.value })
                          }
                        />
                      </div>

                      <div className="col-12">
                        <label className="form-label fw-semibold">Additional Notes / Preferences</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="e.g. Available between 10 AM to 2 PM, Platelet donation ready"
                          value={donateData.notes}
                          onChange={(e) =>
                            setDonateData({ ...donateData, notes: e.target.value })
                          }
                        />
                      </div>

                      <div className="col-12">
                        <div className="form-check p-3 bg-light rounded border">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="donorDeclaration"
                            checked={donateData.healthConfirmed}
                            onChange={(e) =>
                              setDonateData({ ...donateData, healthConfirmed: e.target.checked })
                            }
                            required
                          />
                          <label className="form-check-label small ms-2" htmlFor="donorDeclaration">
                            <strong>Health Declaration:</strong> I confirm that I am in good health,
                            weigh at least 45 kg, have not consumed alcohol in the last 24 hours, and
                            have had no major dental work or surgery in the last 6 months.
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-2 border-top d-flex justify-content-end gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={onClose}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-danger d-flex align-items-center gap-2"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Submitting Pledge..." : "Pledge Blood Donation"}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
