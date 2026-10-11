"use client";
import { useState } from "react";
import { adminCreateAlert, useAdminAction, adminEntity } from "@medreach/core";
import AdminActionFeedback from "../../../components/AdminActionFeedback";
import AdminGuard from "../../../components/AdminGuard";

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
      <div className="surface" style={{ maxWidth: 720 }}>
        <AdminActionFeedback action={action} />
        <form onSubmit={broadcast} className="grid-alert-form">
          <div className="col-md-6"><label className="form-label fw-semibold" htmlFor="t">Title</label><input id="t" className="form-control" value={alert.title} onChange={(e) => setAlert({ ...alert, title: e.target.value })} required /></div>
          <div className="col-md-3"><label className="form-label fw-semibold" htmlFor="sev">Severity</label><select id="sev" className="form-select" value={alert.severity} onChange={(e) => setAlert({ ...alert, severity: e.target.value })}><option value="info">info</option><option value="warning">warning</option><option value="critical">critical</option></select></div>
          <div className="col-md-3"><label className="form-label fw-semibold" htmlFor="reg">Region</label><input id="reg" className="form-control" value={alert.region} onChange={(e) => setAlert({ ...alert, region: e.target.value })} /></div>
          <div className="col-12"><label className="form-label fw-semibold" htmlFor="b">Message</label><textarea id="b" className="form-control" rows={3} value={alert.body} onChange={(e) => setAlert({ ...alert, body: e.target.value })} required /></div>
          <div className="col-12"><button disabled={action.disabled} className="btn btn-primary">Broadcast</button></div>
        </form>
      </div>
    </AdminGuard>
  );
}
