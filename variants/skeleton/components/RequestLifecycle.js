"use client";
import Link from "next/link";
import { useState } from "react";
import { bedRequestLabel } from "@medreach/core";

const emailLabels = { disabled: "Email delivery disabled", pending: "Email queued", failed: "Email delivery failed", sent: "Email accepted by mail server" };
export default function RequestLifecycle({ model }) {
  const [note, setNote] = useState("");
  const [privateLink, setPrivateLink] = useState("");
  const { request, emailHistory, permissions, busy, error, change } = model;
  const hospital = request.hospital;
  const phone = request.isEmergency ? hospital?.emergencyPhone || hospital?.phone : hospital?.phone || hospital?.emergencyPhone;
  const coords = hospital?.location?.coordinates;
  const destination = coords?.length === 2 ? `${coords[1]},${coords[0]}` : hospital?.address;
  return <section aria-label="Request lifecycle">
    <h2 className="h5 mt-4 mb-3">{bedRequestLabel(request.status)}</h2>
    {request.status === "REQUESTED" && <p>Your request is recorded. Hospital receipt has not been confirmed. Call the hospital directly.</p>}
    {request.status === "SENT" && <p>Your request is available in the connected hospital staff inbox. Staff have not started review yet.</p>}
    {request.status === "INFORMATION_REQUESTED" && <p>The hospital needs more information. Read its message and reply below.</p>}
    {request.status === "ACCEPTED" && <p>The hospital accepted the request. Contact staff to confirm the next steps. This is not a bed reservation.</p>}
    {request.status === "EXPIRED" && <p>The response deadline passed. Call the hospital directly; this request is closed.</p>}
    <p className="small text-secondary">Submitted {new Date(request.createdAt).toLocaleString()} · Response deadline {new Date(request.expiresAt).toLocaleString()}</p>
    <div className="d-flex flex-wrap align-items-center gap-3 my-3">
      {phone && <a style={{ minHeight: 44 }} className="btn btn-outline-secondary py-2" href={`tel:${phone}`}>Call hospital</a>}
      {destination && <a style={{ minHeight: 44 }} className="btn btn-outline-secondary py-2" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`} target="_blank" rel="noopener noreferrer">Directions</a>}
      {hospital?.slug && <Link style={{ minHeight: 44 }} className="btn btn-outline-secondary py-2" href={`/hospitals/${hospital.slug}`}>Hospital details</Link>}
    </div>
    {permissions.canRespond && <Link href="/hospital">Respond in hospital workspace</Link>}
    {request.hospitalResponse && <div className="card p-4 mb-3"><strong>Hospital response</strong><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{request.hospitalResponse}</p></div>}
    {permissions.canReply && request.status === "INFORMATION_REQUESTED" && <form aria-label="Reply to hospital" onSubmit={async (e) => {
      e.preventDefault(); if (await change("UNDER_REVIEW", note.trim())) setNote("");
    }}>
      <label htmlFor="patient-reply">Requested information</label>
      <textarea style={{ fontSize: 16 }} id="patient-reply" className="form-control mb-3" required maxLength={500} rows={3} value={note} disabled={busy || Boolean(error)} onChange={(e) => setNote(e.target.value)} />
      <button style={{ minHeight: 44 }} className="btn btn-primary py-2" disabled={busy || Boolean(error) || !note.trim()}>{busy ? "Sending…" : "Send information"}</button>
    </form>}
    <h2 className="h5 mt-4 mb-3">Status Timeline</h2>
    <ol className="timeline-list">
      {request.timeline?.map((step, index) => <li key={index} style={{ overflowWrap: "anywhere" }}>
        <strong>{bedRequestLabel(step.status)}</strong>
        <div className="small text-secondary">{new Date(step.at).toLocaleString()}{step.actorRole && ` · ${step.actorRole === "hospital_staff" ? "Hospital staff" : step.actorRole === "patient" ? "Patient" : "MedReach"}`}</div>
        {step.hospitalResponse && <p style={{ whiteSpace: "pre-wrap" }}>Hospital: {step.hospitalResponse}</p>}
        {step.note && <p style={{ whiteSpace: "pre-wrap" }}>{step.actorRole === "patient" ? "Patient: " : ""}{step.note}</p>}
      </li>)}
    </ol>
    <h2 className="h5 mt-4 mb-3">Email delivery history</h2>
    {!emailHistory.available && <p role="status">Email delivery history is unavailable. Refresh status to retry.</p>}
    {emailHistory.available && !emailHistory.items.length && <p>No email delivery has been recorded. Track updates on this page.</p>}
    <ul>
      {emailHistory.items.map((item) => <li key={item.id} className="small text-secondary">{item.title} · {emailLabels[item.status] || item.status} · {new Date(item.sentAt || item.at).toLocaleString()}</li>)}
    </ul>
    {!request.user && <div className="mt-3">
      <button style={{ minHeight: 44 }} className="btn btn-outline-secondary py-2" onClick={() => {
        const token = sessionStorage.getItem(`medreach:emergency-request-token:${request._id}`);
        if (token) setPrivateLink(`${window.location.origin}/requests/${request._id}#token=${encodeURIComponent(token)}`);
      }}>Save private tracking link</button>
      {privateLink && <><label htmlFor="private-bed-link">Keep this link private. It allows viewing and cancelling your request.</label><input style={{ fontSize: 16, minHeight: 44 }} id="private-bed-link" className="form-control mb-3" readOnly value={privateLink} onFocus={(e) => e.target.select()} /></>}
    </div>}
  </section>;
}
