"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@medreach/core";
import { useEffect, useRef, useState } from "react";
import EmergencyIcon from "./EmergencyIcons";
import LogoutButton from "./LogoutButton";

const LEFT_LINKS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/hospitals", label: "Hospitals", icon: "hospital" },
  { href: "/emergency", label: "Emergency", icon: "siren" },
  { href: "/blood-banks", label: "Blood Banks", icon: "blood" },
];
const RIGHT_LINKS = [
  { href: "/diagnostics", label: "Diagnostics", icon: "diagnostic" },
  { href: "/ambulances", label: "Ambulances", icon: "ambulance" },
  { href: "/careers", label: "Careers", icon: "briefcase" },
  { href: "/track", label: "Track Request", icon: "document" },
];

function NavIcon({ name }) {
  if (name === "diagnostic") return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3H4v6a5 5 0 0 0 10 0V3h-2M6 2v3m6-3v3M9 14v2a5 5 0 0 0 10 0v-2" /><circle cx="19" cy="11" r="3" /></svg>;
  return <EmergencyIcon name={name} size={28} />;
}

export default function Navbar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef(null);
  const profileRef = useRef(null);
  const previousUser = useRef(user);

  useEffect(() => {
    const closeOutside = (event) => {
      if (document.querySelector(".account-logout-dialog[open]")) return;
      if (profileRef.current && !profileRef.current.contains(event.target)) profileRef.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (document.querySelector(".account-logout-dialog[open]")) return;
      if (event.key === "Escape" && profileRef.current?.open) {
        event.stopPropagation();
        profileRef.current.open = false;
        profileRef.current.querySelector("summary")?.focus();
        return;
      }
      if (event.key === "Escape" && open) { event.stopPropagation();
        setOpen(false); toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [open]);

  useEffect(() => {
    if (previousUser.current && !user) setOpen(false);
    previousUser.current = user;
  }, [user]);

  const closeNavigation = () => {
    setOpen(false);
    if (profileRef.current) profileRef.current.open = false;
  };
  const renderLink = ({ href, label, icon }) => {
    const active = pathname === href || href !== "/" && pathname?.startsWith(`${href}/`);
    return <li className="nav-item" key={href}><Link className={`nav-link${active ? " active" : ""}`} href={href} aria-label={href === "/track" ? "Track request" : undefined} aria-current={active ? "page" : undefined} onClick={closeNavigation}><NavIcon name={icon} /><span>{label}</span></Link></li>;
  };

  return (
    <nav className="navbar navbar-expand-xxl app-navbar sticky-top" aria-label="Primary">
      <div className="medreach-nav-shell">
        <Link className="navbar-brand" href="/" onClick={closeNavigation}>
          <Image src="/logo.png" alt="MedReach" width={80} height={80} priority sizes="80px" />
        </Link>
        <button ref={toggleRef} className="navbar-toggler" type="button" onClick={() => setOpen(!open)}
          aria-controls="primary-navigation-links" aria-expanded={open} aria-label="Toggle navigation">
          <span className="navbar-toggler-icon" />
        </button>
        <div className={`collapse navbar-collapse ${open ? "show" : ""}`} id="primary-navigation-links">
          <ul className="navbar-nav medreach-nav-left">{LEFT_LINKS.map(renderLink)}</ul>
          <ul className="navbar-nav medreach-nav-right">
            {RIGHT_LINKS.map(renderLink)}
            {user ? (
              <li className="nav-item medreach-profile-item">
                <details ref={profileRef} className="medreach-profile">
                  <summary className={`nav-link nav-profile${pathname?.startsWith("/profile") ? " active" : ""}`}>
                    <span className="nav-avatar"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2Z" /></svg></span>
                    <span className="nav-profile-name" title={user.name}>Profile ({user.name?.trim().split(/\s+/)[0] || "Account"})</span>
                    <svg className="nav-profile-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                  </summary>
                  <ul className="medreach-profile-links" aria-label="Your account">
                    <li><Link href="/dashboard" onClick={closeNavigation}>Dashboard</Link></li>
                    <li><Link href="/profile" onClick={closeNavigation}>Profile &amp; security</Link></li>
                    {user.role === "system_admin" && <li><Link href="/admin" onClick={closeNavigation}>Admin workspace</Link></li>}
                    {["provider_admin", "hospital_admin"].includes(user.role) && <li><Link href="/provider" onClick={closeNavigation}>Provider workspace</Link></li>}
                    <li className="nav-account-signout"><LogoutButton className="nav-account-logout">Log out</LogoutButton></li>
                  </ul>
                </details>
              </li>
            ) : (
              <li className="nav-item"><Link className="btn btn-sm btn-primary nav-login" href="/login" onClick={closeNavigation}><EmergencyIcon name="user" size={24} /><span>Login</span></Link></li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
