import StatusPill from "./StatusPill";
import { relativeTime } from "@medreach/core";

// Accessible facility → status table. Uses a real <table> for screen readers.
export default function FacilityStatus({ facilities = [] }) {
  if (!facilities.length) return <p className="text-[.78rem] text-[var(--color-muted)] mb-0">No facility information available.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full align-middle mb-0 text-left">
        <caption className="sr-only">Facility availability and last update time</caption>
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th scope="col" className="py-2 pr-3">Facility</th>
            <th scope="col" className="py-2 pr-3">Status</th>
            <th scope="col" className="py-2 pr-3">Updated</th>
          </tr>
        </thead>
        <tbody>
          {facilities.map((f) => (
            <tr key={f.facility} className="border-b border-[var(--color-border)]">
              <th scope="row" className="py-2 pr-3 font-semibold">{f.facility}</th>
              <td className="py-2 pr-3"><StatusPill status={f.status} /></td>
              <td className="py-2 pr-3 text-[.78rem] text-[var(--color-muted)]">{f.lastUpdated ? relativeTime(f.lastUpdated) : "unknown"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
