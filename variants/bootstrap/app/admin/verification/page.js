import { redirect } from "next/navigation";

// Keep historical links usable without displaying scraping verification controls.
export default function LegacyVerificationPage() { redirect("/admin/hospitals"); }
