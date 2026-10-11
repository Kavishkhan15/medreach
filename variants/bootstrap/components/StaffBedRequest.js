"use client";
import Link from "next/link";
import { useState } from "react";
import { bedRequestLabel, BED_REQUEST_STAFF_ACTIONS, adminEntity } from "@medreach/core";
import AdminActionFeedback from "./AdminActionFeedback";
import { patch } from "../lib/productApi";

export default function StaffBedRequest({ request, refresh, action }) {
  const [response, setResponse] = useState("");
  const [error, setError] = useState("");
  const busy = action.busy;
  const disabled = action.disabled;
  const actions = BED_REQUEST_STAFF_ACTIONS[request.status] || [];
  const expired = !["ACCEPTED", "COMPLETED", "CANCELLED", "REJECTED", "EXPIRED"].includes(request.status) && new Date(request.expiresAt) <= new Date();
  const act = async (status) => {
    setError("");
    if (status === "INFORMATION_REQUESTED" && !response.trim()) { setError("Explain what information the patient should provide."); return; }
    const result = await action.run(() => patch(`/api/emergency-requests/${request._id}`, { status, expectedStatus: request.status, expectedTimelineLength: request.timeline.length, hospitalResponse: response.trim() }), {
      validate: adminEntity("request"), success: "Response recorded. Check email delivery history for delivery status.", refresh, target: request._id,
    });
    if (result) setResponse("");
  };
  return <article className="surface p-4 mb-3" aria-label={request.requestId}>
    <h3 className="h5 mt-4 mb-3">{request.requestId} · {request.hospital?.name}</h3>
    <p><strong>{request.isEmergency ? "Emergency bed request" : "Standard bed request"}</strong> · {bedRequestLabel(request.status)}</p>
    <p>{request.emergencyType} · {request.requiredFacility} · <a href={`tel:${request.contactPhone}`}>Call patient</a></p>
    <p className="small text-secondary">Submitted {new Date(request.createdAt).toLocaleString()} · Response deadline {new Date(request.expiresAt).toLocaleString()}</p>
    {request.patientSummary && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{request.patientSummary}</p>}
    {request.hospitalResponse && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>Last hospital response: {request.hospitalResponse}</p>}
    {request.timeline?.at(-1)?.actorRole === "patient" && request.timeline.at(-1).note && <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>Patient: {request.timeline.at(-1).note}</p>}
    <Link style={{ minHeight: 44 }} className="btn btn-outline-secondary py-2" href={`/requests/${request._id}`}>Open request and timeline</Link>
    {actions.length > 0 && !expired && <>
      <label htmlFor={`response-${request._id}`}>Message to patient</label>
      <textarea style={{ fontSize: 16 }} id={`response-${request._id}`} className="form-control mb-3" rows={3} maxLength={500} value={response} disabled={disabled} onChange={(e) => setResponse(e.target.value)} />
      <div className="d-flex flex-wrap align-items-center gap-3 my-3">{actions.map(([status, label]) => <button style={{ minHeight: 44 }} className="btn btn-outline-secondary py-2" key={status} disabled={disabled} onClick={() => act(status)}>{busy ? "Saving…" : label}</button>)}</div>
    </>}
    {action.target === request._id && <AdminActionFeedback action={action} refresh={refresh} />}
    {expired && <p>The response deadline passed. Refresh to check expiry.</p>}
    {error && <div className="alert alert-danger my-3" role="alert">{error}<div><button style={{ minHeight: 44 }} className="btn btn-outline-secondary py-2" disabled={disabled} onClick={refresh}>Refresh requests</button></div></div>}
  </article>;
}
