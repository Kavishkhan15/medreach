"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { productApi, patch } from "../lib/productApi";
import { diagnosticTestLabel, diagnosticStatusLabel, diagnosticAppointment } from "../lib/diagnostics";

function DiagnosticReview({ row, reload }) {
  const [accepted, setAccepted] = useState(row.tests);
  const [appointment, setAppointment] = useState("");
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = ["REQUESTED", "UNDER_REVIEW"].includes(row.status);
  async function update(status) {
    if (busy) return;
    if (status === "CONFIRMED" && (!accepted.length || !appointment)) { setError("Select the tests you can provide and an appointment time."); return; }
    setBusy(true); setError("");
    try {
      await patch(`/api/diagnostics/requests/${row._id}/status`, { expectedVersion: row.version, status, providerResponse: response.trim(),
        ...(status === "CONFIRMED" ? { acceptedTests: accepted, appointmentAt: new Date(`${appointment}:00+05:30`).toISOString() } : {}) });
      await reload();
    } catch (error) { setError(error.status === 409 ? "This request changed. Refresh requests before trying again." : error.message); }
    finally { setBusy(false); }
  }
  return <div className="pt-3 mt-3 border-top">
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
    {(open || row.status === "CONFIRMED") && <>
      <label className="form-label" htmlFor={`diagnostic-response-${row._id}`}>Message to patient</label>
      <textarea id={`diagnostic-response-${row._id}`} className="form-control mb-3" value={response} maxLength={500} disabled={busy} onChange={event => setResponse(event.target.value)} placeholder="Confirm charges, preparation instructions or a reason for declining" />
    </>}
    {open && <form onSubmit={event => { event.preventDefault(); update("CONFIRMED"); }}>
      <fieldset disabled={busy}>
        <legend className="h6">Tests you can provide</legend>
        <div className="d-flex flex-wrap gap-3 mb-3">{row.tests.map(test => <label key={test} className="d-flex align-items-center gap-2"><input type="checkbox" className="form-check-input m-0" checked={accepted.includes(test)} onChange={event => setAccepted(previous => event.target.checked ? [...previous, test] : previous.filter(value => value !== test))} />{diagnosticTestLabel(test)}</label>)}</div>
        <label className="form-label" htmlFor={`diagnostic-appointment-${row._id}`}>Appointment date and time (India time)</label>
        <input id={`diagnostic-appointment-${row._id}`} type="datetime-local" className="form-control mb-3" value={appointment} onChange={event => setAppointment(event.target.value)} required />
        <p className="text-secondary">Confirm only tests this centre can provide. Other requested tests will be shown as unavailable.</p>
        <div className="d-flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary">Confirm appointment</button>
          {row.status === "REQUESTED" && <button type="button" className="btn btn-outline-secondary" onClick={() => update("UNDER_REVIEW")}>Mark under review</button>}
          <button type="button" className="btn btn-outline-danger" onClick={() => update("DECLINED")}>Decline request</button>
        </div>
      </fieldset>
    </form>}
    {row.status === "CONFIRMED" && <div className="d-flex flex-wrap gap-2"><button type="button" disabled={busy} className="btn btn-primary" onClick={() => update("COMPLETED")}>Mark completed</button><button type="button" disabled={busy} className="btn btn-outline-danger" onClick={() => update("CANCELLED")}>Cancel appointment</button></div>}
  </div>;
}

export default function DiagnosticRequests({ providerId, manage = false, enabled = true }) {
  const [rows, setRows] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [followup, setFollowup] = useState(false);
  const load = useCallback(async (cursor, signal) => {
    if (!enabled) return;
    setBusy(true); setError("");
    try {
      const query = new URLSearchParams({ limit: "20", ...(providerId ? { providerId } : {}), ...(followup ? { followup: "true" } : {}), ...(cursor ? { before: cursor } : {}) });
      const result = await productApi(`/api/diagnostics/requests?${query}`, { signal });
      if (signal?.aborted) return;
      setRows(previous => cursor ? [...previous, ...result.data] : result.data);
      setNextCursor(result.nextCursor);
    } catch (error) { if (!signal?.aborted) setError(error.message); }
    finally { if (!signal?.aborted) setBusy(false); }
  }, [enabled, providerId, followup]);
  useEffect(() => {
    const controller = new AbortController();
    setRows([]); setNextCursor(null);
    load(null, controller.signal);
    return () => controller.abort();
  }, [load]);
  if (!enabled) return null;
  return <section className="surface mb-4" aria-labelledby="diagnostic-requests-heading">
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3"><h2 id="diagnostic-requests-heading" className="h4 mb-0">Diagnostic test requests</h2><button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => load()}>Refresh requests</button></div>
    {manage && !providerId && <label className="d-flex align-items-center gap-2 mb-3"><input type="checkbox" checked={followup} onChange={event => setFollowup(event.target.checked)} />Show requests needing notification contact follow-up</label>}
    {busy && <p role="status">Loading diagnostic requests…</p>}
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
    {!busy && !error && !rows.length && <p>No diagnostic test requests recorded.</p>}
    <div className="vstack gap-3">{rows.map(row => <article key={`${row._id}:${row.version}`} className="border rounded p-3 p-md-4">
      <div className="d-flex flex-wrap justify-content-between gap-2 mb-2"><h3 className="h5 mb-0">{row.providerName}</h3><span className="status-pill tone-info">{diagnosticStatusLabel(row.status)}</span></div>
      <p className="text-secondary">{row.reference}</p>
      <p>{row.tests.map(diagnosticTestLabel).join(" · ")}</p>
      <p>Preferred visit: {row.preferredDate} · {row.preferredTime.toLowerCase()}</p>
      {row.appointmentAt && <p><strong>Appointment:</strong> {diagnosticAppointment(row.appointmentAt)} IST<br /><strong>Accepted tests:</strong> {row.acceptedTests.map(diagnosticTestLabel).join(" · ")}</p>}
      {row.providerResponse && <p>Centre response: {row.providerResponse}</p>}
      {manage && <><p>{row.requestSnapshot.patientName} · <a href={`tel:${row.requestSnapshot.contactPhone}`}>{row.requestSnapshot.contactPhone}</a></p>{row.requestSnapshot.notes && <p style={{ whiteSpace: "pre-wrap" }}>{row.requestSnapshot.notes}</p>}
        {row.notificationRouting === "no_eligible_recipients" && <p className="alert alert-warning">No eligible notification contact. Assign an active Diagnostic Centre Admin and verify their notification email; contact the patient directly to coordinate this request.</p>}
        <DiagnosticReview row={row} reload={() => load()} /></>}
      {!manage && <Link className="btn btn-outline-primary" href={`/track?type=diagnostic&reference=${row.reference}`}>Track request</Link>}
    </article>)}</div>
    {nextCursor && <button type="button" disabled={busy} className="btn btn-outline-primary mt-3" onClick={() => load(nextCursor)}>Load more requests</button>}
  </section>;
}
