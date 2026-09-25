"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const messages = {
  denied: "Google sign-in was cancelled.", invalid_state: "This sign-in request is invalid or has already been used.",
  provider_error: "Google sign-in could not be completed. Please try again.",
  email_exists: "An account already uses this email. Sign in with its password, then link Google from Profile & security.",
  account_unavailable: "This account is unavailable. Contact a system administrator.",
  link_session_expired: "Your linking session expired. Sign in and try again.",
  link_email_mismatch: "Use the Google account with the same verified email as your MedReach account.",
  identity_in_use: "That Google identity is already linked to another account.",
};

export default function GoogleCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Checking Google sign-in…");
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("status") || "provider_error";
    if (value === "success") {
      window.dispatchEvent(new Event("medreach:auth-changed"));
      setStatus("Google sign-in complete. Redirecting…");
      router.replace("/dashboard");
    } else if (value === "linked") {
      window.dispatchEvent(new Event("medreach:auth-changed"));
      setStatus("Google sign-in is now linked to your account. Redirecting…");
      router.replace("/profile?provider=linked");
    } else setStatus(messages[value] || messages.provider_error);
  }, [router]);
  return <div className="flex justify-center"><div className="w-full max-w-lg"><div className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-6">
    <h1 className="text-xl font-bold mb-3">Google sign-in</h1><p role="status">{status}</p><Link href="/login" className="text-[var(--color-emergency)]">Return to sign in</Link>
  </div></div></div>;
}
