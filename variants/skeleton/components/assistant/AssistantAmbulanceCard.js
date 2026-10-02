"use client";
import EmergencyIcon from "../AssistantIcon";
import styles from "../HealthcareAssistant.module.css";

export default function AssistantAmbulanceCard({ ambulance, onBookAmbulance }) {
  if (!ambulance) return null;
  const phone = ambulance.phone || "108";
  return <div className={styles.resultCard}>
    <div className={styles.cardHeader}><h4>{ambulance.name}</h4><span className={styles.badge}>Ambulance</span></div>
    <div className={styles.cardMeta}><span>{ambulance.providerType || "Medical Ambulance"}</span></div>
    <div className={styles.cardMeta}><EmergencyIcon name="pin" size={12} /><span>{ambulance.locality || "Mumbai"}</span>
      {ambulance.distanceKm != null && <span>· {ambulance.distanceKm.toFixed(1)} km</span>}
      {ambulance.coverageArea && <span>· Coverage: {ambulance.coverageArea}</span>}
    </div>
    <div className={styles.actionRow}>
      <a className={styles.action} href={`tel:${phone}`}><EmergencyIcon name="phone" size={13} />Call {phone}</a>
      {onBookAmbulance && <button type="button" className={styles.primaryAction} onClick={() => onBookAmbulance(ambulance)}><EmergencyIcon name="ambulance" size={13} />Book Ambulance</button>}
      <a className={styles.action} href="tel:108" title="Government Emergency Ambulance">Dial 108</a>
    </div>
  </div>;
}
