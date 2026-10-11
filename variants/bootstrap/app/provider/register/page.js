"use client";
import { useAuth, useAdminAction, adminAcknowledgement } from "@medreach/core";
import AdminActionFeedback from "../../../components/AdminActionFeedback";
import { post } from "../../../lib/productApi";
export default function RegisterProvider() {
 const { user, ready } = useAuth(), action = useAdminAction();
 if (!ready) return <p role="status">Loading account…</p>;
 if (!user) return <p>Sign in before submitting your organisation for review.</p>;
 return <section className="surface mb-3"><h1>Register a healthcare provider</h1><p>System Admin must approve the organisation and provision its representative account before management access is available.</p><AdminActionFeedback action={action} /><form onSubmit={(e) => { e.preventDefault(); const fields = Object.fromEntries(new globalThis.FormData(e.currentTarget)); action.run(() => post("/api/providers/applications", fields), { validate: adminAcknowledgement, success: "Provider submission recorded for System Admin review." }); }}><label htmlFor="registration-kind">Provider type</label><select id="registration-kind" className="form-control" name="kind">{["hospital", "blood_bank", "diagnostic", "ambulance"].map((kind) => <option key={kind}>{kind}</option>)}</select>{[["name", "Organisation name", "text"], ["address", "Address", "text"], ["contactEmail", "Real representative contact email", "email"]].map(([field,label,type]) => <div key={field}><label htmlFor={`registration-${field}`}>{label}</label><input id={`registration-${field}`} className="form-control" name={field} type={type} required /></div>)}<label htmlFor="registration-explanation">Your affiliation</label><textarea id="registration-explanation" className="form-control" name="explanation" maxLength={1000} /><button className="btn btn-primary" disabled={action.disabled}>Submit for approval</button></form></section>;
}
