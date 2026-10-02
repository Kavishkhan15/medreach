"use client";
import Link from "next/link";
import EmergencyIcon from "../EmergencyIcons";
import styles from "../HealthcareAssistant.module.css";

export default function AssistantJobCard({ job }) {
  if (!job) return null;
  return <div className={styles.resultCard}>
    <div className={styles.cardHeader}><h4>{job.title}</h4><span className={styles.badge}>{job.employmentType ? job.employmentType.replace("_", " ") : "Full Time"}</span></div>
    <div className={styles.cardMeta}><strong>{job.hospitalName}</strong>
      {job.department && <span>· {job.department}</span>}
      {job.location && <span>· <EmergencyIcon name="pin" size={11} />{job.location}</span>}
    </div>
    <div className={styles.actionRow}>
      <Link className={styles.primaryAction} href={`/jobs/${job.id}`}>View & Apply</Link>
      <Link className={styles.action} href="/careers">All Careers ›</Link>
    </div>
  </div>;
}
