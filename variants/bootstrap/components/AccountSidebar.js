"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@medreach/core";
import LogoutButton from "./LogoutButton";
import AdminOverviewIcon from "./AdminOverviewIcon";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "document" },
  { href: "/profile", label: "Profile", icon: "user" },
];

export default function AccountSidebar() {
  const { user, isAdmin } = useAuth();
  const pathname = usePathname();

  const roleItems = user ? [
    ...(["provider_admin", "hospital_admin"].includes(user.role) ? [{ href: "/provider", label: "Provider", icon: "hospital" }] : []),
    ...(isAdmin && user.role === "system_admin" ? [{ href: "/admin", label: "Admin", icon: "shield" }, { href: "/admin/system-admins", label: "System Admins", icon: "users" }] : []),
  ] : [];

  const renderItem = ({ href, label, icon }) => {
    const active = (pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`)))
      && !(href === "/admin" && pathname?.startsWith("/admin/system-admins"));
    return (
      <li key={href}>
        <Link
          className={`account-sidebar-item${active ? " account-sidebar-item--active" : ""}`}
          href={href}
          aria-current={active ? "page" : undefined}
        >
          <AdminOverviewIcon name={href === "/dashboard" ? "grid" : href === "/admin" ? "settings" : icon} size={20} />
          <span>{label}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav className="account-sidebar" aria-label="Account">
      <ul className="account-sidebar-list">
        {ITEMS.map(renderItem)}
        {roleItems.length > 0 && <li aria-hidden="true"><hr className="account-sidebar-divider" /></li>}
        {roleItems.map(renderItem)}
        {user && (
          <li>
            <LogoutButton className="account-sidebar-item account-sidebar-logout">
              <AdminOverviewIcon name="logout" size={20} />
              <span>Log out</span>
            </LogoutButton>
          </li>
        )}
      </ul>
    </nav>
  );
}

