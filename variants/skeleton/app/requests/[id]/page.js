"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@medreach/core";
import { EmergencyIcon } from "../../../components/EmergencyIcons";
import { productApi } from "../../../lib/productApi";

export default function RequestDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [request, setRequest] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const trackingHeaders = () => {
    if (typeof window === "undefined") return {};
    const token = window.sessionStorage.getItem(`medreach:emergency-request-token:${id}`);
    return token ? { "X-MedReach-Tracking-Token": token } : {};
  };

  const refresh = async () => {
    try {
      const data = await productApi(`/api/emergency-requests/${id}`, { headers: trackingHeaders() });
      setRequest(data.request);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (fragmentToken) {
      window.sessionStorage.setItem(`medreach:emergency-request-token:${id}`, fragmentToken);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    refresh();
  }, [id]);

  const cancel = async () => {
    if (!window.confirm("Cancel this bed request?")) return;
    setBusy(true);
    try {
      await productApi(`/api/emergency-requests/${id}`, {
        method: "PATCH",
        headers: trackingHeaders(),
        body: { status: "CANCELLED" },
      });
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

              {request.ambulanceRequired ? (
                <div className="alert alert-warning border small py-2 px-3 mb-3 d-flex align-items-center gap-2">
                  <EmergencyIcon name="ambulance" size={18} className="text-danger flex-shrink-0" />
                  <div>
                    <strong className="text-dark">Ambulance Requested from Hospital</strong>
                    {request.ambulancePickupAddress && (
                      <div className="mt-0 text-dark">
                        Pickup Location: <em>{request.ambulancePickupAddress}</em>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="small text-muted mb-3 d-flex align-items-center gap-1">
                  <EmergencyIcon name="ambulance" size={14} className="text-secondary" />
                  <span>Ambulance: Not required</span>
                </div>
              )}

              {request.contactEmail && (
                <div className="alert alert-light border small text-secondary py-2 px-3 mb-3 d-flex align-items-center gap-2">
                  <EmergencyIcon name="mail" size={16} className="text-primary flex-shrink-0" />
                  <span>MedReach uses <strong>{request.contactEmail}</strong> for status emails when delivery is available.</span>
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
