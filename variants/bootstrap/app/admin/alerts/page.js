"use client";
import { useState } from "react";
import { adminCreateAlert } from "@medreach/core";
import AdminGuard from "../../../components/AdminGuard";

export default function AdminAlertsPage() {
  const [alert, setAlert] = useState({ title: "", body: "", severity: "info", region: "" });
  const [msg, setMsg] = useState("");
  const broadcast = async (e) => {
    e.preventDefault();
    try { await adminCreateAlert(alert); setMsg("Alert broadcast."); setAlert({ title: "", body: "", severity: "info", region: "" }); }
    catch (err) { setMsg((err.message || "Failed") + " (requires live backend + admin)"); }
  };
  return (
    <AdminGuard title="Alerts" subtitle="Broadcast infrastructure/system notices (stale data and service outages). Not medical or AI alerts.">
      <div className="surface" style={{ maxWidth: 720 }}>
        {msg && <div className="alert alert-info py-2">{msg}</div>}
        <form onSubmit={broadcast} className="row g-2">
          <div className="col-md-6"><label className="form-label fw-semibold" htmlFor="t">Title</label><input id="t" className="form-control" value={alert.title} onChange={(e) => setAlert({ ...alert, title: e.target.value })} required /></div>
          <div className="col-md-3"><label className="form-label fw-semibold" htmlFor="sev">Severity</label><select id="sev" className="form-select" value={alert.severity} onChange={(e) => setAlert({ ...alert, severity: e.target.value })}><option value="info">info</option><option value="warning">warning</option><option value="critical">critical</option></select></div>
          <div className="col-md-3"><label className="form-label fw-semibold" htmlFor="reg">Region</label><input id="reg" className="form-control" value={alert.region} onChange={(e) => setAlert({ ...alert, region: e.target.value })} /></div>
          <div className="col-12"><label className="form-label fw-semibold" htmlFor="b">Message</label><textarea id="b" className="form-control" rows={3} value={alert.body} onChange={(e) => setAlert({ ...alert, body: e.target.value })} required /></div>
          <div className="col-12"><button className="btn btn-primary">Broadcast</button></div>
        </form>
      </div>
    </AdminGuard>
  );
}
