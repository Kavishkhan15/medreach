"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@medreach/core";
import AdminOverviewIcon from "./AdminOverviewIcon";

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
];
const ICONS = ["home", "approval", "users", "siren", "hospital", "bell", "document", "users", "shield"];

export default function AdminNav() {
  const path = usePathname();
  const { user } = useAuth();
  if (user?.role !== "system_admin") return null;
  return (
    <nav aria-label="Admin sections" className="admin-section-nav">
      <ul className="admin-section-list">
        {LINKS.map((l, index) => (
          <li key={l.href}>
            <Link className={`admin-section-link ${path === l.href ? "active" : ""}`} href={l.href}
              aria-current={path === l.href ? "page" : undefined}>
              <AdminOverviewIcon name={ICONS[index]} size={20} />
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
