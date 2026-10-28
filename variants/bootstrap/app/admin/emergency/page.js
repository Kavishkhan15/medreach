"use client";
import { useAdminAccess, useAdminResource, adminList } from "@medreach/core";
import AdminGuard from "../../../components/AdminGuard";
import AdminDataState from "../../../components/AdminDataState";
import { productApi } from "../../../lib/productApi";

const loadBeds = (signal) => productApi("/api/emergency-requests", { signal });
const loadBlood = (signal) => productApi("/api/blood-requests", { signal });
const loadAmbulance = (signal) => productApi("/api/ambulances/bookings", { signal });

const parseBeds = adminList("emergencyRequest");
const parseBlood = adminList("bloodRequest");
const parseAmbulance = adminList("booking");

export default function EmergencyRequests() {
  const { allowed } = useAdminAccess();
  const beds = useAdminResource(loadBeds, parseBeds, allowed);
  const blood = useAdminResource(loadBlood, parseBlood, allowed);
  const ambulance = useAdminResource(loadAmbulance, parseAmbulance, allowed);

  const groups = [
    {
      label: "Emergency bed requests",
      resource: beds,
      filter: (r) => r.isEmergency === true && !["CT", "MRI"].includes(r.requiredFacility) && !/diagnostic/i.test(r.emergencyType || ""),
      type: "Hospital bed request",
      getUrgency: (r) => (r.isEmergency === true ? "Emergency" : "Normal"),
      getName: (r) => r.hospital?.name || "Provider record unavailable",
      getId: (r) => r.requestId,
      emptyMessage: "No recorded emergencies in this category.",
    },
    {
      label: "Normal hospital bed requests",
      resource: beds,
      filter: (r) => r.isEmergency !== true && !["CT", "MRI"].includes(r.requiredFacility) && !/diagnostic/i.test(r.emergencyType || ""),
      type: "Hospital bed request",
      getUrgency: (r) => (r.isEmergency === true ? "Emergency" : "Normal"),
      getName: (r) => r.hospital?.name || "Provider record unavailable",
      getId: (r) => r.requestId,
      emptyMessage: "No recorded normal bed requests.",
    },
    {
      label: "Blood requests",
      resource: blood,
      filter: (r) => true,
      type: "Blood request",
      getType: (r) => (r.type === "DONATION" ? "Blood donation pledge" : "Blood request"),
      getUrgency: (r) => (r.isUrgent === true ? "Urgent" : "Normal"),
      getName: (r) => r.bloodBankName || "Provider record unavailable",
      getId: (r) => r.reference,
      emptyMessage: "No recorded blood requests.",
    },
    {
      label: "Diagnostic-centre requests",
      resource: beds,
      filter: (r) => ["CT", "MRI"].includes(r.requiredFacility) || /diagnostic/i.test(r.emergencyType || ""),
      type: "Diagnostic-centre request",
      getUrgency: (r) => (r.isEmergency === true ? "Emergency" : "Normal"),
      getName: (r) => r.hospital?.name || "Provider record unavailable",
      getId: (r) => r.requestId,
      emptyMessage: "No recorded diagnostic-centre requests.",
    },
    {
      label: "Ambulance bookings",
      resource: ambulance,
      filter: (r) => true,
      type: "Ambulance booking",
      getUrgency: (r) => (r.isEmergency === true ? "Emergency" : "Normal"),
      getName: (r) => r.providerSnapshot?.name || "Provider record unavailable",
      getId: (r) => r.reference,
      emptyMessage: "No recorded ambulance bookings.",
    },
  ];

  return (
    <AdminGuard title="Requests" subtitle="Hospital beds, blood, diagnostics and ambulance activity, grouped by service and urgency.">
      {groups.map((group) => (
        <section key={group.label} className="surface mb-4">
          <h2>{group.label}</h2>
          <AdminDataState
            resource={{ ...group.resource, data: group.resource.data ? group.resource.data.filter(group.filter) : null }}
            label={group.label.toLowerCase()}
            emptyMessage={group.emptyMessage}
          >
            {(rows) => <div className="admin-request-list">{rows.map((r) => (
              <article key={r._id} className="admin-request-card">
                <div><h3>{group.getId(r)}</h3><p className="mb-2">{group.getName(r)}</p>
                  <div className="admin-request-meta"><span>{group.getType ? group.getType(r) : group.type}</span><span>{group.getUrgency(r)}</span><span>Status: <strong>{r.status}</strong></span></div>
                </div>
                <time className="admin-request-date" dateTime={r.createdAt || undefined}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : "Timestamp unavailable"}</time>
              </article>
            ))}</div>}
          </AdminDataState>
        </section>
      ))}
    </AdminGuard>
  );
}
