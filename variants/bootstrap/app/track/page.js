"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@medreach/core";
import { productApi } from "../../lib/productApi";
import { diagnosticTestLabel, diagnosticStatusLabel, diagnosticAppointment } from "../../lib/diagnostics";
import CapacityNotice from "../../components/CapacityNotice";

const tokenKey = (kind, reference) => kind === "diagnostic" ? `medreach:diagnostic-request-token:${reference}` : kind === "ambulance"
  ? `medreach:ambulance-booking-token:${reference}`
  : `medreach:blood-request-token:${reference}`;

export default function TrackRequestPage() {
  const { user } = useAuth();
  const [type, setType] = useState("blood");
  const [reference, setReference] = useState("");
  const [record, setRecord] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const lookup = useRef(null);
  const initialized = useRef(false);
  const linkCredentials = useRef(new Map());

  async function load(kind, ref) {
    const cleanReference = ref.trim().toUpperCase();
    if (!cleanReference) return;
    const check = ++sequence.current;
    lookup.current = { kind, reference: cleanReference };
    setLoading(true);
    setError("");
    setRecord(null);
    setDelivery(null);
    try {
      const summary = await productApi(`/api/tracking/${kind}/${encodeURIComponent(cleanReference)}`, { credentials: "omit" });
      if (check !== sequence.current) return;
      setRecord(summary.record);
      if (kind === "bed" || kind === "career") return;
      // Existing submission links supply their credentials automatically. The
      // form never asks the user to find, copy or enter a private token.
      let token = linkCredentials.current.get(tokenKey(kind, cleanReference)) || null;
      if (!token) {
        try { token = window.sessionStorage.getItem(tokenKey(kind, cleanReference)); } catch { /* Link credentials still work without browser storage. */ }
      }
      if (token || user) {
        const path = kind === "ambulance"
          ? `/api/ambulances/bookings/${encodeURIComponent(cleanReference)}`
          : kind === "diagnostic" ? `/api/diagnostics/requests/${encodeURIComponent(cleanReference)}`
          : `/api/blood-requests/${encodeURIComponent(cleanReference)}`;
        try {
          const data = await productApi(path, { headers: token ? { "X-MedReach-Tracking-Token": token } : {} });
          if (check !== sequence.current) return;
          setRecord(kind === "ambulance" ? data.booking : kind === "diagnostic" ? { ...data.request, privateDetails: true } : data.bloodRequest);
          setDelivery(data.delivery || null);
        } catch (err) {
          if (check !== sequence.current) return;
          if (![401, 403, 404].includes(err.status)) setError("Status loaded. Additional details are temporarily unavailable.");
        }
      }
    } catch (err) {
      if (check === sequence.current) setError(err.status === 400 ? "Check the request type and reference, then try again." : err.message || "Could not load this request. Check the reference and try again.");
    } finally {
      if (check === sequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const params = new URLSearchParams(window.location.search);
      const requestedType = params.get("type");
      const kind = ["blood", "bed", "career", "ambulance", "diagnostic"].includes(requestedType) ? requestedType : "blood";
      const ref = (params.get("reference") || "").trim().toUpperCase();
      const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (token) {
        if (ref) {
          linkCredentials.current.set(tokenKey(kind, ref), token);
          try { window.sessionStorage.setItem(tokenKey(kind, ref), token); } catch { /* Keep this link's credential in memory when storage is unavailable. */ }
        }
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      setType(kind);
      setReference(ref);
      if (ref) load(kind, ref);
    } else if (lookup.current) {
      load(lookup.current.kind, lookup.current.reference);
    }
    return () => { sequence.current += 1; };
  }, [user?._id || user?.id]);

  const resetResult = () => {
    sequence.current += 1;
    lookup.current = null;
    setRecord(null); setDelivery(null); setError(""); setLoading(false);
  };

  async function cancelDiagnostic() {
    if (loading || !window.confirm("Cancel this diagnostic test request?")) return;
    setLoading(true); setError("");
    try {
      let token = linkCredentials.current.get(tokenKey("diagnostic", record.reference));
      try { token ||= window.sessionStorage.getItem(tokenKey("diagnostic", record.reference)); } catch { /* Use link credentials. */ }
      await productApi(`/api/diagnostics/requests/${record.reference}/cancel`, { method: "PATCH", body: { expectedVersion: record.version }, headers: token ? { "X-MedReach-Tracking-Token": token } : {} });
      await load("diagnostic", record.reference);
    } catch (error) { setError(error.status === 409 ? "This request changed. Check its latest status before cancelling." : error.message); }
    finally { setLoading(false); }
  }

  return (
    <main className="container py-5">
      <div className="page-head mb-4">
        <h1>Track a request</h1>
        <p>Enter your reference to check the current status.</p>
      </div>
      <form className="surface mb-4" onSubmit={(event) => { event.preventDefault(); load(type, reference); }}>
        <div className="mb-3">
          <label htmlFor="tracking-type" className="form-label">Request type</label>
          <select id="tracking-type" className="form-select" value={type} onChange={(event) => { resetResult(); setType(event.target.value); }}>
            <option value="blood">Blood request or donation pledge</option>
            <option value="bed">Bed request</option>
            <option value="career">Career request</option>
            <option value="ambulance">Ambulance booking</option>
            <option value="diagnostic">Diagnostic test request</option>
          </select>
        </div>
        <div className="mb-3">
          <label htmlFor="tracking-reference" className="form-label">Reference</label>
          <input id="tracking-reference" className="form-control" value={reference} onChange={(event) => { resetResult(); setReference(event.target.value); }} required autoComplete="off" />
        </div>
        <button type="submit" className="btn btn-danger" disabled={loading}>{loading ? "Checking…" : "Check status"}</button>
      </form>
      {error && <div role="alert" className="alert alert-danger">{error}</div>}
      {record && <section className="surface" aria-label="Request status">
        <h2 className="h5">{record.reference}</h2>
        <p><strong>Status:</strong> {type === "diagnostic" ? diagnosticStatusLabel(record.status) : record.status}</p>
        {record.updatedAt && <p className="small text-muted">Last updated {new Date(record.updatedAt).toLocaleString()}</p>}
        {type === "blood" ? <>
          {record.bloodBankName && <p><strong>Blood bank:</strong> {record.bloodBankName}</p>}
          {record.bloodGroup && <p><strong>Blood group:</strong> {record.bloodGroup}</p>}
          <p>Contact the blood bank directly to confirm inventory and fulfillment.</p>
          <Link href="/blood-banks">Blood bank directory</Link>
        </> : type === "bed" ? <>
          <p>Contact the hospital directly for further information about your bed request.</p>
          <Link href="/hospitals">Hospital directory</Link>
        </> : type === "career" ? <>
          <p>Check here for updates to your career application.</p>
          <Link href="/careers">Healthcare careers</Link>
        </> : type === "diagnostic" ? <>
          {record.providerName && <p><strong>Centre:</strong> {record.providerName}</p>}
          {record.tests && <p><strong>Requested tests:</strong> {record.tests.map(diagnosticTestLabel).join(" · ")}</p>}
          <p><strong>Priority:</strong> {record.urgency === "URGENT" ? "Urgent / emergency review requested" : "Routine"}</p>
          <CapacityNotice record={record} resource="test appointment" />
          {record.preferredDate && <p><strong>Preferred visit:</strong> {record.preferredDate} · {record.preferredTime.toLowerCase()}</p>}
          {record.appointmentAt && <><p><strong>Appointment:</strong> {diagnosticAppointment(record.appointmentAt)} IST</p><p><strong>Accepted tests:</strong> {record.acceptedTests.map(diagnosticTestLabel).join(" · ")}</p>
            {record.tests.some(test => !record.acceptedTests.includes(test)) && <p><strong>Tests not available in this appointment:</strong> {record.tests.filter(test => !record.acceptedTests.includes(test)).map(diagnosticTestLabel).join(" · ")}</p>}</>}
          {record.providerResponse && <p><strong>Centre response:</strong> {record.providerResponse}</p>}
          {record.notificationRouting === "no_eligible_recipients" && <p>Administrator follow-up is needed because the centre has no eligible notification contact. Contact the centre directly for updates.</p>}
          {["REQUESTED", "UNDER_REVIEW"].includes(record.status) && <p>{record.centreApprovalPending ? "Your request is awaiting MedReach review and centre approval. No appointment is booked." : "Test availability and your appointment must be confirmed by the diagnostic centre."}</p>}
          {!record.privateDetails && <p>Open your private tracking link or sign in to see appointment details.</p>}
          {record.history && <><h3 className="h6 mt-3">Request history</h3><ol>{record.history.map((event, index) => <li key={`${event.at}-${index}`}>{diagnosticStatusLabel(event.status)} · {diagnosticAppointment(event.at)} IST</li>)}</ol></>}
          <div className="d-flex flex-wrap gap-3"><Link href="/diagnostics">Diagnostic centre directory</Link>
          {record.privateDetails && ["REQUESTED", "UNDER_REVIEW", "CONFIRMED"].includes(record.status) && <button type="button" className="btn btn-outline-danger" disabled={loading} onClick={cancelDiagnostic}>Cancel test request</button>}</div>
        </> : <>
          {record.providerSnapshot?.name && <p><strong>Provider:</strong> {record.providerSnapshot.name}</p>}
          {delivery && <p><strong>Provider email:</strong> {delivery.provider?.sent ? "Notification email sent" : "Notification email not confirmed"}</p>}
          <p>Call the provider to confirm dispatch and availability.</p>
          <Link href="/ambulances">Ambulance directory</Link>
        </>}
      </section>}
    </main>
  );
}
