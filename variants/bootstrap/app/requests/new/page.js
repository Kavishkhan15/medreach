"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@medreach/core";
import { productApi, post } from "../../../lib/productApi";
import { EmergencyIcon } from "../../../components/EmergencyIcons";

const facilities = [
  "Emergency Department",
  "ICU",
  "Trauma Center",
  "Cardiology",
  "Neurology",
  "Pediatrics",
  "Maternity",
  "Burns Unit",
  "Ventilator",
];

export default function NewRequest() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [hospitals, setHospitals] = useState([]);
  const [isEmergency, setIsEmergency] = useState(true);
  const [form, setForm] = useState({
    hospitalId: "",
    emergencyType: "general",
    requiredFacility: "Emergency Department",
    contactPhone: "",
    contactEmail: "",
    patientAgeGroup: "unknown",
    patientReference: "",
    patientSummary: "",
    locality: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const hospitalParam = params.get("hospital") || "";
    const emergencyParam = params.get("emergency");
    const isEmergencyParam = params.get("isEmergency");
    const typeParam = params.get("emergencyType");
    const facilityParam = params.get("facility");

    // If navigated from standard hospital profile with isEmergency=false (or without emergency params), default to standard
    if (isEmergencyParam === "false" || emergencyParam === "false") {
      setIsEmergency(false);
    } else if (isEmergencyParam === "true" || emergencyParam === "true" || typeParam) {
      setIsEmergency(true);
    }

    setForm((old) => ({
      ...old,
      hospitalId: hospitalParam || old.hospitalId,
      emergencyType: typeParam ? typeParam.toLowerCase() : old.emergencyType,
      requiredFacility: facilityParam || old.requiredFacility,
      contactEmail: user?.email || old.contactEmail,
    }));

    productApi("/api/hospitals?limit=50")
      .then((r) => setHospitals(r.data || []))
      .catch((e) => setError(e.message));
  }, [user]);

  // Keep contactEmail populated with user email if available and not yet touched
  useEffect(() => {
    if (user?.email && !form.contactEmail) {
      setForm((old) => ({ ...old, contactEmail: user.email }));
    }
  }, [user]);

  const change = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!isEmergency && !user) {
      setError("Authentication required to submit standard hospital bed requests. Please sign in.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...form,
        isEmergency,
        contactEmail: form.contactEmail.trim() || undefined,
      };
      const r = await post("/api/emergency-requests", payload);
      router.push(`/requests/${r.request._id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const selectedHospital = hospitals.find((h) => h._id === form.hospitalId);

  return (
    <div className="row justify-content-center">
      <div className="col-lg-8">
        {/* Request Type Toggle Banner */}
        <div className="d-flex justify-content-between align-items-center mb-3">
          <Link href={isEmergency ? "/emergency" : "/hospitals"} className="small text-decoration-none">
            ← Back to {isEmergency ? "Emergency response" : "Hospital directory"}
          </Link>
          <div className="btn-group btn-group-sm" role="group" aria-label="Request type">
            <button
              type="button"
              className={`btn ${isEmergency ? "btn-danger fw-bold" : "btn-outline-secondary"}`}
              onClick={() => { setIsEmergency(true); setError(""); }}
            >
              <EmergencyIcon name="siren" size={14} className="me-1" /> Emergency (No Login)
            </button>
            <button
              type="button"
              className={`btn ${!isEmergency ? "btn-primary fw-bold" : "btn-outline-secondary"}`}
              onClick={() => { setIsEmergency(false); setError(""); }}
            >
              <EmergencyIcon name="shield" size={14} className="me-1" /> Standard Hospital Bed (Login)
            </button>
          </div>
        </div>

        {/* Header */}
        <div className="page-head mb-4">
          {isEmergency ? (
            <>
              <div className="d-inline-flex align-items-center gap-2 mb-1 text-danger fw-bold small">
                <EmergencyIcon name="siren" size={18} /> EMERGENCY TRIAGE REQUEST · NO LOGIN REQUIRED
              </div>
              <h1 className="h2 mb-1">Request emergency bed &amp; care</h1>
              <p className="lead fs-6 text-muted mb-0">
                Life-critical triage bed request. Hospital staff are notified immediately. No account or login required.
                For immediate life-threatening danger, always call <a href="tel:112" className="fw-bold text-danger">112</a>.
              </p>
            </>
          ) : (
            <>
              <div className="d-inline-flex align-items-center gap-2 mb-1 text-primary fw-bold small">
                <EmergencyIcon name="shield" size={18} /> ROUTINE HOSPITAL ADMISSION · LOGIN REQUIRED
              </div>
              <h1 className="h2 mb-1">Request hospital admission</h1>
              <p className="lead fs-6 text-muted mb-0">
                Standard inpatient bed coordination. Account verification is required for scheduled care and tracking.
              </p>
            </>
          )}
        </div>

        {/* Auth Barrier for Non-Emergency Requests */}
        {!isEmergency && !user && !authLoading && (
          <div className="alert alert-warning border-warning p-3 mb-4" role="alert">
            <h5 className="alert-heading h6 fw-bold d-flex align-items-center gap-2 mb-2">
              <EmergencyIcon name="shield" size={18} /> Authentication required for standard hospital bed requests
            </h5>
            <p className="small mb-3">
              Standard hospital bed requests require a verified user account so the hospital can safely review patient records
              and confirm admissions.
            </p>
            <div className="d-flex flex-wrap gap-2 align-items-center">
              <Link href="/login" className="btn btn-sm btn-primary">
                Sign in to your account
              </Link>
              <Link href="/register" className="btn btn-sm btn-outline-secondary">
                Register new account
              </Link>
              <span className="small text-muted mx-2">or</span>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => { setIsEmergency(true); setError(""); }}
              >
                Switch to Emergency Bed Request (No login needed)
              </button>
            </div>
          </div>
        )}

        <form className="surface vstack gap-3 shadow-sm p-4 border rounded" onSubmit={submit}>
          {error && (
            <div className="alert alert-danger d-flex align-items-center justify-content-between mb-0" role="alert">
              <span>{error}</span>
              {error.includes("Authentication required") && (
                <Link href="/login" className="btn btn-sm btn-outline-danger ms-2">Sign in</Link>
              )}
            </div>
          )}

          {/* Hospital Selector */}
          <div>
            <label className="form-label fw-semibold" htmlFor="hospital">
              Target Hospital <span className="text-danger">*</span>
            </label>
            <select
              id="hospital"
              className="form-select"
              required
              value={form.hospitalId}
              onChange={change("hospitalId")}
            >
              <option value="">Select a hospital…</option>
              {hospitals.map((h) => (
                <option value={h._id} key={h._id}>
                  {h.name} {h.locality ? `(${h.locality})` : ""}
                </option>
              ))}
            </select>
            {selectedHospital && (
              <div className="form-text small">
                Selected: <strong>{selectedHospital.name}</strong> · {selectedHospital.locality || "Mumbai"}
              </div>
            )}
          </div>

          {/* Emergency Type & Required Facility */}
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label fw-semibold" htmlFor="emergencyType">
                {isEmergency ? "Emergency Category" : "Admission / Care Reason"} <span className="text-danger">*</span>
              </label>
              <select
                id="emergencyType"
                className="form-select"
                value={form.emergencyType}
                onChange={change("emergencyType")}
              >
                {["general", "cardiac", "stroke", "trauma", "respiratory", "pediatric", "maternity", "burns"].map((v) => (
                  <option key={v} value={v}>
                    {v.charAt(0).toUpperCase() + v.slice(1)} {v === "general" ? "emergency" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label fw-semibold" htmlFor="facility">
                Required Facility Unit <span className="text-danger">*</span>
              </label>
              <select
                id="facility"
                className="form-select"
                value={form.requiredFacility}
                onChange={change("requiredFacility")}
              >
                {facilities.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Contact Phone & Contact Mail (Email) */}
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label fw-semibold d-flex align-items-center gap-1" htmlFor="phone">
                <EmergencyIcon name="phone" size={15} /> Contact Phone <span className="text-danger">*</span>
              </label>
              <input
                id="phone"
                type="tel"
                className="form-control"
                required
                placeholder="+91 98765 43210"
                minLength={7}
                maxLength={25}
                value={form.contactPhone}
                onChange={change("contactPhone")}
              />
              <div className="form-text small">Phone for immediate on-call confirmation.</div>
            </div>
            <div className="col-md-6">
              <label className="form-label fw-semibold d-flex align-items-center gap-1" htmlFor="email">
                <EmergencyIcon name="mail" size={15} /> Contact Mail / Email {isEmergency ? "(Recommended for updates)" : <span className="text-danger">*</span>}
              </label>
              <input
                id="email"
                type="email"
                className="form-control"
                required={!isEmergency}
                placeholder="name@example.com"
                maxLength={120}
                value={form.contactEmail}
                onChange={change("contactEmail")}
              />
              <div className="form-text small">
                Confirmation &amp; status updates are sent to this address.
              </div>
            </div>
          </div>

          {/* Locality & Age Group */}
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label fw-semibold d-flex align-items-center gap-1" htmlFor="locality">
                <EmergencyIcon name="pin" size={15} /> Current Locality
              </label>
              <input
                id="locality"
                className="form-control"
                placeholder="e.g. Bandra, Andheri, Colaba"
                maxLength={120}
                value={form.locality}
                onChange={change("locality")}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label fw-semibold" htmlFor="age">
                Patient Age Group
              </label>
              <select
                id="age"
                className="form-select"
                value={form.patientAgeGroup}
                onChange={change("patientAgeGroup")}
              >
                {[
                  { id: "unknown", label: "Unknown / Not specified" },
                  { id: "infant", label: "Infant (<1 year)" },
                  { id: "child", label: "Child (1-12 years)" },
                  { id: "adult", label: "Adult (13-64 years)" },
                  { id: "older_adult", label: "Senior (65+ years)" },
                ].map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Brief Note */}
          <div>
            <label className="form-label fw-semibold" htmlFor="summary">
              Brief Patient Summary / Clinical Notes (Optional)
            </label>
            <textarea
              id="summary"
              rows={2}
              className="form-control"
              maxLength={500}
              placeholder="e.g. Sudden severe chest discomfort, patient conscious, transit underway"
              value={form.patientSummary}
              onChange={change("patientSummary")}
            />
            <p className="disclaimer mb-0 mt-1">
              Share only minimum necessary triage details. Clinical history will be verified directly by hospital medical staff.
            </p>
          </div>

          {/* Submit Action */}
          <div className="pt-2 border-top">
            {!isEmergency && !user ? (
              <button type="button" className="btn btn-secondary btn-lg w-100" disabled>
                Sign in required to submit hospital admission request
              </button>
            ) : (
              <button
                type="submit"
                className={`btn ${isEmergency ? "btn-danger" : "btn-primary"} btn-lg w-100 fw-bold d-inline-flex align-items-center justify-content-center gap-2`}
                disabled={busy || !form.hospitalId || !form.contactPhone}
              >
                <EmergencyIcon name={isEmergency ? "siren" : "shield"} size={20} />
                {busy
                  ? "Submitting request…"
                  : isEmergency
                  ? "Submit Emergency Bed Request (No Login Required)"
                  : "Submit Hospital Bed Request"}
              </button>
            )}

            {isEmergency && (
              <p className="text-center text-muted small mt-2 mb-0">
                <EmergencyIcon name="check" size={15} className="text-success me-1" /> Public emergency triage · No account required · Immediate dispatch to hospital emergency desk
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
