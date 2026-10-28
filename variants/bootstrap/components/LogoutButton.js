"use client";
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@medreach/core";
import AdminOverviewIcon from "./AdminOverviewIcon";

export default function LogoutButton({ className, children }) {
  const { logout } = useAuth();
  const router = useRouter();
  const dialog = useRef(null);
  const cancelButton = useRef(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();

  const open = () => {
    setError("");
    dialog.current.showModal();
    cancelButton.current.focus();
  };
  const confirm = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await logout();
      dialog.current?.close();
      window.dispatchEvent(new Event("medreach:auth-changed"));
      router.push("/login");
    } catch {
      setError("Could not log out. Please try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return <>
    <button className={className} type="button" onClick={open}>{children}</button>
    <dialog ref={dialog} className="account-logout-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={busy}
      onCancel={(event) => { if (pending.current) event.preventDefault(); }}>
      <span className="account-logout-icon"><AdminOverviewIcon name="logout" size={26} /></span>
      <h2 id={`${id}-title`}>Log out of MedReach?</h2>
      <p id={`${id}-description`}>You will need to sign in again to access your account.</p>
      {error && <p className="account-logout-error" role="alert">{error}</p>}
      <div className="account-logout-actions">
        <button ref={cancelButton} type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => dialog.current.close()}>Stay signed in</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={confirm}>{busy ? "Logging out…" : "Log out"}</button>
      </div>
    </dialog>
  </>;
}
