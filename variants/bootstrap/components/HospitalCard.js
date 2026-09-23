import Link from "next/link";
import EmergencyIcon from "./EmergencyIcons";

// Hospital directory card — focused information & discovery (per spec).
// Shows hospital name and Call / Navigate / Details actions.
export default function HospitalCard({ hospital }) {
  const coords = hospital.location?.coordinates || [];
  const hasCoords = coords.length === 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1]);

  return (
    <div className="card h-100 hospital-card shadow-sm border">
      <div className="card-body d-flex flex-column p-3 p-sm-4">
        <h3 className="h6 mb-3 fw-bold">
          <Link className="text-decoration-none text-dark" href={`/hospitals/${hospital.slug}`}>
            {hospital.name}
          </Link>
        </h3>

        <div className="mt-auto pt-2 border-top">
          <div className="action-bar d-flex gap-2">
            <a
              className="btn btn-sm btn-primary flex-fill"
              href={`tel:${hospital.emergencyPhone || hospital.phone || "112"}`}
            >
              <EmergencyIcon name="phone" size={14} className="me-1" /> Call
            </a>
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
            <Link
              className="btn btn-sm btn-outline-secondary flex-fill text-center"
              href={`/hospitals/${hospital.slug}`}
            >
              Details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
