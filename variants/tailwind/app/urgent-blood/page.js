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
    const bankName = chosenBank ? chosenBank.name : "No specific blood bank selected";

    const payload = {
      type: "REQUEST",
      isUrgent: true,
      bloodGroup: formData.bloodGroup,
      units: Number(formData.units),
      urgency: formData.urgency,
      patientOrDonorName: formData.patientName,
      hospitalName: formData.hospitalName,
      treatingDoctor: formData.treatingDoctor,
      contactPhone: formData.contactPhone,
      contactEmail: formData.contactEmail || undefined,
      providerId: formData.selectedBloodBankId || undefined,
      bloodBankName: bankName,
      notes: formData.doctorNotes,
    };

    try {
      const res = await post("/api/blood-requests/urgent", payload);
      const reference = res.reference || res.bloodRequest?.reference;
      if (res.trackingToken && reference) {
        window.sessionStorage.setItem(`medreach:blood-request-token:${reference}`, res.trackingToken);
      }
      setSubmittedData({
        reference,
        trackingToken: res.trackingToken,
        details: payload,
        bankName,
      });
    } catch (err) {
      setError(err.message || "Failed to submit urgent blood requirement");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Critical Emergency Banner */}
      <div className="bg-[var(--color-emergency-dark)] rounded-xl border border-red-800 flex flex-col sm:flex-row sm:items-center gap-4 mb-8 p-6 text-white">
        <div className="p-3 bg-white rounded-lg text-red-700 flex items-center justify-center shrink-0 w-14 h-14 border border-white">
          <EmergencyIcon name="blood" size={32} />
        </div>
        <div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[#8f111b] text-white border border-[#ca5b61] mb-1.5">
            Critical Clinical Response
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight mb-1 text-white">
            Urgent Blood Requisition
          </h1>
          <p className="text-sm text-red-100 max-w-2xl leading-relaxed">
            Record an urgent requirement, then contact blood banks directly to confirm inventory and fulfillment.
          </p>
        </div>
      </div>

      {submittedData ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="inline-flex p-4 rounded-full bg-emerald-50 text-emerald-600 mb-4 border border-emerald-100 shadow-sm">
            <EmergencyIcon name="approved" size={48} className="text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Urgent Blood Request Recorded</h2>
          <p className="text-sm text-gray-600 max-w-lg mx-auto mb-6">
            MedReach recorded your requirement. No blood bank has confirmed inventory or fulfillment; call the selected bank directly.
          </p>

          <div className="bg-slate-50 rounded-xl border border-gray-200 p-6 mb-6 text-left max-w-2xl mx-auto shadow-2xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-xs font-medium text-gray-500">Tracking Reference:</span>
                <p className="font-mono text-lg font-bold text-red-600">{submittedData.reference}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Urgency Window:</span>
                <p className="font-bold text-gray-900">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                    {submittedData.details.urgency}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Patient Name:</span>
                <p className="font-semibold text-gray-900 text-sm">{submittedData.details.patientOrDonorName}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Blood Group & Units:</span>
                <p className="font-bold text-red-600 text-sm">
                  {submittedData.details.bloodGroup} — {submittedData.details.units} unit(s)
                </p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Hospital / Medical Center:</span>
                <p className="font-semibold text-gray-900 text-sm">{submittedData.details.hospitalName || "Not specified"}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Target Provider:</span>
                <p className="font-semibold text-gray-900 text-sm">{submittedData.bankName}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-gray-500">Emergency Contact:</span>
                <p className="text-sm text-gray-800 font-medium">{submittedData.details.contactPhone}</p>
              </div>
              {submittedData.details.contactEmail && (
                <div>
                  <span className="text-xs font-medium text-gray-500">Alert Email:</span>
                  <p className="text-sm text-gray-800 font-medium">{submittedData.details.contactEmail}</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-colors shadow-2xs"
              onClick={() => window.print()}
            >
              Print Confirmation Receipt
            </button>
            <Link href={`/track?type=blood&reference=${encodeURIComponent(submittedData.reference)}${submittedData.trackingToken ? `#token=${encodeURIComponent(submittedData.trackingToken)}` : ""}`} className="inline-flex items-center rounded-lg border border-red-600 px-4 py-2 text-sm font-semibold text-red-700">Track request</Link>
            <Link
              href="/blood-banks"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors shadow-sm"
            >
              Return to Blood Banks
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
          <div>
            {error && (
              <div className="p-4 mb-6 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-3 text-sm">
                <EmergencyIcon name="alert" size={20} className="shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
              <div>
                <h2 className="text-base font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold">1</span>
                  Patient & Medical Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                      Patient Full Name *
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
                      placeholder="e.g. Ramesh Patel"
                      value={formData.patientName}
                      onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                      Blood Group *
                    </label>
                    <select
                      className="w-full rounded-xl border border-red-300 px-4 py-2.5 text-sm font-bold text-red-600 bg-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
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

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                      Units Needed *
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        className="w-28 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
                        min="1"
                        max="20"
                        value={formData.units}
                        onChange={(e) => setFormData({ ...formData, units: e.target.value })}
                        required
                      />
                      <div className="inline-flex rounded-xl shadow-2xs border border-gray-200 overflow-hidden">
                        {[1, 2, 4].map((u) => (
                          <button
                            key={u}
                            type="button"
                            className={`px-3 py-2 text-xs font-semibold transition-colors ${
                              Number(formData.units) === u
                                ? "bg-red-600 text-white"
                                : "bg-gray-50 hover:bg-gray-100 text-gray-700 border-r border-gray-200 last:border-r-0"
                            }`}
                            onClick={() => setFormData({ ...formData, units: u })}
                          >
                            {u} unit{u > 1 ? "s" : ""}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-red-600 mb-1.5">
                      Required Urgency *
                    </label>
                    <select
                      className="w-full rounded-xl border border-red-300 px-4 py-2.5 text-sm font-medium text-gray-900 bg-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
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
                    <span className="block text-xs text-gray-500 mt-1">Select the maximum clinical window for blood readiness.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                      Hospital / Clinic Admitted *
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
                      placeholder="e.g. Lilavati Hospital, Bandra West"
                      value={formData.hospitalName}
                      onChange={(e) => setFormData({ ...formData, hospitalName: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                      Treating Doctor / Surgeon
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
                      placeholder="e.g. Dr. Kulkarni (Trauma / ICU)"
                      value={formData.treatingDoctor}
                      onChange={(e) => setFormData({ ...formData, treatingDoctor: e.target.value })}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                      Target Blood Bank
                    </label>
                    <select
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 bg-white focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
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
              </div>

              <div>
                <h2 className="text-base font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-700 text-xs font-bold">2</span>
                  Emergency Contact Information
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                      Attendant Phone Number *
                    </label>
                    <input
                      type="tel"
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
                      placeholder="e.g. +91 98200 11223"
                      value={formData.contactPhone}
                      onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                      required
                    />
                    <span className="block text-xs text-gray-500 mt-1">Use a reachable number and call the blood bank directly; follow-up is not guaranteed.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
                      placeholder="For immediate tracking receipt"
                      value={formData.contactEmail}
                      onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    />
                  </div>

                  <div className="col-span-full">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                      Prescription Notes / Component Details
                    </label>
                    <textarea
                      className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
                      rows="3"
                      placeholder="Specify components required (e.g. Packed Red Blood Cells, Fresh Frozen Plasma, Single Donor Platelets), cross-matching status, or urgent surgical notes..."
                      value={formData.doctorNotes}
                      onChange={(e) => setFormData({ ...formData, doctorNotes: e.target.value })}
                    ></textarea>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-6 border-t border-gray-100">
                <Link
                  href="/blood-banks"
                  className="inline-flex items-center px-4 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition-colors"
                >
                  Back to Blood Banks
                </Link>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-none transition-all disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  <EmergencyIcon name="blood" size={18} />
                  {isSubmitting ? "Recording Request..." : "Submit Urgent Blood Requirement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
