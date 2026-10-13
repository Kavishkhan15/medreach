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
    <AdminGuard title="Emergency Requests" subtitle="Centralized view of all hospital bed, blood, diagnostic-centre, and ambulance requests across MedReach, clearly labelled by type, urgency, and status.">
      {groups.map((group) => (
        <section key={group.label} className="surface mb-4">
          <h2>{group.label}</h2>
          <AdminDataState
            resource={{ ...group.resource, data: group.resource.data ? group.resource.data.filter(group.filter) : null }}
            label={group.label.toLowerCase()}
            emptyMessage={group.emptyMessage}
          >
            {(rows) => rows.map((r) => (
              <article key={r._id} className="surface mb-2 p-3">
                <h3>{group.getId(r)}</h3>
                <p>
                  <strong>Type:</strong> {group.getType ? group.getType(r) : group.type} ·{" "}
                  <strong>Urgency:</strong> {group.getUrgency(r)} ·{" "}
                  <strong>Status:</strong> {r.status}
                </p>
                <p>{group.getName(r)}</p>
                <p className="small mb-0">{r.createdAt ? new Date(r.createdAt).toLocaleString() : "Timestamp unavailable"}</p>
              </article>
            ))}
          </AdminDataState>
        </section>
      ))}
    </AdminGuard>
  );
}
