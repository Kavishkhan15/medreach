import StatusPill from "./StatusPill";
import { relativeTime } from "@medreach/core";

// Accessible facility → status table. Uses a real <table> for screen readers.
export default function FacilityStatus({ facilities = [] }) {
  if (!facilities.length) return <p className="disclaimer mb-0">No facility information available.</p>;
  return (
    <div className="table-responsive">
      <table className="table mb-0">
        <caption className="visually-hidden">Facility capability, current availability, and observation time</caption>
        <thead>
          <tr>
            <th scope="col">Facility</th>
            <th scope="col">Listed capability</th>
            <th scope="col">Current availability</th>
            <th scope="col">Observed</th>
          </tr>
        </thead>
        <tbody>
          {facilities.map((f) => (
            <tr key={f.facility}>
              <th scope="row" className="fw-semibold">{f.facility}</th>
              <td>{f.capability === "yes" ? "Yes" : f.capability === "no" ? "No" : "Unknown"}{f.capabilityConflict ? " (disputed)" : ""}</td>
              <td><StatusPill status={f.status} /></td>
              <td className="disclaimer">{f.observedAt ? relativeTime(f.observedAt) : "unknown"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
