"use client";
import { adminOverview, adminOverviewData, adminList, loadAdminHospitals, useAdminResource, useAdminAccess, freshnessLabel } from "@medreach/core";
import AdminGuard from "../../components/AdminGuard";
import AdminDataState from "../../components/AdminDataState";
const loadTotals = (signal) => adminOverview({ signal });
const validateHospitals = adminList("hospital");
export default function AdminOverviewPage() {
  const { allowed } = useAdminAccess();
  const totals = useAdminResource(loadTotals, adminOverviewData, allowed);
  const hospitals = useAdminResource(loadAdminHospitals, validateHospitals, allowed);
  return <AdminGuard title="Admin dashboard" subtitle="Hospital totals, data freshness and verification.">
    <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] p-5 mb-3" aria-label="Hospital totals"><AdminDataState resource={totals} label="hospital totals">
      {(data) => <>{data.hospitals === 0 && <p>No hospitals are stored.</p>}<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[["Hospitals tracked", data.hospitals], ["Verified hospitals", data.verified], ["Verification queue", data.verificationQueue]].map(([label, value]) => <div key={label}><span className="text-3xl font-bold">{value}</span><p>{label}</p></div>)}</div></>}
    </AdminDataState></section>
    <section className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius)] p-5 mb-3" aria-label="Data freshness"><h2>Data freshness</h2><AdminDataState resource={hospitals} label="data freshness" emptyMessage="No hospitals to assess.">
      {(data) => <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[["Recently updated", data.filter((h) => ["RECENT", "UPDATED_RECENTLY"].includes(freshnessLabel(h.lastUpdated))).length], ["Stale / unknown", data.filter((h) => ["STALE", "OUTDATED", "UNKNOWN"].includes(freshnessLabel(h.lastUpdated))).length]].map(([label, value]) => <div key={label}><span className="text-3xl font-bold">{value}</span><p>{label}</p></div>)}</div>}
    </AdminDataState></section>
  </AdminGuard>;
}
