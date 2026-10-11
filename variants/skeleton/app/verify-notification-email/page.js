"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAdminAction, adminAcknowledgement } from "@medreach/core";
import AdminActionFeedback from "../../components/AdminActionFeedback";
import { post } from "../../lib/productApi";
function VerifyContact() {
 const params = useSearchParams(), action = useAdminAction();
 return <section className="surface mb-3"><h1>Verify notification email</h1><p>Confirm that this address may receive the notifications configured by your System Admin.</p><AdminActionFeedback action={action} /><button className="button button-primary" disabled={action.disabled} onClick={() => action.run(() => post("/api/auth/verify-notification-email", { token: params.get("token") }), { validate: adminAcknowledgement, success: "Notification email verified." })}>Verify notification address</button></section>;
}
export default function VerifyNotificationPage() { return <Suspense fallback={<p role="status">Loading verification…</p>}><VerifyContact /></Suspense>; }
