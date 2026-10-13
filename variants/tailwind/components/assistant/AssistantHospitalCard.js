"use client";
import Link from "next/link";
import EmergencyIcon from "../AssistantIcon";
import styles from "../HealthcareAssistant.module.css";

export default function AssistantHospitalCard({ hospital, emergency = false }) {
  if (!hospital) return null;
  const hasCoords = Array.isArray(hospital.coordinates) && hospital.coordinates.length === 2
    && Number.isFinite(hospital.coordinates[0]) && Number.isFinite(hospital.coordinates[1]);
  const phone = hospital.phone || hospital.emergencyPhone;
  const slug = hospital.slug || hospital.id;
  const requestBedUrl = emergency
    ? `/requests/new?hospital=${encodeURIComponent(hospital.id || slug)}&flow=emergency&facility=Emergency%20Department`
    : `/requests/new?hospital=${encodeURIComponent(hospital.id || slug)}&flow=standard`;
  return <div className={styles.resultCard}>
    <div className={styles.cardHeader}>
      <h4><Link href={`/hospitals/${slug}`}>{hospital.name}</Link></h4>

    </div>
    <div className={styles.cardMeta}><EmergencyIcon name="pin" size={12} /><span>{hospital.locality || "Mumbai"}</span>
      {hospital.distanceKm != null && <span>· {hospital.distanceKm.toFixed(1)} km</span>}
      {hospital.hospitalType && <span>· {hospital.hospitalType}</span>}
    </div>
    {hospital.facilityDetail && <div className={styles.facility}>
      <p><strong>{hospital.facilityDetail.facility}:</strong> {hospital.facilityDetail.status === "unknown" ? "Status unconfirmed" : hospital.facilityDetail.status}</p>
      {hospital.facilityDetail.retrievedAtRelative && <p>Availability observed {hospital.facilityDetail.retrievedAtRelative}</p>}
    </div>}
    {hospital.specialties?.length > 0 && <div className={styles.cardTags}>{hospital.specialties.slice(0, 3).map(specialty => <span key={specialty} className={styles.badge}>{specialty}</span>)}</div>}
    <div className={styles.actionRow}>
      {phone && <a className={styles.action} href={`tel:${phone}`}><EmergencyIcon name="phone" size={13} />Call</a>}
      {hasCoords && <a className={styles.action} href={`https://www.google.com/maps/dir/?api=1&destination=${hospital.coordinates[1]},${hospital.coordinates[0]}`} target="_blank" rel="noopener noreferrer"><EmergencyIcon name="navigate" size={13} />Directions</a>}
      <Link className={styles.primaryAction} href={requestBedUrl}><EmergencyIcon name="bed" size={13} />Bed Request</Link>
      <Link className={styles.action} href={`/hospitals/${slug}`}>Details ›</Link>
    </div>
  </div>;
}
