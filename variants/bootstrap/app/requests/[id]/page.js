"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { productApi, patch } from "../../../lib/productApi";
export default function RequestDetail({ params }) { const [request, setRequest] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const refresh = () => productApi(`/api/emergency-requests/${params.id}`).then((r) => setRequest(r.request)).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, [params.id]);
  const cancel = async () => { if (!window.confirm("Cancel this request?")) return; setBusy(true); try { await patch(`/api/emergency-requests/${params.id}`, { status: "CANCELLED" }); refresh(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <><Link href="/requests" className="small">← All requests</Link>{error && <div className="alert alert-danger mt-3">{error}</div>}{!request && !error && <p role="status">Loading request…</p>}
    {request && <div className="row g-3 mt-2"><div className="col-lg-8"><div className="surface"><span className="eyebrow">Emergency bed request</span><h1 className="h3">{request.requestId}</h1><p>{request.hospital?.name} · {request.requiredFacility}</p><span className="status-pill tone-info">{request.status.replaceAll("_", " ")}</span><p className="disclaimer mt-3">No bed is reserved through MedReach. Follow up with the hospital directly. For immediate danger, call 112.</p>
      <h2 className="h5 mt-4">Timeline</h2><ol className="timeline-list">{request.timeline?.map((step, index) => <li key={index}><strong>{step.status.replaceAll("_", " ")}</strong><div className="small text-secondary">{new Date(step.at).toLocaleString()}</div>{step.note && <p className="small">{step.note}</p>}</li>)}</ol>
      {request.hospitalResponse && <div className="alert alert-info">Hospital response: {request.hospitalResponse}</div>}</div></div><aside className="col-lg-4"><div className="surface"><h2 className="h5">Need immediate help?</h2><a className="btn btn-primary w-100 mb-2" href="tel:112">Call 112</a>{!["REJECTED", "CANCELLED", "EXPIRED", "COMPLETED"].includes(request.status) && <button className="btn btn-outline-secondary w-100" onClick={cancel} disabled={busy}>Cancel request</button>}</div></aside></div>}
  </>;
}
