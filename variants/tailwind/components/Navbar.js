"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@medreach/core";
import { useEffect, useRef, useState } from "react";
import EmergencyIcon from "./EmergencyIcons";

const LEFT = [
  ["/", "Home", "home"], ["/hospitals", "Hospitals", "hospital"],
  ["/emergency", "Emergency", "siren"], ["/blood-banks", "Blood Banks", "blood"],
];
const RIGHT = [
  ["/diagnostics", "Diagnostics", "diagnostic"], ["/ambulances", "Ambulances", "ambulance"],
  ["/careers", "Careers", "briefcase"], ["/track", "Track request", "document"],
];

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loginHidden, setLoginHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      const y = Math.max(0, window.scrollY);
      setScrolled(y > 20);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setLoginHidden(false);
    if (pathname !== "/") return;
    let previousY = Math.max(0, window.scrollY);
    const update = () => {
      const currentY = Math.max(0, window.scrollY);
      if (currentY <= 24) setLoginHidden(false);
      else if (currentY !== previousY) setLoginHidden(currentY > previousY);
      previousY = currentY;
    };
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (event.key === "Escape") { setOpen(false); toggleRef.current?.focus(); }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);

  const navLink = ([href, label, icon]) => {
    const active = pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`));
    return <li key={href}><Link href={href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)} className={`tw-nav-link ${active ? "tw-nav-active" : ""}`}><EmergencyIcon name={icon} size={20} /><span>{label}</span></Link></li>;
  };

  return <nav className={`tw-navbar sticky top-0 z-30 bg-white px-2 py-2 sm:px-4${scrolled ? " is-scrolled" : ""}`} aria-label="Primary">
    <div className="tw-nav-shell">
      <Link href="/" className="tw-nav-brand" onClick={() => setOpen(false)}><Image src="/logo.png" alt="MedReach" width={128} height={128} priority /></Link>
      <button ref={toggleRef} type="button" className="tw-nav-toggle" aria-controls="nav" aria-expanded={open} aria-label="Toggle navigation" onClick={() => setOpen((value) => !value)}><span className="tw-nav-toggle-lines" /></button>
      <div id="nav" className={`tw-nav-panel ${open ? "is-open" : ""}`}>
        <ul className="tw-nav-left">{LEFT.map(navLink)}</ul>
        <ul className="tw-nav-right">{RIGHT.map(navLink)}
          {user ? <li><button type="button" className="tw-nav-logout" onClick={() => { setOpen(false); logout(); }}><EmergencyIcon name="user" size={20} /><span>Logout ({user.name.split(" ")[0]})</span></button></li>
            : <li><Link href="/login" onClick={() => setOpen(false)} className={`tw-nav-login ${pathname === "/" && loginHidden ? "is-scroll-hidden" : ""}`}><EmergencyIcon name="user" size={20} /><span>Login</span></Link></li>}
        </ul>
        {user && <ul className="tw-nav-account" aria-label="Your account">
          {navLink(["/dashboard", "Dashboard", "document"])}{navLink(["/profile", "Profile", "user"])}
          {["provider_admin", "hospital_admin"].includes(user.role) && navLink(["/provider", "Provider", "hospital"])}
          {isAdmin && user.role === "system_admin" && navLink(["/admin", "Admin", "shield"])}
        </ul>}
      </div>
    </div>
  </nav>;
}
