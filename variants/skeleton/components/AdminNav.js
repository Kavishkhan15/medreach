"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@medreach/core";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/provider-accounts", label: "Provider Accounts" },
  { href: "/admin/provider-approvals", label: "Provider approvals" },
  { href: "/admin/hospitals", label: "Hospitals" },
  { href: "/admin/verification", label: "Verification" },
  { href: "/admin/alerts", label: "Alerts" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/security", label: "Security & auth" },
  { href: "/admin/operations", label: "Operations" },
];

export default function AdminNav() {
  const path = usePathname();
  const { user } = useAuth();
  if (user?.role !== "system_admin") return null;
  return (
    <nav aria-label="Admin sections" className="admin-nav mb-4">
      <ul className="nav-list" style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", listStyle: "none", padding: 0 }}>
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              className={`btn btn-sm ${path === l.href ? "btn-primary" : "btn-outline-secondary"}`}
              href={l.href}
              aria-current={path === l.href ? "page" : undefined}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
