"use client";
import { useProviderApplication, PROVIDER_APPLICATION_KINDS } from "@medreach/core";
import { post } from "../lib/productApi";
import styles from "./ProviderApplicationForm.module.css";
const submitApplication = (body) => post("/api/providers/applications", body);
const fields = [["name", "Organisation name", 180], ["contactName", "Contact person's name", 120], ["contactEmail", "Email address", 150], ["phone", "Phone number", 40], ["address", "Address", 300], ["city", "City", 100]];
export default function ProviderApplicationForm() {
  const state = useProviderApplication(submitApplication);
  return <section className="home-section" id="join-network" aria-labelledby="join-network-title"><div className="home-container">
    <div className={styles.layout}><header><h2 id="join-network-title">Join the MedReach Network</h2><p>Hospitals, blood banks, diagnostic centres and ambulance services can apply to join MedReach.</p><p>Applications are reviewed by the System Admin. Approval and account activation are required before provider access.</p></header>
      <form className={styles.form} onSubmit={state.submit} noValidate aria-busy={state.busy}>
        {state.message ? <div role="status" className={styles.success}>{state.message}</div> : <>
        {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
        <div className={styles.fields}>
        {fields.map(([field, label, max]) => <div key={field} className={field === "address" ? styles.full : undefined}><label htmlFor={`join-${field}`}>{label}</label><input id={`join-${field}`} className="form-control" type={field === "contactEmail" ? "email" : field === "phone" ? "tel" : "text"} autoComplete={field === "contactEmail" ? "email" : field === "phone" ? "tel" : field === "contactName" ? "name" : field === "address" ? "street-address" : field === "city" ? "address-level2" : "organization"} required maxLength={max} value={state.form[field]} onChange={state.set(field)} aria-invalid={Boolean(state.errors[field])} aria-describedby={state.errors[field] ? `join-error-${field}` : undefined} />{state.errors[field] && <small id={`join-error-${field}`} className={styles.error}>{state.errors[field]}</small>}</div>)}
        <div><label htmlFor="join-kind">Organisation type</label><select id="join-kind" className="form-control" required value={state.form.kind} onChange={state.set("kind")} aria-invalid={Boolean(state.errors.kind)} aria-describedby={state.errors.kind ? "join-error-kind" : undefined}><option value="">Select a type</option>{PROVIDER_APPLICATION_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{state.errors.kind && <small id="join-error-kind" className={styles.error}>{state.errors.kind}</small>}</div>
        <div className={styles.full}><label htmlFor="join-explanation">Message (optional)</label><textarea id="join-explanation" className="form-control" rows={3} maxLength={1000} value={state.form.explanation} onChange={state.set("explanation")} /></div>
        </div><button type="submit" className="btn btn-primary" disabled={state.busy}>{state.busy ? "Submitting…" : state.error ? "Retry Application" : "Submit Application"}</button>
        </>}
      </form></div></div></section>;
}
