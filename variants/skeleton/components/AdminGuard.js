"use client";
import { useAuth } from "@medreach/core";
import AdminNav from "./AdminNav";

// Wraps every admin page: gates on admin role and renders the sub-nav.
export default function AdminGuard({ title, subtitle, children }) {
  const { ready, isAdmin } = useAuth();
  if (!ready) return <p className="text-secondary">Loading…</p>;
  if (!isAdmin) return <div className="alert alert-warning">Admin access required. Please sign in as an administrator.</div>;
  return (
    <>
      <header className="mb-3">
        <h1 className="h3 mb-1">{title}</h1>
        {subtitle && <p className="disclaimer mb-0">{subtitle}</p>}
      </header>
      <AdminNav />
      {children}
    </>
  );
}
