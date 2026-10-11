"use client";
import { adminListAudit, adminList, useAdminResource, useAdminAccess, relativeTime } from "@medreach/core";
import AdminGuard from "../../../components/AdminGuard";
import AdminDataState from "../../../components/AdminDataState";
const load = (signal) => adminListAudit({ signal });
const validate = adminList("audit");
export default function AdminAuditPage() {
  const { allowed } = useAdminAccess();
  const audit = useAdminResource(load, validate, allowed);
  return <AdminGuard title="Audit log" subtitle="Recorded administrative actions. IP addresses are hashed.">
    <section className="surface mb-3"><AdminDataState resource={audit} label="audit log" emptyMessage="No audit records found.">
      {(entries) => <div style={{ overflowX: "auto" }}><table className="table align-middle"><thead><tr><th>When</th><th>User</th><th>Role</th><th>Action</th><th>Entity</th></tr></thead>
        <tbody>{entries.map((a) => <tr key={a._id}><td>{relativeTime(a.createdAt)}</td><th scope="row">{a.user?.name || "System/public"}</th><td>{a.user?.role || "—"}</td><td>{a.action}</td><td>{a.entityType}</td></tr>)}</tbody>
      </table></div>}
    </AdminDataState></section>
  </AdminGuard>;
}
