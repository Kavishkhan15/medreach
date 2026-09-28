import Link from "next/link";
import { EmergencyIcon } from "./EmergencyIcons";

// Distinct emergency card for acute care discovery.
// Features prominent emergency actions, distinct high-contrast styling,
// and dedicated emergency request flow to differentiate from standard directory cards.
export default function EmergencyHospitalCard({ hospital, category }) {
  const coords = hospital.location?.coordinates || [];
  const hasCoords = coords.length === 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1]);
  const emergencyPhone = hospital.emergencyPhone || hospital.phone || "112";

  const requestUrl = `/requests/new?hospital=${hospital._id || hospital.slug}&flow=emergency&emergencyType=${encodeURIComponent(
    category?.id || "general"
  )}&facility=Emergency%20Department`;

  return (
    <div className="card h-100 border-danger border-2 shadow-sm emergency-hospital-card">
      <div className="card-header bg-danger-subtle text-danger-emphasis d-flex justify-content-between align-items-center py-2 px-3">
        <span className="fw-bold small d-flex align-items-center gap-1 text-danger">
          <EmergencyIcon name="siren" size={16} /> Emergency Facility
        </span>
        {category && (
          <span className="badge bg-danger text-white d-inline-flex align-items-center gap-1">
            <EmergencyIcon name={category.id} size={14} /> {category.label} Match
          </span>
        )}
      </div>

      <div className="card-body d-flex flex-column p-3">
        <h3 className="h5 mb-1 fw-bold text-dark">
          <Link className="text-decoration-none text-dark" href={`/hospitals/${hospital.slug}`}>
            {hospital.name}
          </Link>
        </h3>

        <p className="text-muted small mb-2 d-flex align-items-center gap-1">
          <EmergencyIcon name="pin" size={14} className="text-secondary flex-shrink-0" />
          <span>
            {hospital.address || hospital.locality || hospital.city || "Mumbai"}
            {hospital.hospitalType ? ` · ${hospital.hospitalType}` : ""}
          </span>
        </p>

        {hospital.specialties?.length > 0 && (
          <div className="mb-3 d-flex flex-wrap gap-1">
            {hospital.specialties.slice(0, 3).map((s) => (
              <span key={s} className="badge bg-light text-secondary border">
                {s}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto pt-3 border-top">
          <div className="vstack gap-2">
            <div className="d-flex gap-2">
              <a
                className="btn btn-danger flex-fill fw-bold d-inline-flex align-items-center justify-content-center gap-1"
                href={`tel:${emergencyPhone}`}
              >
                <EmergencyIcon name="phone" size={16} /> Call {emergencyPhone}
              </a>

              {hasCoords && (
                <a
                  className="btn btn-outline-dark flex-fill d-inline-flex align-items-center justify-content-center gap-1"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <EmergencyIcon name="navigate" size={16} /> Navigate
                </a>
              )}
            </div>

            <Link
              className="btn btn-warning text-dark fw-bold w-100 text-center d-inline-flex align-items-center justify-content-center gap-2"
              href={requestUrl}
            >
              <EmergencyIcon name="bed" size={18} /> Request Emergency Bed
            </Link>

            <div className="text-end">
              <Link href={`/hospitals/${hospital.slug}`} className="text-muted small">
                View Full Details →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
