"use client";
import { useState, useEffect } from "react";
import { demoAudit, adminListAudit, relativeTime } from "@medreach/core";
import AdminGuard from "../../../components/AdminGuard";

export default function AdminAuditPage() {
  const [entries, setEntries] = useState(demoAudit);
  const [demo, setDemo] = useState(true);
  useEffect(() => {
    adminListAudit().then((r) => { setEntries(r.data); setDemo(false); }).catch(() => { setEntries(demoAudit); setDemo(true); });
  }, []);
  return (
    <AdminGuard systemOnly title="Audit log" subtitle="Provenance for critical administrative actions. IP addresses are hashed, never stored raw.">
      {demo && <div className="alert alert-warning py-2">Demo dataset — not live audit records.</div>}
      <div className="surface">
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead><tr><th scope="col">When</th><th scope="col">User</th><th scope="col">Role</th><th scope="col">Action</th><th scope="col">Entity</th></tr></thead>
            <tbody>
              {entries.map((a) => (
                <tr key={a._id}>
                  <td className="small text-secondary">{relativeTime(a.createdAt)}</td>
                  <th scope="row" className="fw-semibold">{a.user?.name || "—"}</th>
                  <td className="small">{a.user?.role || "—"}</td>
                  <td className="small">{a.action}</td>
                  <td className="small">{a.entityType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminGuard>
  );
}
