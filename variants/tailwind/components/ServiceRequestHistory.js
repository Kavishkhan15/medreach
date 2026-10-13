"use client";
import Link from "next/link";
import { useAdminResource, adminList } from "@medreach/core";
import AdminDataState from "./AdminDataState";
import { productApi } from "../lib/productApi";

const loadBlood = (signal) => productApi("/api/blood-requests", { signal });
const loadAmbulance = (signal) => productApi("/api/ambulances/bookings", { signal });
const parseBlood = adminList("bloodRequest"), parseAmbulance = adminList("booking");

export default function ServiceRequestHistory({ enabled = true }) {
  const blood = useAdminResource(loadBlood, parseBlood, enabled);
  const ambulance = useAdminResource(loadAmbulance, parseAmbulance, enabled);

  if (!enabled) return null;

  return (
    <>
      <section className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5 mb-4">
        <h2 className="text-lg font-bold mb-3">Blood requests and donation pledges</h2>
        <AdminDataState resource={blood} label="blood request history" emptyMessage="No blood requests or donation pledges recorded.">
          {(rows) => rows.map((r) => (
            <article key={r._id} className="border border-[var(--color-border)] rounded-md p-3 mb-2 flex justify-between items-start flex-wrap gap-2">
              <div>
                <h3 className="font-semibold text-sm">{r.reference}</h3>
                <p className="text-sm my-1">
                  <strong>Type:</strong> {r.type === "DONATION" ? "Blood donation pledge" : "Blood request"} ·{" "}
                  <strong>Urgency:</strong> <span className={`text-xs px-2 py-0.5 rounded font-medium ${r.isUrgent ? "bg-red-100 text-red-800" : "bg-purple-100 text-purple-800"}`}>{r.isUrgent ? "Urgent" : "Normal"}</span> ·{" "}
                  <strong>Status:</strong> {r.status}
                </p>
                <p className="text-xs text-gray-500">{r.bloodBankName} · Group: {r.bloodGroup}</p>
              </div>
              <Link className="border border-[var(--color-emergency)] text-[var(--color-emergency)] text-xs font-semibold px-3 py-1 rounded hover:bg-red-50" href={`/track?type=blood&reference=${encodeURIComponent(r.reference)}`} aria-label={`Track blood request ${r.reference}`}>
                Track request
              </Link>
            </article>
          ))}
        </AdminDataState>
      </section>
      <section className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-5 mb-4">
        <h2 className="text-lg font-bold mb-3">Ambulance requests</h2>
        <AdminDataState resource={ambulance} label="ambulance request history" emptyMessage="No ambulance requests recorded.">
          {(rows) => rows.map((r) => (
            <article key={r._id} className="border border-[var(--color-border)] rounded-md p-3 mb-2 flex justify-between items-start flex-wrap gap-2">
              <div>
                <h3 className="font-semibold text-sm">{r.reference}</h3>
                <p className="text-sm my-1">
                  <strong>Type:</strong> Ambulance booking ·{" "}
                  <strong>Urgency:</strong> <span className={`text-xs px-2 py-0.5 rounded font-medium ${r.isEmergency ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"}`}>{r.isEmergency ? "Emergency" : "Normal"}</span> ·{" "}
                  <strong>Status:</strong> {r.status}
                </p>
                <p className="text-xs text-gray-500">{r.providerSnapshot?.name || "Ambulance provider"}</p>
              </div>
              <Link className="border border-[var(--color-emergency)] text-[var(--color-emergency)] text-xs font-semibold px-3 py-1 rounded hover:bg-red-50" href={`/track?type=ambulance&reference=${encodeURIComponent(r.reference)}`} aria-label={`Track ambulance request ${r.reference}`}>
                Track request
              </Link>
            </article>
          ))}
        </AdminDataState>
      </section>
    </>
  );
}
