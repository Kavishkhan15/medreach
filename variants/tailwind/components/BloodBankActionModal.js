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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-[var(--shadow-lg)] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-gray-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-100 text-red-600">
              <EmergencyIcon name="blood" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 leading-tight">
                {submittedData
                  ? "Blood Action Confirmed"
                  : `Blood Services: ${bloodBank?.name || "Blood Centre"}`}
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                {bloodBank?.address || bloodBank?.locality || "Mumbai Blood Services Network"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {submittedData ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
              <EmergencyIcon name="check" size={28} />
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">
              {submittedData.type === "REQUEST"
                ? "Blood Requisition Recorded"
                : "Donation Pledge Received!"}
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              {submittedData.type === "REQUEST"
                ? "MedReach recorded your request. Contact the blood bank directly to confirm inventory and fulfillment."
                : "MedReach recorded your pledge. Contact the blood bank directly to confirm eligibility and an appointment."}
            </p>

            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 mb-4 text-left text-xs space-y-2">
              <div className="flex justify-between border-b border-gray-200 pb-2">
                <span className="text-gray-500">Tracking Reference:</span>
                <span className="font-mono font-bold text-red-600 text-sm">
                  {submittedData.reference}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Blood Bank:</span>
                <span className="font-semibold text-gray-800">{submittedData.bloodBankName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">
                  {submittedData.type === "REQUEST" ? "Patient Name:" : "Donor Name:"}
                </span>
                <span className="font-semibold text-gray-800">
                  {submittedData.details.patientOrDonorName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Blood Group:</span>
                <span className="font-bold text-red-600">
                  {submittedData.details.bloodGroup} {submittedData.details.units ? `(${submittedData.details.units} Units)` : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Contact:</span>
                <span className="text-gray-800">{submittedData.details.contactPhone}</span>
              </div>
            </div>

            <div className="flex justify-center gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                onClick={() => window.print()}
              >
                Print Receipt
              </button>
              <a className="px-4 py-2 rounded-lg border border-red-600 text-sm font-semibold text-red-700" href={`/track?type=blood&reference=${encodeURIComponent(submittedData.reference)}${submittedData.trackingToken ? `#token=${encodeURIComponent(submittedData.trackingToken)}` : ""}`}>Track request</a>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Mode Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl mb-4 text-sm font-semibold">
              <button
                type="button"
                className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
                  activeTab === "request"
                    ? "bg-red-600 text-white shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                onClick={() => {
                  setActiveTab("request");
                  setError(null);
                }}
              >
                <EmergencyIcon name="blood" size={16} />
                Request Blood Units
              </button>
              <button
                type="button"
                className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition ${
                  activeTab === "donate"
                    ? "bg-red-600 text-white shadow-xs"
                    : "text-gray-600 hover:text-gray-900"
                }`}
                onClick={() => {
                  setActiveTab("donate");
                  setError(null);
                }}
              >
                <EmergencyIcon name="donate" size={16} />
                Pledge Donation
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-100 border border-red-300 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {!isLoggedIn ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center my-2">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <EmergencyIcon name="blood" size={24} />
                </div>
                <h4 className="text-base font-bold text-gray-900 mb-1">Authentication Required</h4>
                <p className="text-xs text-gray-600 mb-4 max-w-sm mx-auto">
                  {activeTab === "request"
                    ? "Sign in to submit a verified clinical blood requisition and receive live donor tracking."
                    : "Sign in to schedule your voluntary blood donation pledge with this verified blood centre."}
                </p>
                <div className="flex justify-center gap-2">
                  <Link
                    href="/login?returnTo=%2Fblood-banks"
                    className="px-4 py-2 rounded-lg bg-red-600 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    Sign In / Register
                  </Link>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : activeTab === "request" ? (
              <form onSubmit={handleRequestSubmit} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Patient Full Name *
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      placeholder="e.g. Rajesh Sharma"
                      value={requestData.patientName}
                      onChange={(e) => setRequestData({ ...requestData, patientName: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Blood Group Needed *
                    </label>
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Units Required *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      value={requestData.units}
                      onChange={(e) => setRequestData({ ...requestData, units: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Urgency *
                    </label>
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
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

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Admitted Hospital Name
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                    placeholder="e.g. KEM Hospital Parel"
                    value={requestData.hospitalName}
                    onChange={(e) => setRequestData({ ...requestData, hospitalName: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Contact Phone *
                    </label>
                    <input
                      type="tel"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      placeholder="+91 98200 12345"
                      value={requestData.contactPhone}
                      onChange={(e) => setRequestData({ ...requestData, contactPhone: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      placeholder="receipt@example.com"
                      value={requestData.contactEmail}
                      onChange={(e) => setRequestData({ ...requestData, contactEmail: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                    Component / Doctor Slip Notes
                  </label>
                  <textarea
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                    placeholder="Whole blood, PRBC, Platelet Apheresis, cross-matching instructions..."
                    value={requestData.doctorNotes}
                    onChange={(e) => setRequestData({ ...requestData, doctorNotes: e.target.value })}
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    onClick={onClose}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {isSubmitting ? "Submitting Request..." : "Submit Requisition"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleDonateSubmit} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Donor Full Name *
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      placeholder="e.g. Ananya Deshmukh"
                      value={donateData.donorName}
                      onChange={(e) => setDonateData({ ...donateData, donorName: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Donor Blood Group *
                    </label>
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
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

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Age (18-65) *
                    </label>
                    <input
                      type="number"
                      min="18"
                      max="65"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      value={donateData.age}
                      onChange={(e) => setDonateData({ ...donateData, age: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Weight (min 45kg) *
                    </label>
                    <input
                      type="number"
                      min="45"
                      max="200"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      value={donateData.weight}
                      onChange={(e) => setDonateData({ ...donateData, weight: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Preferred Date *
                    </label>
                    <input
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      value={donateData.preferredDate}
                      onChange={(e) => setDonateData({ ...donateData, preferredDate: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Contact Phone *
                    </label>
                    <input
                      type="tel"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      placeholder="+91 98200 12345"
                      value={donateData.contactPhone}
                      onChange={(e) => setDonateData({ ...donateData, contactPhone: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      placeholder="donor@example.com"
                      value={donateData.contactEmail}
                      onChange={(e) => setDonateData({ ...donateData, contactEmail: e.target.value })}
                    />
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                  <label className="flex items-start gap-2 cursor-pointer text-xs text-gray-700">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                      checked={donateData.healthConfirmed}
                      onChange={(e) => setDonateData({ ...donateData, healthConfirmed: e.target.checked })}
                      required
                    />
                    <span>
                      I declare that I am between 18–65 years old, weigh at least 45 kg, have not had major surgery or tattoo in the past 6 months, and feel healthy to donate.
                    </span>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    onClick={onClose}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {isSubmitting ? "Recording Pledge..." : "Confirm Donation Pledge"}
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
