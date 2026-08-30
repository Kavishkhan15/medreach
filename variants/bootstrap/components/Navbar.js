"use client";
import Link from "next/link";
import { useAuth } from "@medreach/core";

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  return (
    <nav className="navbar navbar-expand-md app-navbar sticky-top" aria-label="Primary">
      <div className="container">
        <Link className="navbar-brand" href="/">🏥 MedReach</Link>
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav"
          aria-controls="nav" aria-expanded="false" aria-label="Toggle navigation">
          <span className="navbar-toggler-icon" />
        </button>
        <div className="collapse navbar-collapse" id="nav">
          <ul className="navbar-nav ms-auto align-items-md-center gap-1">
            <li className="nav-item"><Link className="nav-link" href="/emergency">Emergency</Link></li>
            <li className="nav-item"><Link className="nav-link" href="/hospitals">Hospitals</Link></li>
            <li className="nav-item"><Link className="nav-link" href="/map">Map</Link></li>
            {isAdmin && <li className="nav-item"><Link className="nav-link" href="/admin">Admin</Link></li>}
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
