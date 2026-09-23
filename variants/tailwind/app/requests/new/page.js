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

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-emergency)]";

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
    <div className="max-w-3xl mx-auto py-4">
      {/* Navigation Breadcrumb - Preserves flow context */}
      <div className="flex justify-between items-center mb-4">
        {isEmergency ? (
          <Link
            href={selectedHospital ? `/hospitals/${selectedHospital.slug}?flow=emergency` : "/emergency"}
            className="text-sm font-semibold text-[var(--color-emergency-dark)] no-underline hover:underline"
          >
            ← Back to {selectedHospital ? `${selectedHospital.name} (Emergency)` : "Emergency response"}
          </Link>
        ) : (
          <Link
            href={selectedHospital ? `/hospitals/${selectedHospital.slug}` : "/hospitals"}
            className="text-sm font-semibold text-[var(--color-emergency-dark)] no-underline hover:underline"
          >
            ← Back to {selectedHospital ? selectedHospital.name : "Hospital directory"}
          </Link>
        )}
        <span className={`text-xs px-2.5 py-1 rounded-full font-bold inline-flex items-center gap-1 ${isEmergency ? "bg-red-600 text-white" : "bg-blue-600 text-white"}`}>
          <EmergencyIcon name={isEmergency ? "siren" : "shield"} size={13} />
          {isEmergency ? "Emergency Bed Request" : "Standard Hospital Bed"}
        </span>
      </div>

      {/* Header */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5 mb-4">
        {isEmergency ? (
          <>
            <div className="inline-flex items-center gap-2 mb-1 text-red-600 font-bold text-xs uppercase tracking-wide">
              <EmergencyIcon name="siren" size={18} /> Emergency Triage Request
            </div>
            <h1 className="text-2xl font-bold mb-1">Request emergency bed &amp; care</h1>
            <p className="text-sm text-[var(--color-muted)] mb-0">
              Life-critical triage bed request. Hospital staff are notified immediately.
              For immediate life-threatening danger, always call <a href="tel:112" className="font-bold text-red-600">112</a>.
            </p>
          </>
        ) : (
          <>
            <div className="inline-flex items-center gap-2 mb-1 text-blue-600 font-bold text-xs uppercase tracking-wide">
              <EmergencyIcon name="shield" size={18} /> Routine Hospital Admission
            </div>
            <h1 className="text-2xl font-bold mb-1">Request hospital admission</h1>
            <p className="text-sm text-[var(--color-muted)] mb-0">
              Standard inpatient bed coordination. Account verification is required for scheduled care and tracking.
            </p>
          </>
        )}
      </div>

      {/* Auth Barrier for Non-Emergency Requests */}
      {!isEmergency && !user && !authLoading && (
        <div className="bg-amber-50 border border-amber-300 rounded-[var(--radius)] p-4 mb-4" role="alert">
          <h2 className="text-base font-bold text-amber-900 flex items-center gap-2 mb-2">
            <EmergencyIcon name="shield" size={18} /> Sign-in required for standard hospital bed requests
          </h2>
          <p className="text-sm text-amber-800 mb-3">
            Standard hospital bed requests require a verified user account so the hospital can safely review patient records
            and confirm admissions.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <Link href="/login" className="inline-flex items-center font-bold text-sm rounded-[var(--radius)] bg-blue-600 text-white px-3 py-1.5 hover:bg-blue-700 no-underline">
              Sign in to your account
            </Link>
            <Link href="/login" className="inline-flex items-center font-semibold text-sm rounded-[var(--radius)] border border-gray-300 bg-white text-gray-700 px-3 py-1.5 hover:bg-gray-50 no-underline">
              Register new account
            </Link>
          </div>
        </div>
      )}

      {/* Form */}
      <form className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-5 space-y-4" onSubmit={submit}>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-[var(--radius)] text-sm">
            {error}
          </div>
        )}

        {/* Hospital Selector */}
        <div>
          <label className="block text-sm font-semibold mb-1" htmlFor="hospital">
            Target Hospital <span className="text-red-500">*</span>
          </label>
          <select
            id="hospital"
            className={inputClass}
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
            <div className="text-xs text-[var(--color-muted)] mt-1">
              Selected: <strong className="text-gray-800">{selectedHospital.name}</strong> · {selectedHospital.locality || "Mumbai"}
            </div>
          )}
        </div>

        {/* Emergency Type & Facility Unit */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-1" htmlFor="emergencyType">
              {isEmergency ? "Emergency Category" : "Admission / Care Reason"} <span className="text-red-500">*</span>
            </label>
            <select
              id="emergencyType"
              className={inputClass}
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
            <label className="block text-sm font-semibold mb-1" htmlFor="facility">
              Required Facility Unit <span className="text-red-500">*</span>
            </label>
            <select
              id="facility"
              className={inputClass}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-1 flex items-center gap-1" htmlFor="phone">
              <EmergencyIcon name="phone" size={15} /> Contact Phone <span className="text-red-500">*</span>
            </label>
            <input
              id="phone"
              type="tel"
              className={inputClass}
              required
              placeholder="+91 98765 43210"
              minLength={7}
              maxLength={25}
              value={form.contactPhone}
              onChange={change("contactPhone")}
            />
            <div className="text-xs text-[var(--color-muted)] mt-1">Phone for immediate on-call confirmation.</div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1 flex items-center gap-1" htmlFor="email">
              <EmergencyIcon name="mail" size={15} /> Contact Email {isEmergency ? "(Optional)" : <span className="text-red-500">*</span>}
            </label>
            <input
              id="email"
              type="email"
              className={inputClass}
              required={!isEmergency}
              placeholder="name@example.com"
              maxLength={120}
              value={form.contactEmail}
              onChange={change("contactEmail")}
            />
            <div className="text-xs text-[var(--color-muted)] mt-1">
              Confirmation &amp; status updates are sent to this address.
            </div>
          </div>
        </div>

        {/* Locality & Age Group */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-1 flex items-center gap-1" htmlFor="locality">
              <EmergencyIcon name="pin" size={15} /> Current Locality
            </label>
            <input
              id="locality"
              className={inputClass}
              placeholder="e.g. Bandra, Andheri, Colaba"
              maxLength={120}
              value={form.locality}
              onChange={change("locality")}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1" htmlFor="age">
              Patient Age Group
            </label>
            <select
              id="age"
              className={inputClass}
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
          <label className="block text-sm font-semibold mb-1" htmlFor="summary">
            Brief Patient Summary / Clinical Notes (Optional)
          </label>
          <textarea
            id="summary"
            rows={2}
            className={inputClass}
            maxLength={500}
            placeholder="e.g. Sudden severe chest discomfort, patient conscious, transit underway"
            value={form.patientSummary}
            onChange={change("patientSummary")}
          />
        </div>

        {/* Submit Action */}
        <div className="pt-3 border-t border-[var(--color-border)]">
          {!isEmergency && !user ? (
            <button type="button" className="w-full font-bold text-sm rounded-[var(--radius)] bg-gray-300 text-gray-500 py-3 cursor-not-allowed" disabled>
              Sign in to submit hospital admission request
            </button>
          ) : (
            <button
              type="submit"
              className={`w-full font-bold text-base rounded-[var(--radius)] text-white py-3 flex items-center justify-center gap-2 ${
                isEmergency ? "bg-[var(--color-emergency)] hover:bg-[var(--color-emergency-dark)]" : "bg-blue-600 hover:bg-blue-700"
              }`}
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
            <p className="text-center text-xs text-[var(--color-muted)] mt-2 mb-0">
              <EmergencyIcon name="check" size={14} className="inline text-emerald-600 mr-1" />
              Public emergency triage · Immediate dispatch to hospital emergency desk
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
