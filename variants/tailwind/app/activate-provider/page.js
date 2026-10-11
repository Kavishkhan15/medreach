"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useAdminAction, adminAcknowledgement } from "@medreach/core";
import AdminActionFeedback from "../../components/AdminActionFeedback";
import { post } from "../../lib/productApi";
function ActivationForm() {
  const params = useSearchParams(), action = useAdminAction();
  const [password, setPassword] = useState("");
  return <section className="surface mb-4 p-4"><h1>Activate provider account</h1><p>Set your personal password. The login email is the address supplied by your System Admin.</p><AdminActionFeedback action={action} /><form onSubmit={(e) => { e.preventDefault(); action.run(() => post("/api/auth/activate-provider", { token: params.get("token"), password }), { validate: adminAcknowledgement, success: "Activation confirmed. Sign in with your login email." }); }}><label htmlFor="activation-password">Personal password</label><input id="activation-password" className="w-full rounded border border-[var(--color-border)] p-2" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} /><p>Use 12–128 characters with upper and lower case letters and a number.</p><button className="rounded bg-[var(--color-primary)] px-4 py-2 text-white" disabled={action.disabled}>Activate account</button></form><Link href="/login">Sign in</Link></section>;
}
export default function ActivateProviderPage() { return <Suspense fallback={<p role="status">Loading activation…</p>}><ActivationForm /></Suspense>; }
