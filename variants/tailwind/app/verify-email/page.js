"use client";
import { useEffect, useRef, useState } from "react";
import { post } from "../../lib/productApi";
export default function VerifyEmail() {
  const [message, setMessage] = useState("Checking verification link…");
  const submitted = useRef(false);
  useEffect(() => { if (submitted.current) return; submitted.current = true;
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setMessage("Verification link missing."); return; }
    post("/api/auth/verify-email", { token }).then(() => setMessage("Email verified. You can continue using MedReach.")).catch((e) => setMessage(e.message));
  }, []);
  return <div className="bg-white rounded-lg border border-[var(--color-border)] shadow-sm p-6"><h1 className="text-xl font-bold mb-3">Email verification</h1><p role="status">{message}</p></div>;
}
