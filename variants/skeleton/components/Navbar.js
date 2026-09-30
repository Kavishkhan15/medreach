"use client";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@medreach/core";
import { useState } from "react";

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <nav className="app-navbar" aria-label="Primary">
      <div className="container navbar-inner">
        <Link className="navbar-brand" href="/" onClick={() => setOpen(false)}>
          <Image src="/logo.png" alt="MedReach" width={145} height={39} priority />
        </Link>
        <button
          className="btn btn-sm btn-outline-secondary navbar-toggler"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-controls="nav"
          aria-expanded={open}
          aria-label="Toggle navigation"
        >
          ☰
        </button>
        <ul className={`nav-list ${open ? "is-open" : ""}`} id="nav">
          <li className="nav-item"><Link className="nav-link" href="/hospitals" onClick={() => setOpen(false)}>Hospitals</Link></li>
          <li className="nav-item"><Link className="nav-link" href="/emergency" onClick={() => setOpen(false)}>Emergency</Link></li>
          <li className="nav-item"><Link className="nav-link" href="/blood-banks" onClick={() => setOpen(false)}>Blood Banks</Link></li>
          <li className="nav-item"><Link className="nav-link" href="/diagnostics" onClick={() => setOpen(false)}>Diagnostics</Link></li>
          <li className="nav-item"><Link className="nav-link" href="/ambulances" onClick={() => setOpen(false)}>Ambulances</Link></li>
          <li className="nav-item"><Link className="nav-link" href="/careers" onClick={() => setOpen(false)}>Careers</Link></li>
          <li className="nav-item"><Link className="nav-link" href="/track" onClick={() => setOpen(false)}>Track request</Link></li>
          <li className="nav-item"><Link className="nav-link" href="/map" onClick={() => setOpen(false)}>Map</Link></li>
          <li className="nav-item"><Link className="nav-link" href="/about" onClick={() => setOpen(false)}>About</Link></li>
          {user && <li className="nav-item"><Link className="nav-link" href="/dashboard" onClick={() => setOpen(false)}>Dashboard</Link></li>}
          {user && <li className="nav-item"><Link className="nav-link" href="/profile" onClick={() => setOpen(false)}>Profile</Link></li>}
          {user?.role === "hospital_admin" && <li className="nav-item"><Link className="nav-link" href="/hospital" onClick={() => setOpen(false)}>Hospital</Link></li>}
          {isAdmin && user?.role !== "hospital_admin" && <li className="nav-item"><Link className="nav-link" href="/admin" onClick={() => setOpen(false)}>Admin</Link></li>}
          {user ? (
            <li className="nav-item">
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
              >
                Logout ({user.name.split(" ")[0]})
              </button>
            </li>
          ) : (
            <li className="nav-item">
              <Link className="btn btn-sm btn-primary" href="/login" onClick={() => setOpen(false)}>
                Login
              </Link>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}
