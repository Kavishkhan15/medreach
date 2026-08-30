"use client";
import { useState, useEffect } from "react";
import { demoAudit, adminListAudit, relativeTime } from "@medreach/core";
import { surface } from "../../../lib/tone";
import AdminGuard from "../../../components/AdminGuard";

export default function AdminAuditPage() {
  const [entries, setEntries] = useState(demoAudit);
  const [demo, setDemo] = useState(true);
  useEffect(() => {
    adminListAudit().then((r) => { setEntries(r.data); setDemo(false); }).catch(() => { setEntries(demoAudit); setDemo(true); });
  }, []);
  return (
    <AdminGuard title="Audit log" subtitle="Provenance for critical administrative actions. IP addresses are hashed, never stored raw.">
      {demo && <div className="rounded bg-[var(--color-warning-bg)] text-[var(--color-warning)] px-3 py-2 mb-3">Demo dataset — not live audit records.</div>}
      <div className={surface}>
        <div className="overflow-x-auto">
          <table className="w-full align-middle mb-0 text-left">
            <thead><tr className="border-b border-[var(--color-border)]"><th scope="col" className="py-2 pr-3">When</th><th scope="col" className="py-2 pr-3">User</th><th scope="col" className="py-2 pr-3">Role</th><th scope="col" className="py-2 pr-3">Action</th><th scope="col" className="py-2 pr-3">Entity</th></tr></thead>
            <tbody>
              {entries.map((a) => (
                <tr key={a._id} className="border-b border-[var(--color-border)]">
                  <td className="py-2 pr-3 text-sm text-[var(--color-muted)]">{relativeTime(a.createdAt)}</td>
                  <th scope="row" className="py-2 pr-3 font-semibold">{a.user?.name || "—"}</th>
                  <td className="py-2 pr-3 text-sm">{a.user?.role || "—"}</td>
                  <td className="py-2 pr-3 text-sm">{a.action}</td>
                  <td className="py-2 pr-3 text-sm">{a.entityType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminGuard>
  );
}
