"use client";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@medreach/core";

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  return (
    <nav className="app-navbar" aria-label="Primary">
      <div className="container navbar-inner">
        <Link className="navbar-brand" href="/">
          <Image src="/logo.png" alt="MedReach" width={145} height={39} priority />
        </Link>
        <ul className="nav-list">
          <li className="nav-item"><Link className="nav-link" href="/emergency">Emergency</Link></li>
          <li className="nav-item"><Link className="nav-link" href="/hospitals">Hospitals</Link></li>
          <li className="nav-item"><Link className="nav-link" href="/map">Map</Link></li>
          {isAdmin && <li className="nav-item"><Link className="nav-link" href="/admin">Admin</Link></li>}
          {user ? (
            <li className="nav-item">
              <button className="btn btn-sm btn-outline-secondary" onClick={logout}>
                Logout ({user.name.split(" ")[0]})
              </button>
            </li>
          ) : (
            <li className="nav-item"><Link className="btn btn-sm btn-primary" href="/login">Login</Link></li>
          )}
        </ul>
      </div>
    </nav>
  );
}
