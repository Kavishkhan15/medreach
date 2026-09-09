"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useAuth } from "@medreach/core";

const navLink =
  "block text-[var(--color-text)] font-semibold rounded-full px-[.8rem] py-1 hover:text-[var(--color-emergency)] hover:bg-[#fdecee]";

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <nav className="sticky top-0 z-30 bg-[var(--color-surface)] border-b border-[var(--color-border)] shadow-[var(--shadow-sm)]" aria-label="Primary">
      <div className="mx-auto w-full max-w-[1140px] px-3 flex flex-wrap items-center py-2">
        <Link className="mr-auto" href="/">
          <Image src="/logo.png" alt="MedReach" width={145} height={39} priority />
        </Link>
        <button
          className="md:hidden inline-flex items-center rounded border border-[var(--color-border)] p-2"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-controls="nav"
          aria-expanded={open}
          aria-label="Toggle navigation"
        >
          <span className="block w-5 h-[2px] bg-current relative before:content-[''] before:absolute before:-top-1.5 before:left-0 before:w-5 before:h-[2px] before:bg-current after:content-[''] after:absolute after:top-1.5 after:left-0 after:w-5 after:h-[2px] after:bg-current" />
        </button>
        <div className={`${open ? "block" : "hidden"} md:block w-full md:w-auto`} id="nav">
          <ul className="flex flex-col md:flex-row md:items-center gap-1 md:ml-auto mt-2 md:mt-0">
            <li><Link className={navLink} href="/emergency">Emergency</Link></li>
            <li><Link className={navLink} href="/hospitals">Hospitals</Link></li>
            <li><Link className={navLink} href="/map">Map</Link></li>
            {isAdmin && <li><Link className={navLink} href="/admin">Admin</Link></li>}
            {user ? (
              <li className="md:ml-2">
                <button className="inline-flex items-center rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-semibold text-sm px-3 py-1 hover:bg-[#f1f3f5]" onClick={logout}>
                  Logout ({user.name.split(" ")[0]})
                </button>
              </li>
            ) : (
              <li className="md:ml-2">
                <Link className="inline-flex items-center rounded-[var(--radius)] bg-[var(--color-emergency)] text-white font-bold text-sm px-3 py-1 hover:bg-[var(--color-emergency-dark)] no-underline" href="/login">Login</Link>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
