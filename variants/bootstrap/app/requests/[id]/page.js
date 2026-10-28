"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@medreach/core";
import { useBedRequest } from "../../../lib/useBedRequest";
import RequestLifecycle from "../../../components/RequestLifecycle";
import RequestRefresh from "../../../components/RequestRefresh";
import { EmergencyIcon } from "../../../components/EmergencyIcons";

export default function RequestDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const model = useBedRequest(id);
  const { request, error, busy, cancel } = model;

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        {user ? (
          <Link href="/requests" className="small text-decoration-none">
            ← All requests
          </Link>
        ) : (
          <Link href="/emergency" className="small text-decoration-none">
            ← Back to Emergency Response
          </Link>
        )}
      </div>

      <RequestRefresh model={model} />
      {!request && <h1 className="h3">Healthcare request details</h1>}
      {!request && !error && <p role="status">Loading request…</p>}

      {request && (
        <div className="row g-3 mt-2">
          <div className="col-lg-8">
            <div className="surface p-4 shadow-sm border rounded">
              <h1 className="h3 mb-2">{request.requestId}</h1>
              <p className="lead fs-6 text-muted mb-3">
                <strong>{request.hospital?.name}</strong> · {request.requiredFacility} · {request.emergencyType}
              </p>

              <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
                <span className={`status-pill ${request.isEmergency ? "tone-danger" : "tone-info"}`}>
                  <EmergencyIcon name={request.isEmergency ? "siren" : "shield"} size={16} className="me-1" />
                  {request.isEmergency ? "Emergency bed request" : "Hospital admission request"}
                </span>
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
                <div className="text-muted small mb-3 d-flex align-items-center gap-1">
                  <EmergencyIcon name="ambulance" size={14} className="text-secondary" />
                  <span>Ambulance: Not required</span>
                </div>
              )}

              {request.contactEmail && (
                <div className="alert alert-light border small text-secondary py-2 px-3 mb-3 d-flex align-items-center gap-2">
                  <EmergencyIcon name="mail" size={16} className="text-primary flex-shrink-0" />
                  <span>
                    MedReach uses <strong>{request.contactEmail}</strong> for status emails when delivery is available.
                  </span>
                </div>
              )}

              <p className="disclaimer mt-3">
                MedReach facilitates hospital discovery and staff notification. An active request does not guarantee a reserved bed.
                For immediate life-threatening danger, call 112.
              </p>

              <RequestLifecycle model={model} />

            </div>
          </div>

          <aside className="col-lg-4">
            <div className="surface p-4 shadow-sm border rounded">
              <h2 className="h5 mb-3">Need immediate help?</h2>
              <a
                className="btn btn-danger w-100 mb-2 fw-bold d-inline-flex align-items-center justify-content-center gap-2"
                href="tel:112"
              >
                <EmergencyIcon name="phone" size={16} /> Call 112
              </a>
              {!model.permissions.canRespond && !["REJECTED", "CANCELLED", "EXPIRED", "COMPLETED"].includes(request.status) && (
                <button
                  className="btn btn-outline-secondary w-100 mt-2"
                  style={{ minHeight: 44 }}
                  onClick={cancel}
                  disabled={busy || Boolean(error) || model.refreshing}
                >
                  {busy ? "Cancelling…" : "Cancel request"}
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
