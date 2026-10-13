"use client";
import Link from "next/link";
import { useAdminResource, adminList } from "@medreach/core";
import AdminDataState from "./AdminDataState";
import { productApi } from "../lib/productApi";

const loadBlood = (signal) => productApi("/api/blood-requests", { signal });
const loadAmbulance = (signal) => productApi("/api/ambulances/bookings", { signal });
const parseBlood = adminList("bloodRequest"), parseAmbulance = adminList("booking");

export default function ServiceRequestHistory({ enabled = true }) {
  const blood = useAdminResource(loadBlood, parseBlood, enabled);
  const ambulance = useAdminResource(loadAmbulance, parseAmbulance, enabled);

  if (!enabled) return null;

  return (
    <>
      <section className="surface mb-4">
        <h2>Blood requests and donation pledges</h2>
        <AdminDataState resource={blood} label="blood request history" emptyMessage="No blood requests or donation pledges recorded.">
          {(rows) => rows.map((r) => (
            <article key={r._id} className="border rounded p-3 mb-2">
              <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                  <h3 className="h6 mb-1">{r.reference}</h3>
                  <p className="mb-1">
                    <strong>Type:</strong> {r.type === "DONATION" ? "Blood donation pledge" : "Blood request"} ·{" "}
                    <strong>Urgency:</strong> <span className={`badge ${r.isUrgent ? "bg-danger" : "bg-info text-dark"}`}>{r.isUrgent ? "Urgent" : "Normal"}</span> ·{" "}
                    <strong>Status:</strong> {r.status}
                  </p>
                  <p className="small text-muted mb-0">{r.bloodBankName} · Group: {r.bloodGroup}</p>
                </div>
                <Link className="btn btn-sm btn-outline-primary" href={`/track?type=blood&reference=${encodeURIComponent(r.reference)}`} aria-label={`Track blood request ${r.reference}`}>
                  Track request
                </Link>
              </div>
            </article>
          ))}
        </AdminDataState>
      </section>
      <section className="surface mb-4">
        <h2>Ambulance requests</h2>
        <AdminDataState resource={ambulance} label="ambulance request history" emptyMessage="No ambulance requests recorded.">
          {(rows) => rows.map((r) => (
            <article key={r._id} className="border rounded p-3 mb-2">
              <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                  <h3 className="h6 mb-1">{r.reference}</h3>
                  <p className="mb-1">
                    <strong>Type:</strong> Ambulance booking ·{" "}
                    <strong>Urgency:</strong> <span className={`badge ${r.isEmergency ? "bg-danger" : "bg-secondary"}`}>{r.isEmergency ? "Emergency" : "Normal"}</span> ·{" "}
                    <strong>Status:</strong> {r.status}
                  </p>
                  <p className="small text-muted mb-0">{r.providerSnapshot?.name || "Ambulance provider"}</p>
                </div>
                <Link className="btn btn-sm btn-outline-primary" href={`/track?type=ambulance&reference=${encodeURIComponent(r.reference)}`} aria-label={`Track ambulance request ${r.reference}`}>
                  Track request
                </Link>
              </div>
            </article>
          ))}
        </AdminDataState>
      </section>
    </>
  );
}
