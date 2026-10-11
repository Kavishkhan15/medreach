"use client";
import { adminListAudit, adminList, adminEmailData, useAdminResource, useAdminAccess, relativeTime } from "@medreach/core";
import { productApi } from "../../../lib/productApi";
import AdminGuard from "../../../components/AdminGuard";
import AdminDataState from "../../../components/AdminDataState";
const loadAudit = (signal) => adminListAudit({ signal });
const parseAudit = adminList("audit");
const validateAudit = (r) => parseAudit(r).filter((a) => ["AuthSession", "User", "UserEmail", "UserPassword", "AuthRegistration"].includes(a.entityType));
const loadEmail = (signal) => productApi("/api/email/status", { signal });
export default function AdminSecurityPage() {
  const { allowed } = useAdminAccess();
  const audit = useAdminResource(loadAudit, validateAudit, allowed);
  const email = useAdminResource(loadEmail, adminEmailData, allowed);
  return <AdminGuard title="Security & authentication" subtitle="Operational metadata; credentials and tokens are never shown.">
    <div className="grid-stats"><section className="surface mb-3"><h2>Access tokens</h2><p>Short-lived, signed, httpOnly cookie</p></section><section className="surface mb-3"><h2>Refresh sessions</h2><p>Opaque, hashed, rotating, revocable</p></section></div>
    <section className="surface mb-3" aria-label="Email delivery"><h2>Email delivery</h2><AdminDataState resource={email} label="email status">{(data) => <p>{data.mode} · {data.configured ? "configured" : "not configured"}</p>}</AdminDataState></section>
    <section className="surface mb-3"><h2>Recent authentication events</h2><AdminDataState resource={audit} label="authentication events" emptyMessage="No recent authentication events.">
      {(events) => <div style={{ overflowX: "auto" }}><table className="table align-middle"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Area</th><th>Request</th></tr></thead><tbody>{events.map((event) => <tr key={event._id}><td>{relativeTime(event.createdAt)}</td><td>{event.user?.name || "System/public"}</td><td>{event.action}</td><td>{event.entityType}</td><td><code>{event.requestId || "—"}</code></td></tr>)}</tbody></table></div>}
    </AdminDataState></section>
  </AdminGuard>;
}
