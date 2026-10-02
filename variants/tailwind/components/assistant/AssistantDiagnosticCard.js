"use client";
import Link from "next/link";
import EmergencyIcon from "../AssistantIcon";
import styles from "../HealthcareAssistant.module.css";

export default function AssistantDiagnosticCard({ diagnostic }) {
  if (!diagnostic) return null;
  const hasCoords = Array.isArray(diagnostic.coordinates) && diagnostic.coordinates.length === 2
    && Number.isFinite(diagnostic.coordinates[0]) && Number.isFinite(diagnostic.coordinates[1]);
  return <div className={styles.resultCard}>
    <div className={styles.cardHeader}><h4>{diagnostic.name}</h4><span className={styles.badge}>Diagnostics</span></div>
    <div className={styles.cardMeta}><EmergencyIcon name="pin" size={12} /><span>{diagnostic.locality || "Mumbai"}</span>
      {diagnostic.distanceKm != null && <span>· {diagnostic.distanceKm.toFixed(1)} km</span>}
      {diagnostic.operatingHours && <span>· {diagnostic.operatingHours}</span>}
    </div>
    {diagnostic.services?.length > 0 && <div className={styles.cardTags}>{diagnostic.services.slice(0, 5).map(service => <span className={styles.badge} key={service}>{service}</span>)}</div>}
    <div className={styles.actionRow}>
      {diagnostic.phone && <a className={styles.action} href={`tel:${diagnostic.phone}`}><EmergencyIcon name="phone" size={13} />Call</a>}
      {hasCoords && <a className={styles.action} href={`https://www.google.com/maps/dir/?api=1&destination=${diagnostic.coordinates[1]},${diagnostic.coordinates[0]}`} target="_blank" rel="noopener noreferrer"><EmergencyIcon name="navigate" size={13} />Directions</a>}
      <Link className={styles.action} href="/diagnostics">Directory ›</Link>
    </div>
  </div>;
}
