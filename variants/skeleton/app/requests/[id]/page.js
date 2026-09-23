"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@medreach/core";
import { EmergencyIcon } from "../../../components/EmergencyIcons";

const BASE_API =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
  "http://localhost:4000";

export default function RequestDetail({ params }) {
  const { user } = useAuth();
  const [request, setRequest] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch(`${BASE_API}/api/emergency-requests/${params.id}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load request");
      setRequest(data.request);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    refresh();
  }, [params.id]);

  const cancel = async () => {
    if (!window.confirm("Cancel this bed request?")) return;
    setBusy(true);
    try {
      const res = await fetch(`${BASE_API}/api/emergency-requests/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel");
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        {user ? (
          <Link href="/hospitals" className="small text-decoration-none">
            ← Hospital directory
          </Link>
        ) : (
          <Link href="/emergency" className="small text-decoration-none text-danger fw-bold">
            ← Back to Emergency Response
          </Link>
        )}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {!request && !error && <p role="status">Loading request details…</p>}

      {request && (
        <div className="row g-3">
          <div className="col-lg-8">
            <div className="card p-4">
              <div className="d-flex align-items-center gap-2 mb-2">
                <EmergencyIcon
                  name={request.isEmergency ? "siren" : "shield"}
                  size={20}
                  className={request.isEmergency ? "text-danger" : "text-primary"}
                />
                <span className="small text-uppercase fw-bold text-secondary">
                  {request.isEmergency ? "Emergency Bed Request" : "Hospital Admission Request"}
                </span>
              </div>

              <h1 className="h3 mb-2">{request.requestId}</h1>
              <p className="lead fs-6 text-muted mb-3">
                <strong>{request.hospital?.name}</strong> · {request.requiredFacility} · {request.emergencyType}
              </p>

              <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
                <span className="status-pill tone-info">
                  {request.status.replaceAll("_", " ")}
                </span>
                {request.contactPhone && (
                  <span className="badge bg-light text-dark border d-inline-flex align-items-center gap-1">
                    <EmergencyIcon name="phone" size={13} /> {request.contactPhone}
                  </span>
                )}
                {request.contactEmail && (
                  <span className="badge bg-light text-dark border d-inline-flex align-items-center gap-1">
                    <EmergencyIcon name="mail" size={13} /> {request.contactEmail}
                  </span>
                )}
              </div>

              {request.contactEmail && (
                <div className="alert alert-light border small text-secondary py-2 px-3 mb-3 d-flex align-items-center gap-2">
                  <EmergencyIcon name="mail" size={16} className="text-primary flex-shrink-0" />
                  <span>Updates for this request will be sent to <strong>{request.contactEmail}</strong>.</span>
                </div>
              )}

              <p className="small text-muted mb-4 fst-italic">
                MedReach facilitates direct hospital coordination. Submitting an emergency request does not guarantee a reserved bed. For immediate life-critical emergencies, dial 112.
              </p>

              <h2 className="h5 border-top pt-3 mb-3">Status Timeline</h2>
              <ol className="timeline-list">
                {request.timeline?.map((step, idx) => (
                  <li key={idx} className="mb-2">
                    <strong>{step.status.replaceAll("_", " ")}</strong>
                    <div className="small text-muted">{new Date(step.at).toLocaleString()}</div>
                    {step.note && <p className="small mb-0 text-secondary">{step.note}</p>}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <aside className="col-lg-4">
            <div className="card p-4">
              <h2 className="h5 mb-3">Need Immediate Emergency Help?</h2>
              <a
                className="btn btn-danger w-100 fw-bold d-inline-flex align-items-center justify-content-center gap-2"
                href="tel:112"
              >
                <EmergencyIcon name="phone" size={16} /> Call 112
              </a>
              {!["REJECTED", "CANCELLED", "EXPIRED", "COMPLETED"].includes(request.status) && (
                <button
                  className="btn btn-outline-secondary w-100 mt-2"
                  onClick={cancel}
                  disabled={busy}
                >
                  {busy ? "Cancelling…" : "Cancel request"}
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
