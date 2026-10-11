"use client";
import { useState } from "react";
import { adminCreateAlert, useAdminAction, adminEntity } from "@medreach/core";
import { surface, btnPrimary } from "../../../lib/tone";
import AdminActionFeedback from "../../../components/AdminActionFeedback";
import AdminGuard from "../../../components/AdminGuard";

const label = "block font-semibold mb-1";
const control = "w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-white px-3 py-2 focus:outline-none";

export default function AdminAlertsPage() {
  const [alert, setAlert] = useState({ title: "", body: "", severity: "info", region: "" });
  const action = useAdminAction();
  const broadcast = async (e) => {
    e.preventDefault();
    const result = await action.run(() => adminCreateAlert(alert), { validate: adminEntity("alert"), success: "Alert recorded." });
    if (result) setAlert({ title: "", body: "", severity: "info", region: "" });
  };
  return (
    <AdminGuard title="Alerts" subtitle="Broadcast infrastructure/system notices (stale data and service outages). Not medical or AI alerts.">
      <div className={surface} style={{ maxWidth: 720 }}>
        <AdminActionFeedback action={action} />
        <form onSubmit={broadcast} className="flex flex-wrap -mx-1">
          <div className="w-full md:w-1/2 px-1 mb-2"><label className={label} htmlFor="t">Title</label><input id="t" className={control} value={alert.title} onChange={(e) => setAlert({ ...alert, title: e.target.value })} required /></div>
          <div className="w-full md:w-1/4 px-1 mb-2"><label className={label} htmlFor="sev">Severity</label><select id="sev" className={control} value={alert.severity} onChange={(e) => setAlert({ ...alert, severity: e.target.value })}><option value="info">info</option><option value="warning">warning</option><option value="critical">critical</option></select></div>
          <div className="w-full md:w-1/4 px-1 mb-2"><label className={label} htmlFor="reg">Region</label><input id="reg" className={control} value={alert.region} onChange={(e) => setAlert({ ...alert, region: e.target.value })} /></div>
          <div className="w-full px-1 mb-2"><label className={label} htmlFor="b">Message</label><textarea id="b" className={control} rows={3} value={alert.body} onChange={(e) => setAlert({ ...alert, body: e.target.value })} required /></div>
          <div className="w-full px-1"><button disabled={action.disabled} className={btnPrimary}>Broadcast</button></div>
        </form>
      </div>
    </AdminGuard>
  );
}
