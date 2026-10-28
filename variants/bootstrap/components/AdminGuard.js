"use client";
import { useAdminAccess } from "@medreach/core";
import AdminNav from "./AdminNav";

// Wraps every admin page: gates on admin role and renders the sub-nav.
export default function AdminGuard({ title, subtitle, children, className = "" }) {
  const { ready, allowed } = useAdminAccess();
  if (!ready) return <div className="admin-page-state"><h1 className="h3">{title}</h1><p role="status">Loading your workspace…</p></div>;
  if (!allowed) return <div className="admin-page-state alert alert-warning"><h1 className="h3">{title}</h1><p>Admin access required. Please sign in as a System Admin.</p></div>;
  return (
    <div className={`admin-workspace ${className}`.trim()}>
      <header className="admin-page-header">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </header>
      <AdminNav />
      <div className="admin-page-body">{children}</div>
    </div>
  );
}
