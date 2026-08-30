"use client";
import Link from "next/link";
import { useHospitals, availabilityMeta, freshnessLabel } from "@medreach/core";
import { toneClass } from "../../../lib/tone";
import AdminGuard from "../../../components/AdminGuard";

function edStatus(h) {
  return (h.facilities || []).find((f) => f.facility === "Emergency Department")?.status ?? "unknown";
}

export default function AdminHospitalsPage() {
  const { data, loading } = useHospitals({}, { sort: "updated" });
  return (
    <AdminGuard title="Hospitals" subtitle="All tracked hospitals with status, type, verification and freshness.">
      <div className="surface">
        {loading ? <p className="text-secondary">Loading…</p> : (
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead><tr><th scope="col">Hospital</th><th scope="col">Type</th><th scope="col">ER</th><th scope="col">Verification</th><th scope="col">Freshness</th><th scope="col"></th></tr></thead>
              <tbody>
                {data.map((h) => {
                  const m = availabilityMeta(edStatus(h));
                  return (
                    <tr key={h._id || h.slug}>
                      <th scope="row" className="fw-semibold">{h.name}</th>
                      <td className="small">{h.hospitalType}</td>
                      <td><span className={`status-pill ${toneClass[m.tone]}`}>{m.symbol} {m.label}</span></td>
                      <td className="small">{h.verificationStatus || "unverified"}</td>
                      <td className="small text-secondary">{freshnessLabel(h.lastUpdated)}</td>
                      <td><Link className="btn btn-sm btn-outline-secondary" href={`/hospitals/${h.slug}`}>View</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
