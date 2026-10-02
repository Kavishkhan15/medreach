"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useAuth } from "@medreach/core";

const navLink =
  "block text-[var(--color-text)] font-semibold rounded-full px-2.5 py-1 text-sm xl:text-base hover:text-[var(--color-emergency)] hover:bg-[#fdecee] whitespace-nowrap transition-colors";

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-30 bg-[var(--color-surface)] border-b border-[var(--color-border)] shadow-[var(--shadow-sm)]" aria-label="Primary">
      <div className="mx-auto w-full max-w-[1240px] px-3 flex flex-wrap items-center justify-between py-2">
        <Link className="mr-auto xl:mr-4 shrink-0" href="/" onClick={() => setOpen(false)}>
          <Image src="/logo.png" alt="MedReach" width={145} height={39} priority />
        </Link>
        <button
          className="xl:hidden inline-flex items-center justify-center rounded border border-[var(--color-border)] p-2 text-[var(--color-text)] hover:bg-[#f1f3f5]"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-controls="nav"
          aria-expanded={open}
          aria-label="Toggle navigation"
        >
          <span className="block w-5 h-[2px] bg-current relative before:content-[''] before:absolute before:-top-1.5 before:left-0 before:w-5 before:h-[2px] before:bg-current after:content-[''] after:absolute after:top-1.5 after:left-0 after:w-5 after:h-[2px] after:bg-current" />
        </button>
        <div className={`${open ? "block" : "hidden"} xl:block w-full xl:w-auto mt-2 xl:mt-0`} id="nav">
          <ul className="flex flex-col xl:flex-row xl:items-center gap-1 xl:ml-auto">
            <li><Link className={navLink} href="/hospitals" onClick={() => setOpen(false)}>Hospitals</Link></li>
            <li><Link className={navLink} href="/emergency" onClick={() => setOpen(false)}>Emergency</Link></li>
            <li><Link className={navLink} href="/blood-banks" onClick={() => setOpen(false)}>Blood Banks</Link></li>
            <li><Link className={navLink} href="/diagnostics" onClick={() => setOpen(false)}>Diagnostics</Link></li>
            <li><Link className={navLink} href="/ambulances" onClick={() => setOpen(false)}>Ambulances</Link></li>
            <li><Link className={navLink} href="/careers" onClick={() => setOpen(false)}>Careers</Link></li>
            <li><Link className={navLink} href="/track" onClick={() => setOpen(false)}>Track request</Link></li>
            <li><Link className={navLink} href="/about" onClick={() => setOpen(false)}>About</Link></li>
            {user && <li><Link className={navLink} href="/dashboard" onClick={() => setOpen(false)}>Dashboard</Link></li>}
            {user && <li><Link className={navLink} href="/profile" onClick={() => setOpen(false)}>Profile</Link></li>}
            {user?.role === "hospital_admin" && <li><Link className={navLink} href="/hospital" onClick={() => setOpen(false)}>Hospital</Link></li>}
            {isAdmin && user?.role !== "hospital_admin" && <li><Link className={navLink} href="/admin" onClick={() => setOpen(false)}>Admin</Link></li>}
            {user ? (
              <li className="xl:ml-2 mt-1 xl:mt-0">
                <button
                  className="inline-flex items-center rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-semibold text-sm px-3 py-1 hover:bg-[#f1f3f5] transition-colors"
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                >
                  Logout ({user.name.split(" ")[0]})
                </button>
              </li>
            ) : (
              <li className="xl:ml-2 mt-1 xl:mt-0">
                <Link
                  className="inline-flex items-center rounded-[var(--radius)] bg-[var(--color-emergency)] text-white font-bold text-sm px-3 py-1 hover:bg-[var(--color-emergency-dark)] no-underline transition-colors"
                  href="/login"
                  onClick={() => setOpen(false)}
                >
                  Login
                </Link>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
