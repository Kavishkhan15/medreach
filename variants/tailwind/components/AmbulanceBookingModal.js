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
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between pb-3 border-b border-gray-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-100 text-red-600">
              <EmergencyIcon name="ambulance" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 leading-tight">
                Book Ambulance
              </h3>
              <p className="text-xs text-gray-500 font-medium">{provider?.name}</p>
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

        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-900 leading-relaxed">
          <strong className="font-bold">Life-Threatening Emergency:</strong> For immediate critical ambulance dispatch, call{" "}
          <a href="tel:108" className="font-bold underline text-red-700">108 (EMS)</a> or{" "}
          <a href="tel:112" className="font-bold underline text-red-700">112 (National)</a> immediately.
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-lg bg-red-100 border border-red-300 p-3 text-sm text-red-800">
            {errorMsg}
          </div>
        )}

        {successMsg ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
              <EmergencyIcon name="check" size={28} />
            </div>
            <h4 className="text-base font-bold text-gray-900 mb-2">Booking Request Recorded</h4>
            <p className="text-sm text-gray-600 mb-4">{successMsg}</p>
            {tracking && <div className="mb-3"><a href={`/track?type=ambulance&reference=${encodeURIComponent(tracking.reference)}${tracking.token ? `#token=${encodeURIComponent(tracking.token)}` : ""}`} className="inline-flex items-center rounded-lg border border-red-600 px-4 py-2 text-sm font-semibold text-red-700">Track request</a></div>}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Patient Full Name *
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="e.g. Rahul Sharma"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Patient Age *
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  placeholder="Age in years"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Ambulance Required?
                </label>
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  value={ambulanceRequired ? "yes" : "no"}
                  onChange={(e) => setAmbulanceRequired(e.target.value === "yes")}
                >
                  <option value="no">No (Consult Only)</option>
                  <option value="yes">Yes (Pickup requested)</option>
                </select>
              </div>
            </div>

            {ambulanceRequired && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Pickup Address & Landmark *
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  placeholder="Apartment, Street, Landmark, Locality"
                  value={bookingPickup}
                  onChange={(e) => setBookingPickup(e.target.value)}
                  required={ambulanceRequired}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Contact Phone *
                </label>
                <input
                  type="tel"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  placeholder="+91 98200 12345"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                  Email (Confirmation)
                </label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                  placeholder="patient@example.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">
                Medical Notes / Symptoms
              </label>
              <textarea
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                placeholder="Breathing difficulty, trauma, conscious state, etc."
                value={bookingDetails}
                onChange={(e) => setBookingDetails(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
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
