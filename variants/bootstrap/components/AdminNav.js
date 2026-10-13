"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@medreach/core";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/provider-approvals", label: "Provider Approvals" },
  { href: "/admin/provider-accounts", label: "Provider Accounts" },
  { href: "/admin/emergency", label: "Emergency Requests" },
  { href: "/admin/hospitals", label: "Hospitals" },
  { href: "/admin/alerts", label: "Alerts" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/security", label: "Security & auth" },
  { href: "/admin/operations", label: "Activity & Settings" },
];

export default function AdminNav() {
  const path = usePathname();
  const { user } = useAuth();
  if (user?.role !== "system_admin") return null;
  return (
    <nav aria-label="Admin sections" className="mb-4">
      <ul className="nav nav-pills flex-wrap gap-1">
        {LINKS.map((l) => (
          <li className="nav-item" key={l.href}>
            <Link className={`nav-link ${path === l.href ? "active" : ""}`} href={l.href}
              aria-current={path === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
