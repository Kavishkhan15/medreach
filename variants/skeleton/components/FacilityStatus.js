import StatusPill from "./StatusPill";
import { relativeTime } from "@medreach/core";

// Accessible facility → status table. Uses a real <table> for screen readers.
export default function FacilityStatus({ facilities = [] }) {
  if (!facilities.length) return <p className="disclaimer mb-0">No facility information available.</p>;
  return (
    <div className="table-responsive">
      <table className="table mb-0">
        <caption className="visually-hidden">Facility availability and last update time</caption>
        <thead>
          <tr>
            <th scope="col">Facility</th>
            <th scope="col">Status</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {facilities.map((f) => (
            <tr key={f.facility}>
              <th scope="row" className="fw-semibold">{f.facility}</th>
              <td><StatusPill status={f.status} /></td>
              <td className="disclaimer">{f.lastUpdated ? relativeTime(f.lastUpdated) : "unknown"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
