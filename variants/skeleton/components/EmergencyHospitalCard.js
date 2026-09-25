import Link from "next/link";
import { EmergencyIcon } from "./EmergencyIcons";

export default function EmergencyHospitalCard({ hospital, category }) {
  const coords = hospital.location?.coordinates || [];
  const hasCoords = coords.length === 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1]);
  const emergencyPhone = hospital.emergencyPhone || hospital.phone || "112";

  const requestUrl = `/requests/new?hospital=${hospital._id || hospital.slug}&isEmergency=true&flow=emergency&emergencyType=${encodeURIComponent(
    category?.id || "general"
  )}&facility=Emergency%20Department`;

  return (
    <div className="card surface emergency-hospital-card" style={{ border: "2px solid #e63946", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ backgroundColor: "#fdecee", color: "#e63946", padding: "0.5rem 0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f8d7da" }}>
        <span className="fw-bold small" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <EmergencyIcon name="siren" size={16} /> Emergency Facility
        </span>
        {category && (
          <span className="status-pill tone-danger" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            <EmergencyIcon name={category.id} size={14} /> {category.label} Match
          </span>
        )}
      </div>

      <div className="card-body" style={{ padding: "1rem", display: "flex", flexDirection: "column", flexGrow: 1 }}>
        <h3 className="h5 mb-1 fw-bold">
          <Link href={`/hospitals/${hospital.slug}?flow=emergency`}>
            {hospital.name}
          </Link>
        </h3>

        <p className="disclaimer mb-2" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <EmergencyIcon name="pin" size={14} />
          <span>
            {hospital.address || hospital.locality || hospital.city || "Mumbai"}
            {hospital.hospitalType ? ` · ${hospital.hospitalType}` : ""}
          </span>
        </p>

        {hospital.specialties?.length > 0 && (
          <div className="mb-3" style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
            {hospital.specialties.slice(0, 3).map((s) => (
              <span key={s} className="status-pill tone-neutral">
                {s}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto pt-3 border-top" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <a
              className="btn btn-primary"
              style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.25rem", padding: "0.4rem 0.5rem", fontSize: "0.85rem" }}
              href={`tel:${emergencyPhone}`}
            >
              <EmergencyIcon name="phone" size={16} /> Call {emergencyPhone}
            </a>

            {hasCoords && (
              <a
                className="btn btn-outline-secondary"
                style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.25rem", padding: "0.4rem 0.5rem", fontSize: "0.85rem" }}
                href={`https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <EmergencyIcon name="navigate" size={16} /> Navigate
              </a>
            )}
          </div>

          <Link
            className="btn btn-primary"
            style={{ backgroundColor: "#ffc107", color: "#000", border: "none", width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "0.5rem" }}
            href={requestUrl}
          >
            <EmergencyIcon name="bed" size={18} /> Request Emergency Bed
          </Link>

          <div style={{ textAlign: "right" }}>
            <Link href={`/hospitals/${hospital.slug}?flow=emergency`} className="disclaimer">
              View Full Details →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
