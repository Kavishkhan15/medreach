"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useAuth, useAdminResource, useAdminAction, adminList, adminEntity } from "@medreach/core";
import AdminDataState from "../../components/AdminDataState";
import AdminActionFeedback from "../../components/AdminActionFeedback";
import StaffBedRequest from "../../components/StaffBedRequest";
import { productApi } from "../../lib/productApi";
const loadMine = (signal) => productApi("/api/providers/mine", { signal });
const loadBeds = (signal) => productApi("/api/emergency-requests", { signal });
const loadBlood = (signal) => productApi("/api/blood-requests", { signal });
const loadAmbulance = (signal) => productApi("/api/ambulances/bookings", { signal });
const parseOrganizations = adminList("organization"), parseBeds = adminList("staffRequest"), parseBlood = adminList("bloodRequest"), parseBookings = adminList("booking"), parseApplications = adminList("application");
export default function ProviderWorkspace() {
 const { user, ready } = useAuth();
 const enabled = ready && ["system_admin", "provider_admin", "hospital_admin"].includes(user?.role);
 const organizations = useAdminResource(loadMine, parseOrganizations, enabled);
 const beds = useAdminResource(loadBeds, parseBeds, enabled), blood = useAdminResource(loadBlood, parseBlood, enabled), ambulance = useAdminResource(loadAmbulance, parseBookings, enabled);
 const [selected, setSelected] = useState(""), action = useAdminAction();
 const current = organizations.data?.find((r) => r._id === selected) || organizations.data?.[0];
 const organizationId = current?._id;
 const loadApplicants = useCallback((signal) => productApi(`/api/organizations/${organizationId}/applications`, { signal }), [organizationId]);
 const applications = useAdminResource(loadApplicants, parseApplications, enabled && Boolean(organizationId));
 if (!ready) return <p role="status">Loading provider workspace…</p>;
 if (!enabled) return <p>Provider administrator access is required. <Link href="/login">Sign in</Link></p>;
 const saveContact = (form) => action.run(() => productApi(current.kind === "hospital" ? `/api/hospitals/${current._id}` : `/api/admin/resources/${current._id}`, { method: current.kind === "hospital" ? "PUT" : "PATCH", body: { phone: form.get("phone"), website: form.get("website"), address: form.get("address") } }), { validate: adminEntity(current.kind === "hospital" ? "hospital" : "data"), success: "Contact update confirmed.", refresh: organizations.reload });
 return <><h1>Provider workspace</h1><p>Manage only your assigned organisations. Recorded requests do not confirm availability or fulfillment.</p><Link href="/provider/jobs">Manage provider jobs and applicants</Link> · <Link href="/provider/register">Submit a new provider for approval</Link><AdminActionFeedback action={action} />
  <section className="surface mb-4 p-4"><h2>Assigned organisations</h2><AdminDataState resource={organizations} label="provider assignments" emptyMessage="No organisation is assigned. Contact your System Admin.">{(rows) => <><label htmlFor="assigned-provider">Organisation</label><select id="assigned-provider" className="w-full rounded border border-[var(--color-border)] p-2" value={current?._id || ""} onChange={(e) => setSelected(e.target.value)}>{rows.map((r) => <option key={r._id} value={r._id}>{r.name} · {r.kind}</option>)}</select>{current && <form key={current._id} onSubmit={(e) => { e.preventDefault(); saveContact(new globalThis.FormData(e.currentTarget)); }}><h3>{current.name}</h3>{["phone", "website", "address"].map((field) => <div key={field}><label htmlFor={`provider-${field}`}>{field}</label><input id={`provider-${field}`} name={field} className="w-full rounded border border-[var(--color-border)] p-2" defaultValue={current[field] || ""} /></div>)}<button className="rounded bg-[var(--color-primary)] px-4 py-2 text-white" disabled={action.disabled}>Save contact information</button>{current.kind === "hospital" && <p><Link href="/hospital">Hospital availability and facility evidence</Link></p>}</form>}</>}</AdminDataState></section>
  <section className="surface mb-4 p-4"><h2>Bed requests</h2><AdminDataState resource={beds} label="bed requests" emptyMessage="No assigned bed requests.">{(rows) => rows.map((r) => <StaffBedRequest key={r._id} request={r} refresh={beds.reload} action={action} />)}</AdminDataState></section>
  <section className="surface mb-4 p-4"><h2>Blood requests and donation pledges</h2><AdminDataState resource={blood} label="blood requests" emptyMessage="No assigned blood requests.">{(rows) => rows.map((r) => <article key={r._id}><h3>{r.reference} · {r.type}</h3><p>{r.bloodGroup} · {r.status} · {r.isUrgent ? "Urgent" : "Ordinary"}</p><p>{r.patientOrDonorName} · {r.contactPhone}</p><p>Contact the requester directly; the existing API does not provide a provider fulfillment action.</p></article>)}</AdminDataState></section>
  <section className="surface mb-4 p-4"><h2>Ambulance bookings</h2><AdminDataState resource={ambulance} label="ambulance bookings" emptyMessage="No assigned ambulance bookings.">{(rows) => rows.map((r) => <article key={r._id}><h3>{r.reference} · {r.status}</h3><p>{r.isEmergency ? "Emergency" : "Ordinary transport"}</p><p>{r.requestSnapshot?.patientName} · {r.requestSnapshot?.contactPhone} · {r.requestSnapshot?.pickupAddress}</p><p>Booking state changes are not exposed by the existing API. Confirm transport directly.</p></article>)}</AdminDataState></section>
  {current && <section className="surface mb-4 p-4"><h2>Organisation applications · {current.name}</h2><AdminDataState resource={applications} label="organisation applicants" emptyMessage="No organisation applications.">{(rows) => rows.map((r) => <article key={r._id}><h3>{r.candidateName || r.applicant?.name}</h3><p>{r.contactEmail || r.applicant?.email} · {r.status}</p><p>{r.sop || r.statement}</p>{["under_review", "shortlisted", "rejected"].map((status) => <button key={status} className="rounded border border-[var(--color-border)] px-3 py-2" disabled={action.disabled} onClick={() => action.run(() => productApi(`/api/organization-applications/${r._id}`, { method: "PATCH", body: { status } }), { validate: adminEntity("application"), success: "Application review confirmed.", refresh: applications.reload })}>{status.replaceAll("_", " ")}</button>)}</article>)}</AdminDataState></section>}
 </>;
}
