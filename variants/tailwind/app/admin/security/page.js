"use client";
import { useEffect, useState } from "react";
import { adminListAudit, relativeTime } from "@medreach/core";
import { productApi } from "../../../lib/productApi";
import AdminGuard from "../../../components/AdminGuard";

export default function AdminSecurityPage() {
  const [audit, setAudit] = useState([]); const [email, setEmail] = useState(null); const [error, setError] = useState("");
  useEffect(() => { Promise.all([adminListAudit(), productApi("/api/email/status")])
    .then(([events, config]) => { setAudit((events.data || []).filter((item) => ["AuthSession", "User", "UserEmail", "UserPassword", "GoogleIdentity", "AuthRegistration"].includes(item.entityType))); setEmail(config); })
    .catch((reason) => setError(reason.message)); }, []);
  return <AdminGuard systemOnly title="Security & authentication" subtitle="Safe operational metadata only; passwords, hashes, OAuth tokens, refresh tokens, and SMTP credentials never appear here.">
    {error && <div className="alert alert-danger">{error}</div>}
    <div className="row g-3 mb-3"><div className="col-md-4"><div className="surface h-100"><h2 className="h6">Access tokens</h2><p className="mb-0">Short-lived, signed, httpOnly cookie</p></div></div><div className="col-md-4"><div className="surface h-100"><h2 className="h6">Refresh sessions</h2><p className="mb-0">Opaque, hashed, rotating, revocable</p></div></div><div className="col-md-4"><div className="surface h-100"><h2 className="h6">Email delivery</h2><p className="mb-0">{email ? `${email.mode} · ${email.configured ? "configured" : "not configured"}` : "Loading…"}</p></div></div></div>
    <div className="surface table-responsive"><h2 className="h5">Recent authentication events</h2><table className="table"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Area</th><th>Request</th></tr></thead><tbody>{audit.map((event) => <tr key={event._id}><td>{relativeTime(event.createdAt)}</td><td>{event.user?.name || "System/public"}</td><td>{event.action}</td><td>{event.entityType}</td><td><code>{event.requestId || "—"}</code></td></tr>)}{!audit.length && <tr><td colSpan="5" className="text-secondary">No recent authentication events.</td></tr>}</tbody></table></div>
  </AdminGuard>;
}
