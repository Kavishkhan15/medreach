"use client";
import Link from "next/link";

export default function AdminDataState({ resource, label, empty, emptyMessage = "No records found.", children }) {
  if (resource.status === "loading") return <p role="status" className="text-sm text-[var(--color-muted)]">Loading {label}…</p>;
  if (resource.status === "error") return <div role="alert" className="rounded border border-red-200 bg-red-50 text-red-900 p-3 mb-3">
    <p>{resource.error}</p>
    {resource.error.includes("Sign in") && <Link href="/login">Sign in again</Link>}
    <button type="button" className="inline-flex items-center rounded border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50" onClick={resource.reload}>Retry {label}</button>
  </div>;
  if (empty ?? (Array.isArray(resource.data) && resource.data.length === 0)) return <p className="text-sm text-[var(--color-muted)]">{emptyMessage}</p>;
  return typeof children === "function" ? children(resource.data) : children;
}
