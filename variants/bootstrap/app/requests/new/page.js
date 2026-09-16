"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { productApi, post } from "../../../lib/productApi";

const facilities = ["ICU", "Emergency Department", "Trauma Center", "Cardiology", "Neurology", "Pediatrics", "Maternity", "Burns Unit", "Ventilator"];
export default function NewRequest() {
  const router = useRouter();
  const [hospitals, setHospitals] = useState([]);
  const [form, setForm] = useState({ hospitalId: "", emergencyType: "general", requiredFacility: "Emergency Department", contactPhone: "", patientAgeGroup: "unknown", locality: "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { setForm((old) => ({ ...old, hospitalId: new URLSearchParams(window.location.search).get("hospital") || "" }));
    productApi("/api/hospitals?limit=50").then((r) => setHospitals(r.data || [])).catch((e) => setError(e.message)); }, []);
  const change = (key) => (event) => setForm((old) => ({ ...old, [key]: event.target.value }));
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError("");
    try { const r = await post("/api/emergency-requests", form); router.push(`/requests/${r.request._id}`); }
    catch (e) { setError(e.message); setBusy(false); } };
  return <div className="row justify-content-center"><div className="col-lg-8"><div className="page-head mb-4"><span className="eyebrow">Emergency coordination</span><h1>Request hospital review</h1><p>This creates a bed request and notifies hospital staff only when they are connected to MedReach. It is not a reservation. For immediate danger, call <a href="tel:112">112</a>.</p></div>
    <form className="surface vstack gap-3" onSubmit={submit}>
      {error && <div className="alert alert-danger" role="alert">{error}{error === "Authentication required" && <> · <Link href="/login">Sign in</Link></>}</div>}
      <div><label className="form-label fw-semibold" htmlFor="hospital">Hospital</label><select id="hospital" className="form-select" required value={form.hospitalId} onChange={change("hospitalId")}><option value="">Select a hospital</option>{hospitals.map((h) => <option value={h._id} key={h._id}>{h.name}</option>)}</select></div>
      <div className="row g-3"><div className="col-md-6"><label className="form-label fw-semibold" htmlFor="emergencyType">Emergency type</label><select id="emergencyType" className="form-select" value={form.emergencyType} onChange={change("emergencyType")}>{["general", "cardiac", "stroke", "trauma", "respiratory", "pediatric", "maternity", "burns"].map((v) => <option key={v}>{v}</option>)}</select></div><div className="col-md-6"><label className="form-label fw-semibold" htmlFor="facility">Required facility</label><select id="facility" className="form-select" value={form.requiredFacility} onChange={change("requiredFacility")}>{facilities.map((v) => <option key={v}>{v}</option>)}</select></div></div>
      <div className="row g-3"><div className="col-md-6"><label className="form-label fw-semibold" htmlFor="phone">Contact phone</label><input id="phone" type="tel" className="form-control" required minLength={7} maxLength={25} value={form.contactPhone} onChange={change("contactPhone")} /></div><div className="col-md-6"><label className="form-label fw-semibold" htmlFor="locality">Locality</label><input id="locality" className="form-control" maxLength={120} value={form.locality} onChange={change("locality")} /></div></div>
      <div><label className="form-label fw-semibold" htmlFor="age">Patient age group</label><select id="age" className="form-select" value={form.patientAgeGroup} onChange={change("patientAgeGroup")}>{["unknown", "infant", "child", "adult", "older_adult"].map((v) => <option key={v} value={v}>{v.replace("_", " ")}</option>)}</select></div>
      <p className="disclaimer mb-0">Share only the minimum needed. Medical details are optional and can be discussed with the hospital by phone.</p>
      <button className="btn btn-primary btn-lg" disabled={busy || !form.hospitalId}>{busy ? "Submitting…" : "Submit emergency bed request"}</button>
    </form></div></div>;
}
