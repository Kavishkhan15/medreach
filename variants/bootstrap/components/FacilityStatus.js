import StatusPill from "./StatusPill";
import { relativeTime } from "@medreach/core";

// Accessible facility → status table. Uses a real <table> for screen readers.
export default function FacilityStatus({ facilities = [] }) {
  if (!facilities.length) return <p className="disclaimer mb-0">No facility information available.</p>;
  return (
    <div className="table-responsive">
      <table className="table align-middle mb-0">
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
              <th scope="row" className="fw-semibold">{f.facility}{f.capabilityProvenance && <details className="small fw-normal mt-1"><summary>Source evidence</summary><div className="disclaimer mt-1">{f.capabilityProvenance.source?.name || "Source unknown"} · {f.capabilityProvenance.verificationStatus} · {f.capabilityProvenance.confidence}<br />Observed {f.capabilityProvenance.observedAt ? new Date(f.capabilityProvenance.observedAt).toLocaleString() : "unknown"}{f.capabilityProvenance.evidenceText && <><br />“{f.capabilityProvenance.evidenceText}”</>}{f.capabilityProvenance.sourcePageUrl?.startsWith("http") && <><br /><a href={f.capabilityProvenance.sourcePageUrl} target="_blank" rel="noopener noreferrer">View source page</a></>}</div></details>}</th>
              <td>{f.capability === "yes" ? "Yes" : f.capability === "no" ? "No" : "Unknown"}{f.capabilityConflict ? " (disputed)" : ""}</td>
              <td><StatusPill status={f.status} />{Number.isInteger(f.count) && <span className="small ms-2">{f.count} reported</span>}</td>
              <td className="disclaimer">{f.observedAt ? relativeTime(f.observedAt) : "unknown"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
