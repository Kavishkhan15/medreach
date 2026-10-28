"use client";
import { usePathname } from "next/navigation";
import { breadcrumbItems } from "../lib/seo.js";

export default function PublicBreadcrumbs() {
  const items = breadcrumbItems(usePathname() || "/");
  if (!items) return null;
  const schema = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, ...item })) };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />;
}
