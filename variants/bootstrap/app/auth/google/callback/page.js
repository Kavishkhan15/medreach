"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { me, profileDestination, safeReturnTo } from "@medreach/core";

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
    let active = true;
    const value = new URLSearchParams(window.location.search).get("status") || "provider_error";
    const candidate = new URLSearchParams(window.location.search).get("returnTo");
    const returnTo = safeReturnTo(candidate, "/dashboard");
    if (value === "success") {
      window.dispatchEvent(new Event("medreach:auth-changed"));
      setStatus("Google sign-in complete. Redirecting…");
      me()
        .then((account) => {
          if (!active) return;
          router.replace(profileDestination(account.user, returnTo));
        })
        .catch((error) => active && setStatus(error.message || "Google sign-in completed, but the account could not be loaded."));
    } else if (value === "linked") {
      window.dispatchEvent(new Event("medreach:auth-changed"));
      setStatus("Google sign-in is now linked to your account. Redirecting…");
      router.replace("/profile?provider=linked");
    } else setStatus(messages[value] || messages.provider_error);
    return () => { active = false; };
  }, [router]);
  return <div className="row justify-content-center"><div className="col-md-7"><div className="surface">
    <h1 className="h3">Google sign-in</h1><p role="status">{status}</p><Link href="/login">Return to sign in</Link>
  </div></div></div>;
}
