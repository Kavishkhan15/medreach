"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { productApi, post } from "../../lib/productApi";
import { EmergencyIcon } from "../../components/EmergencyIcons";

const URGENCY_OPTIONS = [
  "within 6 hours",
  "12 hours",
  "18 hours",
  "24 hours",
  "up to 2 days",
];

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

export default function UrgentBloodPage() {
  const [bloodBanks, setBloodBanks] = useState([]);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submittedData, setSubmittedData] = useState(null);

  const [formData, setFormData] = useState({
    patientName: "",
    bloodGroup: "O+",
    units: 2,
    urgency: "within 6 hours",
    hospitalName: "",
    treatingDoctor: "",
    contactPhone: "",
    contactEmail: "",
    selectedBloodBankId: "",
    doctorNotes: "",
  });

  useEffect(() => {
    productApi("/api/blood-banks")
      .then((res) => {
        setBloodBanks(res.data || []);
      })
      .catch((err) => {
        console.warn("Failed to load blood banks:", err);
      })
      .finally(() => {
        setLoadingBanks(false);
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const chosenBank = bloodBanks.find((b) => b._id === formData.selectedBloodBankId);
    const bankName = chosenBank ? chosenBank.name : "All Mumbai Blood Banks (Urgent Dispatch)";

    const payload = {
      type: "REQUEST",
      isUrgent: true,
      providerId: chosenBank ? chosenBank._id : undefined,
      bloodBankName: bankName,
      bloodGroup: formData.bloodGroup,
      patientOrDonorName: formData.patientName,
      units: Number(formData.units),
      urgency: formData.urgency,
      hospitalName: formData.hospitalName,
      doctorNotes: `[Doctor: ${formData.treatingDoctor || "N/A"}] ${formData.doctorNotes || ""}`.trim(),
      contactPhone: formData.contactPhone,
      contactEmail: formData.contactEmail,
    };

    try {
      const res = await post("/api/blood-requests", payload);
      setSubmittedData({
        reference: res.reference || res.bloodRequest?.reference || "UBR-" + Date.now().toString(36).toUpperCase(),
        bankName,
        details: payload,
      });
    } catch (err) {
      setError(err.message || "Failed to submit urgent blood requirement");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      {/* Navigation breadcrumbs */}
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item">
            <Link href="/blood-banks">Blood Banks</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Urgent Blood Requirement
          </li>
        </ol>
      </nav>

      {/* Critical Emergency Banner */}
      <div className="bg-red-50 border border-red-200 rounded-xl shadow-sm flex items-center gap-4 mb-6 p-4">
        <div className="p-2 bg-danger bg-opacity-25 rounded-circle text-white d-flex align-items-center justify-content-center">
          <EmergencyIcon name="blood" size={32} />
        </div>
        <div>
          <span className="badge bg-danger text-uppercase fw-bold mb-1">Critical Clinical Response</span>
          <h1 className="h4 alert-heading mb-0 fw-bold">Urgent Blood Requirement</h1>
          <p className="small mb-0 opacity-90">
            Dedicated emergency blood requisition portal. Dispatches high-priority alerts to Mumbai blood banks.
          </p>
        </div>
      </div>

      {submittedData ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
          <div className="text-success mb-3">
            <EmergencyIcon name="approved" size={64} className="text-success" />
          </div>
          <h2 className="h4 fw-bold text-success mb-2">Urgent Blood Request Dispatched!</h2>
          <p className="text-muted mb-4">
            Your emergency requirement has been broadcast to verified Mumbai blood banks. A blood coordinator is prioritizing your dispatch.
          </p>

          <div className="card bg-light border-0 p-3 mb-4 text-start">
            <div className="row g-3">
              <div className="col-sm-6">
                <span className="text-muted small">Tracking Reference:</span>
                <p className="fw-bold text-danger mb-0 font-monospace fs-5">{submittedData.reference}</p>
              </div>
              <div className="col-sm-6">
                <span className="text-muted small">Urgency Window:</span>
                <p className="fw-bold text-dark mb-0">
                  <span className="badge bg-danger">{submittedData.details.urgency}</span>
                </p>
              </div>
              <div className="col-sm-6">
                <span className="text-muted small">Patient Name:</span>
                <p className="fw-semibold mb-0">{submittedData.details.patientOrDonorName}</p>
              </div>
              <div className="col-sm-6">
                <span className="text-muted small">Blood Group & Units:</span>
                <p className="fw-bold text-danger mb-0">
                  {submittedData.details.bloodGroup} — {submittedData.details.units} unit(s)
                </p>
              </div>
              <div className="col-sm-6">
                <span className="text-muted small">Hospital / Medical Center:</span>
                <p className="fw-semibold mb-0">{submittedData.details.hospitalName || "Not specified"}</p>
              </div>
              <div className="col-sm-6">
                <span className="text-muted small">Target Provider:</span>
                <p className="fw-semibold mb-0">{submittedData.bankName}</p>
              </div>
              <div className="col-sm-6">
                <span className="text-muted small">Emergency Contact:</span>
                <p className="mb-0">{submittedData.details.contactPhone}</p>
              </div>
              {submittedData.details.contactEmail && (
                <div className="col-sm-6">
                  <span className="text-muted small">Alert Email:</span>
                  <p className="mb-0">{submittedData.details.contactEmail}</p>
                </div>
              )}
            </div>
          </div>

          <div className="d-flex justify-content-center gap-3">
            <button type="button" className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 text-sm" onClick={() => window.print()}>
              Print Confirmation Receipt
            </button>
            <Link href="/blood-banks" className="bg-red-600 text-white font-semibold px-6 py-2 rounded-md hover:bg-red-700 text-sm">
              Return to Blood Banks
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div >
            {error && (
              <div className="alert alert-danger d-flex align-items-center gap-2 mb-4" role="alert">
                <EmergencyIcon name="alert" size={20} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <h2 className="h5 fw-bold mb-3 border-bottom pb-2">1. Patient & Medical Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div >
                  <label className="block text-sm font-semibold mb-1">Patient Full Name *</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="e.g. Ramesh Patel"
                    value={formData.patientName}
                    onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                    required
                  />
                </div>

                <div >
                  <label className="block text-sm font-semibold mb-1">Blood Group *</label>
                  <select
                    className="w-full border border-red-300 rounded-md px-3 py-2 text-sm font-bold text-red-600 bg-white"
                    value={formData.bloodGroup}
                    onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                    required
                  >
                    {BLOOD_GROUPS.map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>

                <div >
                  <label className="block text-sm font-semibold mb-1">Units Needed *</label>
                  <div className="input-group">
                    <input
                      type="number"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      min="1"
                      max="20"
                      value={formData.units}
                      onChange={(e) => setFormData({ ...formData, units: e.target.value })}
                      required
                    />
                  </div>
                  <div className="btn-group btn-group-sm mt-1 w-100">
                    {[1, 2, 4].map((u) => (
                      <button
                        key={u}
                        type="button"
                        className={`btn btn-outline-secondary ${Number(formData.units) === u ? "active" : ""}`}
                        onClick={() => setFormData({ ...formData, units: u })}
                      >
                        {u}u
                      </button>
                    ))}
                  </div>
                </div>

                <div >
                  <label className="block text-sm font-semibold text-red-600 mb-1">Required Urgency *</label>
                  <select
                    className="w-full border border-red-400 rounded-md px-3 py-2 text-sm bg-white"
                    value={formData.urgency}
                    onChange={(e) => setFormData({ ...formData, urgency: e.target.value })}
                    required
                  >
                    {URGENCY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <div className="form-text small">Select the maximum clinical window for blood readiness.</div>
                </div>

                <div >
                  <label className="block text-sm font-semibold mb-1">Hospital / Clinic Admitted *</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="e.g. Lilavati Hospital, Bandra West"
                    value={formData.hospitalName}
                    onChange={(e) => setFormData({ ...formData, hospitalName: e.target.value })}
                    required
                  />
                </div>

                <div >
                  <label className="block text-sm font-semibold mb-1">Treating Doctor / Surgeon</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="e.g. Dr. Kulkarni (Trauma / ICU)"
                    value={formData.treatingDoctor}
                    onChange={(e) => setFormData({ ...formData, treatingDoctor: e.target.value })}
                  />
                </div>

                <div >
                  <label className="block text-sm font-semibold mb-1">Target Blood Bank</label>
                  <select
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                    value={formData.selectedBloodBankId}
                    onChange={(e) => setFormData({ ...formData, selectedBloodBankId: e.target.value })}
                    disabled={loadingBanks}
                  >
                    <option value="">⚡ Any Available Blood Bank in Mumbai (Fastest Match)</option>
                    {bloodBanks.map((bank) => (
                      <option key={bank._id} value={bank._id}>
                        {bank.name} — {bank.locality || bank.address || "Mumbai"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <h2 className="h5 fw-bold mb-3 border-bottom pb-2">2. Emergency Contact Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div >
                  <label className="block text-sm font-semibold mb-1">Attendant / Contact Phone Number *</label>
                  <input
                    type="tel"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="e.g. +91 98200 11223"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    required
                  />
                  <div className="form-text small">Blood coordinators will contact this number directly.</div>
                </div>

                <div >
                  <label className="block text-sm font-semibold mb-1">Contact Email</label>
                  <input
                    type="email"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    placeholder="For immediate tracking receipt"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                  />
                </div>

                <div className="col-span-full">
                  <label className="block text-sm font-semibold mb-1">Prescription Notes / Component Details</label>
                  <textarea
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    rows="3"
                    placeholder="Specify components required (e.g. Packed Red Blood Cells, Fresh Frozen Plasma, Single Donor Platelets), cross-matching status, or urgent surgical notes..."
                    value={formData.doctorNotes}
                    onChange={(e) => setFormData({ ...formData, doctorNotes: e.target.value })}
                  ></textarea>
                </div>
              </div>

              <div className="d-flex justify-content-between align-items-center pt-3 border-top">
                <Link href="/blood-banks" className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 text-sm">
                  Back to Blood Banks
                </Link>
                <button
                  type="submit"
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2 rounded-md flex items-center gap-2 text-sm"
                  disabled={isSubmitting}
                >
                  <EmergencyIcon name="blood" size={18} />
                  {isSubmitting ? "Broadcasting Request..." : "Submit Urgent Blood Requirement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
