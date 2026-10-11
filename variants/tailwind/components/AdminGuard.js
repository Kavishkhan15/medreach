"use client";
import { useAdminAccess } from "@medreach/core";
import AdminNav from "./AdminNav";

// Wraps every admin page: gates on admin role and renders the sub-nav.
export default function AdminGuard({ title, subtitle, children }) {
  const { ready, allowed } = useAdminAccess();
  if (!ready) return <p className="text-[var(--color-muted)]">Loading…</p>;
  if (!allowed) return <div className="rounded bg-[var(--color-warning-bg)] text-[var(--color-warning)] px-3 py-2">Admin access required. Please sign in as an administrator.</div>;
  return (
    <>
      <header className="mb-3">
        <h1 className="text-2xl mb-1">{title}</h1>
        {subtitle && <p className="text-[.78rem] text-[var(--color-muted)] mb-0">{subtitle}</p>}
      </header>
      <AdminNav />
      {children}
    </>
  );
}
