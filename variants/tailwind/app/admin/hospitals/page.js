"use client";
import Link from "next/link";
import { useHospitals, availabilityMeta, freshnessLabel } from "@medreach/core";
import { toneClass, statusPill, surface, btnOutlineSecondary } from "../../../lib/tone";
import AdminGuard from "../../../components/AdminGuard";

function edStatus(h) {
  return (h.facilities || []).find((f) => f.facility === "Emergency Department")?.status ?? "unknown";
}

export default function AdminHospitalsPage() {
  const { data, loading } = useHospitals({}, { sort: "updated" });
  return (
    <AdminGuard title="Hospitals" subtitle="All tracked hospitals with status, type, verification and freshness.">
      <div className={surface}>
        {loading ? <p className="text-[var(--color-muted)]">Loading…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full align-middle mb-0 text-left">
              <thead><tr className="border-b border-[var(--color-border)]"><th scope="col" className="py-2 pr-3">Hospital</th><th scope="col" className="py-2 pr-3">Type</th><th scope="col" className="py-2 pr-3">ER</th><th scope="col" className="py-2 pr-3">Verification</th><th scope="col" className="py-2 pr-3">Freshness</th><th scope="col" className="py-2 pr-3"></th></tr></thead>
              <tbody>
                {data.map((h) => {
                  const m = availabilityMeta(edStatus(h));
                  return (
                    <tr key={h._id || h.slug} className="border-b border-[var(--color-border)]">
                      <th scope="row" className="py-2 pr-3 font-semibold">{h.name}</th>
                      <td className="py-2 pr-3 text-sm">{h.hospitalType}</td>
                      <td className="py-2 pr-3"><span className={`${statusPill} ${toneClass[m.tone]}`}>{m.symbol} {m.label}</span></td>
                      <td className="py-2 pr-3 text-sm">{h.verificationStatus || "unverified"}</td>
                      <td className="py-2 pr-3 text-sm text-[var(--color-muted)]">{freshnessLabel(h.lastUpdated)}</td>
                      <td className="py-2 pr-3"><Link className={`${btnOutlineSecondary} text-sm px-3 py-1`} href={`/hospitals/${h.slug}`}>View</Link></td>
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
