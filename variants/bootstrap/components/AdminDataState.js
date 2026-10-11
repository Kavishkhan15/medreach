"use client";
import Link from "next/link";

export default function AdminDataState({ resource, label, empty, emptyMessage = "No records found.", children }) {
  if (resource.status === "loading") return <p role="status" className="text-secondary">Loading {label}…</p>;
  if (resource.status === "error") return <div role="alert" className="alert alert-danger">
    <p>{resource.error}</p>
    {resource.error.includes("Sign in") && <Link href="/login">Sign in again</Link>}
    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={resource.reload}>Retry {label}</button>
  </div>;
  if (empty ?? (Array.isArray(resource.data) && resource.data.length === 0)) return <p className="text-secondary">{emptyMessage}</p>;
  return typeof children === "function" ? children(resource.data) : children;
}
