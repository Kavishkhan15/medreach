"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { post, productApi } from "../lib/productApi";
import { DIAGNOSTIC_TESTS, diagnosticDate, diagnosticTestLabel } from "../lib/diagnostics";

export default function DiagnosticRequestForm() {
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const submitting = useRef(false);
  const success = useRef(null);
  const errorMessage = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    const id = new URLSearchParams(window.location.search).get("centre");
    if (!id || !/^[a-f0-9]{24}$/i.test(id)) {
      setError("Choose a diagnostic centre from the directory to start your request.");
      setLoading(false);
      return;
    }
    productApi(`/api/diagnostics/${id}`, { signal: controller.signal }).then(response => {
      setProvider(response.data);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => { if (result) success.current?.focus(); }, [result]);
  useEffect(() => { if (error) errorMessage.current?.focus(); }, [error]);

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new globalThis.FormData(event.currentTarget);
    const tests = data.getAll("tests");
    if (!tests.length) { setError("Select at least one test."); return; }
    submitting.current = true;
    setBusy(true); setError("");
    try {
      const response = await post("/api/diagnostics/requests", {
        providerId: provider._id, tests,
        patientName: data.get("patientName").trim(), contactPhone: data.get("contactPhone").trim(),
        contactEmail: data.get("contactEmail").trim(), preferredDate: data.get("preferredDate"),
        preferredTime: data.get("preferredTime"), notes: data.get("notes").trim(), consent: data.get("consent") === "on",
      });
      try { window.sessionStorage.setItem(`medreach:diagnostic-request-token:${response.reference}`, response.trackingToken); } catch { /* The private link remains available. */ }
      setResult(response);
    } catch (error) { setError(Array.isArray(error.details) ? error.details.map(detail => detail.msg).join(". ") : error.message); }
    finally { submitting.current = false; setBusy(false); }
  }
  const minDate = diagnosticDate(new Date(Date.now() + 86400000));
  const maxDate = diagnosticDate(new Date(Date.now() + 180 * 86400000));
  return <div className="diagnostic-request-page mx-auto">
    <Link href="/diagnostics" className="d-inline-block mb-4">← Diagnostic centres</Link>
    <header className="page-head mb-4"><h1>Request diagnostic tests</h1><p>Choose your tests and preferred visit. The centre will review your request.</p></header>
    {loading && <p role="status">Loading your selected centre…</p>}
    {error && <div className="alert alert-danger" role="alert" tabIndex={-1} ref={errorMessage}>{error}</div>}
    {result ? <section className="surface p-4 p-md-5" aria-labelledby="diagnostic-success">
      <h2 id="diagnostic-success" className="h3" ref={success} tabIndex={-1}>Your test request is recorded</h2>
      <p className="mt-3"><strong>{result.reference}</strong></p><p>{provider.name}</p>
      <ul>{result.request.tests.map(test => <li key={test}>{diagnosticTestLabel(test)}</li>)}</ul>
      <p>Test availability and your appointment must be confirmed by the diagnostic centre.</p>
      {result.request.notificationRouting === "no_eligible_recipients" && <p role="status">This centre has no eligible notification contact yet. Your request is saved for administrator follow-up. Contact the centre directly if you need an update.</p>}
      <Link className="btn btn-primary" href={`/track?type=diagnostic&reference=${result.reference}#token=${encodeURIComponent(result.trackingToken)}`}>Track test request</Link>
      <p className="text-secondary mt-3 mb-0">Keep your private tracking link safe. It gives access to your request details.</p>
    </section> : provider && <form className="surface p-4 p-md-5" onSubmit={submit} onChange={() => { if (error) setError(""); }}>
      <fieldset disabled={busy || provider.approvalStatus !== "approved"}>
        <div className="mb-4"><label htmlFor="diagnostic-centre" className="form-label fw-semibold">Diagnostic centre</label>
          <input id="diagnostic-centre" className="form-control" value={provider.name} readOnly /></div>
        {provider.approvalStatus !== "approved" && <p className="alert alert-warning">This centre must be approved before it can receive online requests.</p>}
        <fieldset className="mb-4"><legend className="h5">Select tests</legend>
          <p className="text-secondary" id="diagnostic-test-help">Select one or more. The centre will confirm which tests it offers.</p>
          <div className="row g-3" aria-describedby="diagnostic-test-help">{DIAGNOSTIC_TESTS.map(([key, label]) => <div className="col-sm-6" key={key}>
            <label className="diagnostic-test-option"><input type="checkbox" name="tests" value={key} className="form-check-input m-0" /><span>{label}</span></label>
          </div>)}</div>
        </fieldset>
        <div className="row g-3 mb-4">
          <div className="col-md-6"><label htmlFor="diagnostic-patient" className="form-label fw-semibold">Patient name</label><input id="diagnostic-patient" name="patientName" className="form-control" autoComplete="name" minLength={2} maxLength={150} placeholder="Enter patient name" required /></div>
          <div className="col-md-6"><label htmlFor="diagnostic-phone" className="form-label fw-semibold">Contact number</label><input id="diagnostic-phone" name="contactPhone" type="tel" className="form-control" autoComplete="tel" minLength={7} maxLength={25} placeholder="Enter contact number" required /></div>
          <div className="col-12"><label htmlFor="diagnostic-email" className="form-label fw-semibold">Email address <span className="fw-normal text-secondary">(optional)</span></label><input id="diagnostic-email" name="contactEmail" type="email" className="form-control" autoComplete="email" maxLength={150} placeholder="For request updates" /></div>
          <div className="col-md-6"><label htmlFor="diagnostic-date" className="form-label fw-semibold">Preferred date</label><input id="diagnostic-date" name="preferredDate" type="date" className="form-control" min={minDate} max={maxDate} required /></div>
          <div className="col-md-6"><label htmlFor="diagnostic-time" className="form-label fw-semibold">Preferred time</label><select id="diagnostic-time" name="preferredTime" className="form-select" defaultValue="" required><option value="" disabled>Select time</option><option value="MORNING">Morning</option><option value="AFTERNOON">Afternoon</option><option value="EVENING">Evening</option></select></div>
          <div className="col-12"><label htmlFor="diagnostic-notes" className="form-label fw-semibold">Additional notes <span className="fw-normal text-secondary">(optional)</span></label><textarea id="diagnostic-notes" name="notes" className="form-control" rows={3} maxLength={1000} placeholder="Anything the centre should know about your request" /></div>
        </div>
        <p className="diagnostic-request-notice">Your appointment is not confirmed until the diagnostic centre accepts your request. The centre will confirm preparation instructions and charges.</p>
        <div className="form-check mb-4"><input className="form-check-input" type="checkbox" id="diagnostic-consent" name="consent" required /><label className="form-check-label" htmlFor="diagnostic-consent">I agree to share these details with the selected centre to coordinate my test request.</label></div>
        <button className="btn btn-primary px-4" type="submit">{busy ? "Sending request…" : "Send Test Request"}</button>
      </fieldset>
    </form>}
  </div>;
}
