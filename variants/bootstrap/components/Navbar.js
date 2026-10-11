"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@medreach/core";
import { useEffect, useRef, useState } from "react";
import EmergencyIcon from "./EmergencyIcons";

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
  { href: "/track", label: "Track request", icon: "document" },
];
export default function Navbar() {
  const { user } = useAuth();
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
    const updateLoginVisibility = () => {
      const currentY = Math.max(0, window.scrollY);
      if (currentY <= 24) setLoginHidden(false);
      else if (currentY !== previousY) setLoginHidden(currentY > previousY);
      previousY = currentY;
    };
    window.addEventListener("scroll", updateLoginVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateLoginVisibility);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const renderLink = ({ href, label, icon }) => {
    const active = pathname === href || href !== "/" && pathname?.startsWith(`${href}/`);
    return <li className="nav-item" key={href}><Link className={`nav-link${active ? " active" : ""}`} href={href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}><EmergencyIcon name={icon} size={22} /><span>{label}</span></Link></li>;
  };

  return (
    <nav className={`navbar navbar-expand-xxl app-navbar sticky-top${scrolled ? " is-scrolled" : ""}`} aria-label="Primary">
      <div className="medreach-nav-shell">
        <Link className="navbar-brand" href="/" onClick={() => setOpen(false)}>
          <Image src="/logo.png" alt="MedReach" width={128} height={128} priority />
        </Link>
        <button ref={toggleRef} className="navbar-toggler" type="button" onClick={() => setOpen(!open)}
          aria-controls="nav" aria-expanded={open} aria-label="Toggle navigation">
          <span className="navbar-toggler-icon" />
        </button>
        <div className={`collapse navbar-collapse ${open ? "show" : ""}`} id="nav">
          <ul className="navbar-nav medreach-nav-left">{LEFT_LINKS.map(renderLink)}</ul>
          <ul className="navbar-nav medreach-nav-right">
            {RIGHT_LINKS.map(renderLink)}
            {user ? (
              <li className="nav-item">
                <Link
                  className={`nav-link nav-profile${pathname?.startsWith("/profile") ? " active" : ""}`}
                  href="/profile"
                  aria-current={pathname?.startsWith("/profile") ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <EmergencyIcon name="user" size={22} />
                  <span>Profile ({user.name.split(" ")[0]})</span>
                </Link>
              </li>
            ) : (
              <li className="nav-item"><Link className={`btn btn-sm btn-primary nav-login${pathname === "/" && loginHidden ? " is-scroll-hidden" : ""}`} href="/login" onClick={() => setOpen(false)}><EmergencyIcon name="user" size={22} /><span>Login</span></Link></li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
