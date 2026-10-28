import Link from "next/link";
import EmergencyIcon from "./EmergencyIcons";

// Hospital directory card: recorded details and the existing bed-request flow.
export default function HospitalCard({ hospital }) {
  const coords = hospital.location?.coordinates || [];
  const hasCoords = coords.length === 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])
    && Math.abs(coords[0]) <= 180 && Math.abs(coords[1]) <= 90 && (coords[0] !== 0 || coords[1] !== 0);
  const recorded = (value) => typeof value === "string" ? value.trim() : "";
  const address = recorded(hospital.address) || [hospital.locality, hospital.city].map(recorded).filter(Boolean).join(", ");
  const hours = recorded(hospital.operatingHours) || recorded(hospital.hours);
  const services = [...new Map([hospital.specialties, hospital.departments, hospital.services]
    .flatMap(values => Array.isArray(values) ? values : []).map(recorded).filter(Boolean)
    .map(value => [value.toLowerCase(), value])).values()];
  const requestId = hospital._id || hospital.id || hospital.slug || "";
  const requestUrl = `/requests/new?hospital=${encodeURIComponent(requestId)}&flow=standard`;
  const detailsUrl = hospital.slug ? `/hospitals/${encodeURIComponent(hospital.slug)}` : null;

  return (
    <article className="card h-100 hospital-card shadow-sm border">
      <div className="card-body d-flex flex-column p-3 p-sm-4">
        <h2 className="h5 mb-2 fw-semibold hospital-card-title">
          {detailsUrl ? <Link className="text-decoration-none text-dark" href={detailsUrl}>{hospital.name}</Link> : hospital.name}
        </h2>
        <p className="hospital-card-address text-secondary mb-2">{address || "Address not recorded"}</p>
        {recorded(hospital.hospitalType) && <p className="hospital-card-type mb-2 text-capitalize">{hospital.hospitalType} hospital</p>}
        <p className="hospital-card-services mb-2">{services.length ? <>{services.slice(0, 4).join(" · ")}{services.length > 4 && ` · +${services.length - 4} more`}</> : "Specialties and services not recorded"}</p>
        <p className="hospital-card-hours text-secondary mb-3">{hours ? `Hours: ${hours}` : "Hours not recorded"}</p>

        <div className="mt-auto pt-2 border-top">
          <div className="action-bar d-flex flex-wrap gap-2 hospital-card-actions">
            <Link
              className="btn btn-sm btn-primary flex-fill"
              href={requestUrl}
            >
              <EmergencyIcon name="hospital" size={16} className="me-1" /> Request beds
            </Link>
            {hasCoords ? (
              <a
                className="btn btn-sm btn-outline-secondary flex-fill"
                href={`https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <EmergencyIcon name="navigate" size={14} className="me-1" /> Navigate
              </a>
            ) : null}
            {detailsUrl && <Link
              className="btn btn-sm btn-outline-secondary flex-fill text-center"
              href={detailsUrl}
            >
              Details
            </Link>}
          </div>
        </div>
      </div>
    </article>
  );
}
