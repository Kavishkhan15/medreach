"use client";
import { usePathname } from "next/navigation";
import { useAuth } from "@medreach/core";
import AccountSidebar from "./AccountSidebar";

const ACCOUNT_ROUTES = ["/profile", "/dashboard", "/admin", "/hospital"];

export default function AccountChrome({ children }) {
  const { user } = useAuth();
  const pathname = usePathname();

  const inAccount = ACCOUNT_ROUTES.some((r) => pathname === r || pathname?.startsWith(`${r}/`));

  if (inAccount) {
    return (
      <div className="account-shell">
        <AccountSidebar />
        <div className="account-content">{children}</div>
      </div>
    );
  }

  return children;
}
