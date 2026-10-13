import { useRef, useState } from "react";
export const PROVIDER_APPLICATION_KINDS = [
  ["hospital", "Hospital"], ["blood_bank", "Blood bank"],
  ["diagnostic", "Diagnostic centre"], ["ambulance", "Ambulance service"],
];
export function validateProviderApplication(form) {
  const errors = {};
  for (const [field, min, max] of [["name", 2, 180], ["contactName", 2, 120], ["address", 3, 300], ["city", 2, 100]]) {
    if (typeof form[field] !== "string" || form[field].trim().length < min || form[field].trim().length > max) errors[field] = `Enter between ${min} and ${max} characters.`;
  }
  if (!PROVIDER_APPLICATION_KINDS.some(([kind]) => kind === form.kind)) errors.kind = "Choose an organisation type.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) errors.contactEmail = "Enter a valid contact email.";
  if (!/^[+\d\s().-]{7,40}$/.test(form.phone.trim())) errors.phone = "Enter a valid phone number.";
  if (form.explanation.length > 1000) errors.explanation = "Use at most 1,000 characters.";
  return errors;
}
export function useProviderApplication(submitApplication) {
  const [form, setForm] = useState({ name: "", kind: "", contactName: "", contactEmail: "", phone: "", address: "", city: "", explanation: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const lock = useRef(false);
  const submit = async (event) => {
    event.preventDefault();
    if (lock.current || message) return;
    const validation = validateProviderApplication(form); setErrors(validation); setError("");
    if (Object.keys(validation).length) return;
    lock.current = true; setBusy(true);
    try {
      const result = await submitApplication(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])));
      if (result?.ok !== true) throw new Error("Submission could not be confirmed. Retry with the same details.");
      setMessage(result.message || "Application recorded for review. Submission does not grant login access.");
    } catch (failure) { setError(failure.message || "We could not confirm your application. Retry with the same details."); }
    finally { lock.current = false; setBusy(false); }
  };
  return { form, errors, busy, message, error, submit, set: (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value })) };
}

export const providerRequestActions = (kind, status) => ({
  blood: { REQUESTED: ["CONFIRMED", "REJECTED", "CANCELLED"], CONFIRMED: ["COMPLETED", "CANCELLED"] },
  ambulance: { RECORDED: ["UNDER_REVIEW", "CONFIRMED", "REJECTED", "CANCELLED"], UNDER_REVIEW: ["CONFIRMED", "REJECTED", "CANCELLED"], CONFIRMED: ["DISPATCHED", "CANCELLED"], DISPATCHED: ["COMPLETED"] },
}[kind]?.[status] || []);
