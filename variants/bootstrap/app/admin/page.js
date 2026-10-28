"use client";
import Link from "next/link";
import { adminOverview, adminOverviewData, useAdminResource, useAdminAccess } from "@medreach/core";
import AdminGuard from "../../components/AdminGuard";
import AdminDataState from "../../components/AdminDataState";
import AdminOverviewIcon from "../../components/AdminOverviewIcon";
const loadTotals = (signal) => adminOverview({ signal });
const SHORTCUTS = [
  { href: "/admin/provider-approvals", title: "Provider approvals", description: "Review applications and decisions", icon: "approval", tone: "green" },
  { href: "/admin/provider-accounts", title: "Provider accounts", description: "Assignments and access", icon: "users", tone: "violet" },
  { href: "/admin/emergency", title: "Requests", description: "Emergency and ordinary activity", icon: "siren", tone: "red" },
  { href: "/admin/users", title: "Users", description: "Account and security support", icon: "users", tone: "orange" },
];
export default function AdminOverviewPage() {
  const { allowed } = useAdminAccess();
  const totals = useAdminResource(loadTotals, adminOverviewData, allowed);
  return <AdminGuard className="admin-overview" title="Platform overview" subtitle="Monitor the network and move directly to the work that needs attention.">
    <div className="admin-overview-grid">
      <section className="admin-directory-card" aria-label="Hospital totals"><span className="admin-directory-icon"><AdminOverviewIcon name="hospital" size={32} /></span><h2>Network directory</h2><AdminDataState resource={totals} label="hospital totals">
        {(data) => <><span className="admin-stat-number">{data.hospitals}</span><p className="admin-stat-label">Hospitals tracked</p>{data.hospitals === 0 && <p>No hospitals are stored.</p>}</>}
      </AdminDataState></section>
      <section aria-labelledby="admin-shortcuts-title"><h2 id="admin-shortcuts-title">Your workspace</h2><div className="admin-quick-links">
        {SHORTCUTS.map(item => <Link className="admin-quick-link" href={item.href} key={item.href}><span className={`admin-shortcut-icon admin-shortcut-icon--${item.tone}`}><AdminOverviewIcon name={item.icon} size={29} /></span><span className="admin-shortcut-copy"><strong>{item.title}</strong><span>{item.description}</span></span><span className="admin-shortcut-arrow"><AdminOverviewIcon name="arrow" size={18} /></span></Link>)}
      </div></section>
    </div>
  </AdminGuard>;
}
