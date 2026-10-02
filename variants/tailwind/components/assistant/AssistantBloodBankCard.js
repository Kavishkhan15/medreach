"use client";
import Link from "next/link";
import EmergencyIcon from "../AssistantIcon";
import styles from "../HealthcareAssistant.module.css";

export default function AssistantBloodBankCard({ bloodBank, onRequestBlood }) {
  if (!bloodBank) return null;
  const hasCoords = Array.isArray(bloodBank.coordinates) && bloodBank.coordinates.length === 2
    && Number.isFinite(bloodBank.coordinates[0]) && Number.isFinite(bloodBank.coordinates[1]);
  return <div className={styles.resultCard}>
    <div className={styles.cardHeader}><h4>{bloodBank.name}</h4><span className={styles.badge}>Blood bank</span></div>
    <div className={styles.cardMeta}><EmergencyIcon name="pin" size={12} /><span>{bloodBank.locality || "Mumbai"}</span>
      {bloodBank.distanceKm != null && <span>· {bloodBank.distanceKm.toFixed(1)} km</span>}
      {bloodBank.operatingHours && <span>· {bloodBank.operatingHours}</span>}
    </div>
    {bloodBank.listedBloodGroups?.length > 0 && <div className={styles.cardTags}>{bloodBank.listedBloodGroups.map(group => <span className={styles.badge} key={group}>{group}</span>)}</div>}
    <div className={styles.actionRow}>
      {bloodBank.phone && <a className={styles.action} href={`tel:${bloodBank.phone}`}><EmergencyIcon name="phone" size={13} />Call</a>}
      {hasCoords && <a className={styles.action} href={`https://www.google.com/maps/dir/?api=1&destination=${bloodBank.coordinates[1]},${bloodBank.coordinates[0]}`} target="_blank" rel="noopener noreferrer"><EmergencyIcon name="navigate" size={13} />Directions</a>}
      {onRequestBlood && <button type="button" className={styles.primaryAction} onClick={() => onRequestBlood(bloodBank)}>Request Units</button>}
      <Link className={styles.action} href="/urgent-blood">Urgent (6h-2d) ›</Link>
    </div>
  </div>;
}
