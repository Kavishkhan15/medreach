"use client";
import { adminOverview, adminOverviewData, useAdminResource, useAdminAccess } from "@medreach/core";
import AdminGuard from "../../components/AdminGuard";
import AdminDataState from "../../components/AdminDataState";
const loadTotals = (signal) => adminOverview({ signal });
export default function AdminOverviewPage() {
  const { allowed } = useAdminAccess();
  const totals = useAdminResource(loadTotals, adminOverviewData, allowed);
  return <AdminGuard title="Admin dashboard" subtitle="Hospital totals and platform administration.">
    <section className="surface mb-3" aria-label="Hospital totals"><AdminDataState resource={totals} label="hospital totals">
      {(data) => <>{data.hospitals === 0 && <p>No hospitals are stored.</p>}<div className="grid-stats">{[["Hospitals tracked", data.hospitals]].map(([label, value]) => <div key={label}><span className="h2">{value}</span><p>{label}</p></div>)}</div></>}
    </AdminDataState></section>
  </AdminGuard>;
}
