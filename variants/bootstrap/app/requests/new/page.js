"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@medreach/core";
import { productApi, post } from "../../../lib/productApi";
import { EmergencyIcon } from "../../../components/EmergencyIcons";

const FACILITIES = [
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

const EMERGENCY_TYPES = [
  { value: "general", label: "General emergency" },
  { value: "cardiac", label: "Cardiac" },
  { value: "stroke", label: "Stroke" },
  { value: "trauma", label: "Trauma" },
  { value: "respiratory", label: "Respiratory" },
  { value: "pediatric", label: "Pediatric" },
  { value: "maternity", label: "Maternity" },
  { value: "burns", label: "Burns" },
];

const AGE_GROUPS = [
  { id: "unknown", label: "Unknown / Not specified" },
  { id: "infant", label: "Infant (<1 year)" },
  { id: "child", label: "Child (1-12 years)" },
  { id: "adult", label: "Adult (13-64 years)" },
  { id: "older_adult", label: "Senior (65+ years)" },
];

export default function NewRequest() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [hospitals, setHospitals] = useState([]);
  const [isEmergency, setIsEmergency] = useState(false);
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
    ambulanceRequired: false,
    ambulancePickupAddress: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [returnPath, setReturnPath] = useState("/requests/new?flow=standard");

  const normalizeEmergencyType = (val) => {
    if (!val) return "general";
    const clean = val.trim().toLowerCase();
    const match = EMERGENCY_TYPES.find((t) => t.value === clean || t.label.toLowerCase() === clean);
    return match ? match.value : clean;
  };

  // Ingest query parameters on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const hospitalParam = params.get("hospital") || "";
    const flowParam = params.get("flow")?.toLowerCase();
    const typeParam = params.get("emergencyType");
    const facilityParam = params.get("facility");
    setReturnPath(`${window.location.pathname}${window.location.search}`);

    setIsEmergency(flowParam === "emergency");

    setForm((old) => ({
      ...old,
      hospitalId: hospitalParam || old.hospitalId,
      emergencyType: typeParam ? normalizeEmergencyType(typeParam) : old.emergencyType,
      requiredFacility: facilityParam || old.requiredFacility,
    }));
  }, []);

  // Fetch hospital listings once on mount and resolve any slug match to MongoDB _id
  useEffect(() => {
    productApi("/api/hospitals?limit=50")
      .then((r) => {
        const list = r.data || [];
        setHospitals(list);
        setForm((old) => {
          if (!old.hospitalId) return old;
          const match = list.find((h) => h._id === old.hospitalId || h.slug === old.hospitalId);
          return match && match._id !== old.hospitalId ? { ...old, hospitalId: match._id } : old;
        });
      })
      .catch((e) => setError(e.message));
  }, []);

  // Prefill contact details from active user session if fields are untouched
  useEffect(() => {
    if (!user) return;
    setForm((old) => ({
      ...old,
      contactEmail: old.contactEmail || user.email || "",
      contactPhone: old.contactPhone || user.emergencyContact || user.phone || "",
      locality: old.locality || user.region || "",
    }));
  }, [user]);

  const change = (key) => (event) => {
    const value = event.target.value;
    setForm((old) => ({ ...old, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!isEmergency && !user) {
      setError("Please sign in to submit standard hospital bed requests.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...form,
        ambulanceRequired: Boolean(form.ambulanceRequired),
        ambulancePickupAddress: form.ambulanceRequired ? form.ambulancePickupAddress.trim() : undefined,
        contactEmail: form.contactEmail.trim() || undefined,
      };
      const endpoint = isEmergency
        ? "/api/emergency-requests/emergency"
        : "/api/emergency-requests/standard";
      const r = await post(endpoint, payload);
      const tokenFragment = r.trackingToken
        ? `#token=${encodeURIComponent(r.trackingToken)}`
        : "";
      router.push(`/requests/${r.request._id}${tokenFragment}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const selectedHospital = hospitals.find((h) => h._id === form.hospitalId);
  const loginHref = `/login?returnTo=${encodeURIComponent(returnPath)}`;

  return (
    <div className="row justify-content-center">
      <div className="col-lg-8">
        {/* Navigation Breadcrumb - Preserves flow context */}
        <div className="d-flex justify-content-between align-items-center mb-3">
          {isEmergency ? (
            <Link
              href="/emergency"
              className="small text-decoration-none"
            >
              ← Back to {selectedHospital ? `${selectedHospital.name} (Emergency)` : "Emergency response"}
            </Link>
          ) : (
            <Link
              href={selectedHospital ? `/hospitals/${selectedHospital.slug}` : "/hospitals"}
              className="small text-decoration-none"
            >
              ← Back to {selectedHospital ? selectedHospital.name : "Hospital directory"}
            </Link>
          )}
          <span className={`badge ${isEmergency ? "bg-danger text-white" : "bg-primary text-white"} d-inline-flex align-items-center gap-1`}>
            <EmergencyIcon name={isEmergency ? "siren" : "shield"} size={13} />
            {isEmergency ? "Emergency Bed Request" : "Standard Hospital Bed"}
          </span>
        </div>

        {/* Header */}
        <div className="page-head mb-4">
          {isEmergency ? (
            <>
              <div className="d-inline-flex align-items-center gap-2 mb-1 text-danger fw-bold small">
                <EmergencyIcon name="siren" size={18} /> EMERGENCY TRIAGE REQUEST
              </div>
              <h1 className="h2 mb-1">Request emergency bed &amp; care</h1>
              <p className="lead fs-6 text-muted mb-0">
                Records a time-sensitive triage request. Call the hospital directly; no bed is reserved.
                For immediate life-threatening danger, always call <a href="tel:112" className="fw-bold text-danger">112</a>.
              </p>
            </>
          ) : (
            <>
              <div className="d-inline-flex align-items-center gap-2 mb-1 text-primary fw-bold small">
                <EmergencyIcon name="shield" size={18} /> ROUTINE HOSPITAL ADMISSION
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
              <EmergencyIcon name="shield" size={18} /> Sign-in for standard hospital bed requests
            </h5>
            <p className="small mb-3">
              Standard hospital bed requests require a verified user account so the hospital can safely review patient records
              and confirm admissions.
            </p>
            <div className="d-flex flex-wrap gap-2 align-items-center">
              <Link href={loginHref} className="btn btn-sm btn-primary">
                Sign in to your account
              </Link>
              <Link href={`/register?returnTo=${encodeURIComponent(returnPath)}`} className="btn btn-sm btn-outline-secondary">
                Register new account
              </Link>
            </div>
          </div>
        )}

        <form className="surface vstack gap-3 shadow-sm p-4 border rounded" onSubmit={submit}>
          {error && (
            <div className="alert alert-danger d-flex align-items-center justify-content-between mb-0" role="alert">
              <span>{error}</span>
              {(error.includes("Authentication required") || error.includes("sign in")) && (
                <Link href={loginHref} className="btn btn-sm btn-outline-danger ms-2">Sign in</Link>
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
                {EMERGENCY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
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
                {FACILITIES.map((v) => (
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
                MedReach uses this address for confirmation and status emails when delivery is available.
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
                {AGE_GROUPS.map((v) => (
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

          {/* Ambulance Assistance Section */}
          <div className="card border p-3 bg-light-subtle rounded mt-2">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-1">
              <div>
                <h3 className="h6 fw-bold mb-0 d-flex align-items-center gap-2">
                  <EmergencyIcon name="ambulance" size={18} className="text-danger" /> Ambulance Required?
                </h3>
                <div className="form-text small mt-0 text-muted">
                  The hospital is responsible for arranging/providing the ambulance.
                </div>
              </div>
              <div className="btn-group btn-group-sm" role="group" aria-label="Ambulance requirement">
                <button
                  type="button"
                  className={`btn ${form.ambulanceRequired ? "btn-danger fw-bold" : "btn-outline-secondary"}`}
                  onClick={() => setForm((old) => ({ ...old, ambulanceRequired: true }))}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={`btn ${!form.ambulanceRequired ? "btn-secondary fw-bold" : "btn-outline-secondary"}`}
                  onClick={() => setForm((old) => ({ ...old, ambulanceRequired: false, ambulancePickupAddress: "" }))}
                >
                  No
                </button>
              </div>
            </div>

            {form.ambulanceRequired && (
              <div className="mt-3 pt-3 border-top">
                <label className="form-label fw-semibold d-flex align-items-center gap-1" htmlFor="ambulancePickupAddress">
                  <EmergencyIcon name="pin" size={15} /> Ambulance Pickup Address <span className="text-danger">*</span>
                </label>
                <textarea
                  id="ambulancePickupAddress"
                  name="ambulancePickupAddress"
                  rows={2}
                  className="form-control"
                  required={form.ambulanceRequired}
                  placeholder="Enter exact pickup address, landmarks, floor/flat number, etc."
                  maxLength={300}
                  value={form.ambulancePickupAddress}
                  onChange={change("ambulancePickupAddress")}
                />
                <div className="form-text small">
                  Provide the exact location where the hospital ambulance should pick up the patient.
                </div>
              </div>
            )}
          </div>

          {/* Submit Action */}
          <div className="pt-2 border-top">
            {!isEmergency && !user ? (
              <button type="button" className="btn btn-secondary btn-lg w-100" disabled>
                Sign in to submit hospital admission request
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
                  ? "Submit Emergency Bed Request"
                  : "Submit Hospital Bed Request"}
              </button>
            )}

            {isEmergency && (
              <p className="text-center text-muted small mt-2 mb-0">
                <EmergencyIcon name="check" size={15} className="text-success me-1" /> Public emergency request · Private status tracking
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
