"use client";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@medreach/core";
import { useState } from "react";

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <nav className="navbar navbar-expand-xl app-navbar sticky-top" aria-label="Primary">
      <div className="container">
        <Link className="navbar-brand" href="/">
          <Image src="/logo.png" alt="MedReach" width={145} height={39} priority />
        </Link>
        <button className="navbar-toggler" type="button" onClick={() => setOpen(!open)}
          aria-controls="nav" aria-expanded={open} aria-label="Toggle navigation">
          <span className="navbar-toggler-icon" />
        </button>
        <div className={`collapse navbar-collapse ${open ? "show" : ""}`} id="nav">
          <ul className="navbar-nav ms-auto align-items-xl-center gap-1">
            <li className="nav-item"><Link className="nav-link" href="/hospitals" onClick={() => setOpen(false)}>Hospitals</Link></li>
            <li className="nav-item"><Link className="nav-link" href="/emergency" onClick={() => setOpen(false)}>Emergency</Link></li>
            <li className="nav-item"><Link className="nav-link" href="/blood-banks" onClick={() => setOpen(false)}>Blood Banks</Link></li>
            <li className="nav-item"><Link className="nav-link" href="/diagnostics" onClick={() => setOpen(false)}>Diagnostics</Link></li>
            <li className="nav-item"><Link className="nav-link" href="/ambulances" onClick={() => setOpen(false)}>Ambulances</Link></li>
            <li className="nav-item"><Link className="nav-link" href="/careers" onClick={() => setOpen(false)}>Careers</Link></li>
            <li className="nav-item"><Link className="nav-link" href="/map" onClick={() => setOpen(false)}>Map</Link></li>
            <li className="nav-item"><Link className="nav-link" href="/about" onClick={() => setOpen(false)}>About</Link></li>
            {user && <li className="nav-item"><Link className="nav-link" href="/dashboard" onClick={() => setOpen(false)}>Dashboard</Link></li>}
            {user?.role === "hospital_admin" && <li className="nav-item"><Link className="nav-link" href="/hospital" onClick={() => setOpen(false)}>Hospital</Link></li>}
            {isAdmin && user?.role !== "hospital_admin" && <li className="nav-item"><Link className="nav-link" href="/admin" onClick={() => setOpen(false)}>Admin</Link></li>}
            {user ? (
              <li className="nav-item ms-md-2">
                <button className="btn btn-sm btn-outline-secondary" onClick={logout}>
                  Logout ({user.name.split(" ")[0]})
                </button>
              </li>
            ) : (
              <li className="nav-item ms-md-2"><Link className="btn btn-sm btn-primary" href="/login">Login</Link></li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
