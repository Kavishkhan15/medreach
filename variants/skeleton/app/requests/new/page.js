"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth, listHospitals } from "@medreach/core";
import { EmergencyIcon } from "../../../components/EmergencyIcons";

const BASE_API =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:4000";

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
    const emergencyParam = params.get("emergency")?.toLowerCase();
    const isEmergencyParam = params.get("isEmergency")?.toLowerCase();
    const typeParam = params.get("emergencyType");
    const facilityParam = params.get("facility");

    if (flowParam === "standard" || isEmergencyParam === "false" || emergencyParam === "false" || isEmergencyParam === "0") {
      setIsEmergency(false);
    } else if (flowParam === "emergency" || isEmergencyParam === "true" || emergencyParam === "true" || typeParam) {
      setIsEmergency(true);
    }

    setForm((old) => ({
      ...old,
      hospitalId: hospitalParam || old.hospitalId,
      emergencyType: typeParam ? normalizeEmergencyType(typeParam) : old.emergencyType,
      requiredFacility: facilityParam || old.requiredFacility,
    }));
  }, []);

  // Fetch hospital listings once on mount and resolve any slug match to MongoDB _id
  useEffect(() => {
    listHospitals({ limit: 50 })
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

  const change = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));

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
        isEmergency,
        contactEmail: form.contactEmail.trim() || undefined,
      };
      const res = await fetch(`${BASE_API}/api/emergency-requests`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request submission failed");
      router.push(`/requests/${data.request._id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const selectedHospital = hospitals.find((h) => h._id === form.hospitalId);

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "1rem 0" }}>
      {/* Navigation Breadcrumb - Preserves flow context */}
      <div className="flex justify-between items-center mb-3">
        {isEmergency ? (
          <Link
            href={selectedHospital ? `/hospitals/${selectedHospital.slug}?flow=emergency` : "/emergency"}
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
        <span className={`status-pill ${isEmergency ? "tone-critical" : "tone-info"}`}>
          <EmergencyIcon name={isEmergency ? "siren" : "shield"} size={13} />
          {" "}{isEmergency ? "Emergency Bed Request" : "Standard Hospital Bed"}
        </span>
      </div>

      {/* Header */}
      <div className="surface mb-3">
        {isEmergency ? (
          <>
            <div className="text-danger fw-bold small mb-1 flex items-center gap-1">
              <EmergencyIcon name="siren" size={18} /> EMERGENCY TRIAGE REQUEST
            </div>
            <h1 className="h4 mb-1">Request emergency bed &amp; care</h1>
            <p className="disclaimer mb-0">
              Life-critical triage bed request. Hospital staff are notified immediately.
              For immediate life-threatening danger, always call <a href="tel:112" className="fw-bold text-danger">112</a>.
            </p>
          </>
        ) : (
          <>
            <div className="text-primary fw-bold small mb-1 flex items-center gap-1">
              <EmergencyIcon name="shield" size={18} /> ROUTINE HOSPITAL ADMISSION
            </div>
            <h1 className="h4 mb-1">Request hospital admission</h1>
            <p className="disclaimer mb-0">
              Standard inpatient bed coordination. Account verification is required for scheduled care and tracking.
            </p>
          </>
        )}
      </div>

      {/* Auth Barrier for Non-Emergency Requests */}
      {!isEmergency && !user && !authLoading && (
        <div className="surface mb-3" style={{ borderLeft: "4px solid #f59f00", background: "#fff9db" }} role="alert">
          <h2 className="h6 fw-bold mb-1 flex items-center gap-1">
            <EmergencyIcon name="shield" size={16} /> Sign-in required for standard hospital bed requests
          </h2>
          <p className="small mb-2">
            Standard hospital bed requests require a verified user account so the hospital can safely review patient records
            and confirm admissions.
          </p>
          <div className="flex gap-2 items-center">
            <Link href="/login" className="btn btn-sm btn-primary">
              Sign in to your account
            </Link>
            <Link href="/login" className="btn btn-sm btn-outline-secondary">
              Register new account
            </Link>
          </div>
        </div>
      )}

      {/* Form */}
      <form className="surface stack gap-3" onSubmit={submit}>
        {error && (
          <div className="alert alert-danger" style={{ color: "#c92a2a", background: "#ffe3e3", padding: "0.5rem", borderRadius: "4px" }}>
            {error}
          </div>
        )}

        {/* Hospital Selector */}
        <div>
          <label className="form-label fw-bold small mb-1" htmlFor="hospital">
            Target Hospital <span className="text-danger">*</span>
          </label>
          <select
            id="hospital"
            className="form-select"
            style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #ced4da" }}
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
            <div className="disclaimer mt-1">
              Selected: <strong>{selectedHospital.name}</strong> · {selectedHospital.locality || "Mumbai"}
            </div>
          )}
        </div>

        {/* Emergency Type & Required Facility */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label className="form-label fw-bold small mb-1" htmlFor="emergencyType">
              {isEmergency ? "Emergency Category" : "Admission / Care Reason"} <span className="text-danger">*</span>
            </label>
            <select
              id="emergencyType"
              style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #ced4da" }}
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
          <div>
            <label className="form-label fw-bold small mb-1" htmlFor="facility">
              Required Facility Unit <span className="text-danger">*</span>
            </label>
            <select
              id="facility"
              style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #ced4da" }}
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

        {/* Contact Phone & Email */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label className="form-label fw-bold small mb-1 flex items-center gap-1" htmlFor="phone">
              <EmergencyIcon name="phone" size={14} /> Contact Phone <span className="text-danger">*</span>
            </label>
            <input
              id="phone"
              type="tel"
              style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #ced4da" }}
              required
              placeholder="+91 98765 43210"
              minLength={7}
              maxLength={25}
              value={form.contactPhone}
              onChange={change("contactPhone")}
            />
            <div className="disclaimer mt-1">Phone for immediate on-call confirmation.</div>
          </div>
          <div>
            <label className="form-label fw-bold small mb-1 flex items-center gap-1" htmlFor="email">
              <EmergencyIcon name="mail" size={14} /> Contact Email {isEmergency ? "(Optional)" : <span className="text-danger">*</span>}
            </label>
            <input
              id="email"
              type="email"
              style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #ced4da" }}
              required={!isEmergency}
              placeholder="name@example.com"
              maxLength={120}
              value={form.contactEmail}
              onChange={change("contactEmail")}
            />
            <div className="disclaimer mt-1">
              Confirmation &amp; status updates are sent to this address.
            </div>
          </div>
        </div>

        {/* Locality & Age Group */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div>
            <label className="form-label fw-bold small mb-1 flex items-center gap-1" htmlFor="locality">
              <EmergencyIcon name="pin" size={14} /> Current Locality
            </label>
            <input
              id="locality"
              style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #ced4da" }}
              placeholder="e.g. Bandra, Andheri, Colaba"
              maxLength={120}
              value={form.locality}
              onChange={change("locality")}
            />
          </div>
          <div>
            <label className="form-label fw-bold small mb-1" htmlFor="age">
              Patient Age Group
            </label>
            <select
              id="age"
              style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #ced4da" }}
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
          <label className="form-label fw-bold small mb-1" htmlFor="summary">
            Brief Patient Summary / Clinical Notes (Optional)
          </label>
          <textarea
            id="summary"
            rows={2}
            style={{ width: "100%", padding: "0.5rem", borderRadius: "4px", border: "1px solid #ced4da" }}
            maxLength={500}
            placeholder="e.g. Sudden severe chest discomfort, patient conscious, transit underway"
            value={form.patientSummary}
            onChange={change("patientSummary")}
          />
        </div>

        {/* Submit Action */}
        <div style={{ borderTop: "1px solid #e9ecef", paddingTop: "0.75rem" }}>
          {!isEmergency && !user ? (
            <button type="button" className="btn btn-secondary w-100" style={{ width: "100%", opacity: 0.6, cursor: "not-allowed" }} disabled>
              Sign in to submit hospital admission request
            </button>
          ) : (
            <button
              type="submit"
              className={`btn ${isEmergency ? "btn-primary" : "btn-outline-secondary"}`}
              style={{
                width: "100%",
                padding: "0.75rem",
                fontWeight: "bold",
                backgroundColor: isEmergency ? "var(--color-emergency)" : undefined,
                borderColor: isEmergency ? "var(--color-emergency)" : undefined,
                color: isEmergency ? "#fff" : undefined,
              }}
              disabled={busy || !form.hospitalId || !form.contactPhone}
            >
              <EmergencyIcon name={isEmergency ? "siren" : "shield"} size={18} />
              {" "}
              {busy
                ? "Submitting request…"
                : isEmergency
                ? "Submit Emergency Bed Request"
                : "Submit Hospital Bed Request"}
            </button>
          )}

          {isEmergency && (
            <p className="disclaimer text-center mt-2 mb-0">
              <EmergencyIcon name="check" size={14} className="text-success" />
              {" "}Public emergency triage · Immediate dispatch to hospital emergency desk
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
