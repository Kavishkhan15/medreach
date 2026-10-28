const configuredSite = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://medreachmumbai.vercel.app");
if (!["https:", "http:"].includes(configuredSite.protocol) || configuredSite.username || configuredSite.password) {
  throw new Error("NEXT_PUBLIC_SITE_URL must be an HTTP(S) site URL without credentials");
}
export const SITE_URL = configuredSite.origin;
export const absoluteUrl = (path = "/") => new URL(path, `${SITE_URL}/`).href;
export const siteImage = { url: "/brand-word-mark.png", width: 2172, height: 724, alt: "MedReach — healthcare discovery in Mumbai" };

export const PUBLIC_PAGES = Object.freeze({
  "/hospitals": { title: "Mumbai Hospitals Directory", description: "Explore hospital locations, reported facilities and contact details across Mumbai. Check observation freshness and confirm availability with the provider.", breadcrumb: "Hospitals" },
  "/emergency": { title: "Emergency Hospital Discovery in Mumbai", description: "Find hospital contacts and reported emergency facilities in Mumbai. Coordinate a request and confirm care directly with the hospital. In danger, call 112.", breadcrumb: "Emergency care" },
  "/blood-banks": { title: "Mumbai Blood Banks and Donation Directory", description: "Find Mumbai blood bank contacts, reported services and donation information. Confirm blood component availability and collection arrangements directly.", breadcrumb: "Blood banks" },
  "/urgent-blood": { title: "Urgent Blood Request Coordination in Mumbai", description: "Record an urgent blood request and keep its private tracking reference. Provider confirmation is required; submitting a request does not guarantee supply.", breadcrumb: "Urgent blood requests" },
  "/ambulances": { title: "Mumbai Ambulance Provider Directory", description: "Explore Mumbai ambulance providers and contact details, then record a transport request. Confirm vehicle availability and dispatch directly with the provider.", breadcrumb: "Ambulance providers" },
  "/diagnostics": { title: "Mumbai Diagnostic Centres and Laboratories", description: "Browse diagnostic centres and laboratories in Mumbai. Review listed services and contact the provider to confirm tests, appointments and current capacity.", breadcrumb: "Diagnostics" },
  "/careers": { title: "Healthcare Jobs and Careers in Mumbai", description: "Explore healthcare opportunities from Mumbai hospitals and providers. Review role requirements, submit an application and keep your application reference.", breadcrumb: "Healthcare careers" },
  "/map": { title: "Mumbai Healthcare Discovery Map", description: "Explore hospitals and healthcare providers on the Mumbai discovery map. Compare locations and contact providers to confirm services and availability.", breadcrumb: "Healthcare map" },
  "/track": { title: "Track a Healthcare Request", description: "Use your request reference and private access credentials to review healthcare coordination status. A recorded request is not a confirmed reservation.", breadcrumb: "Track a request" },
  "/login": { title: "Sign In to MedReach", description: "Sign in to your MedReach account to review your requests, saved hospitals and account security settings." },
  "/register": { title: "Create a MedReach Account", description: "Create a MedReach account to save healthcare listings and review your own requests. Complete email verification and account setup to continue." },
});

export const PRIVATE_PAGES = Object.freeze({
  "/dashboard": { title: "Your Dashboard", description: "Review your MedReach requests, applications and saved hospitals." },
  "/profile": { title: "Profile and Account Security", description: "Manage your MedReach profile, multifactor authentication, password and signed-in sessions." },
  "/requests": { title: "Your Healthcare Requests", description: "Review your own healthcare requests and their coordination status." },
  "/requests/new": { title: "New Hospital Bed Request", description: "Record a hospital bed coordination request. Provider confirmation is required." },
  "/provider": { title: "Provider Workspace", description: "Manage your assigned healthcare organisations, contacts and requests." },
  "/provider/inventory": { title: "Provider Inventory and CSV Imports", description: "Report observed inventory for your assigned organisation and review validated imports." },
  "/provider/jobs": { title: "Provider Jobs and Applicants", description: "Manage job listings and applicant reviews for your assigned provider organisation." },
  "/provider/register": { title: "Submit a Healthcare Provider", description: "Submit your healthcare organisation for MedReach administrator review." },
  "/hospital": { title: "Hospital Administration", description: "Review assigned hospital requests, contacts and facility evidence." },
  "/hospital/jobs": { title: "Hospital Jobs and Applicants", description: "Manage healthcare job opportunities and applications for your assigned hospital." },
  "/admin": { title: "System Administration", description: "Review MedReach platform administration and authorised operational information." },
  "/admin/provider-approvals": { title: "Provider Application Approvals", description: "Review healthcare provider applications and record authorised approval decisions." },
  "/admin/provider-accounts": { title: "Provider Account Administration", description: "Manage provider administrator accounts and organisation assignments securely." },
  "/admin/emergency": { title: "Healthcare Request Administration", description: "Review authorised healthcare requests and their coordination status." },
  "/admin/hospitals": { title: "Hospital Directory Administration", description: "Review hospital records and authorised hospital directory administration." },
  "/admin/alerts": { title: "Platform Alert Administration", description: "Manage operational notices for the MedReach platform." },
  "/admin/audit": { title: "Administrative Audit Log", description: "Review authorised, recorded administrative activity for the MedReach platform." },
  "/admin/users": { title: "User Account Administration", description: "Manage authorised MedReach user accounts, roles and account security actions." },
  "/admin/security": { title: "Security and Authentication Administration", description: "Review authorised authentication operations and recent security events." },
  "/admin/verification": { title: "Provider Evidence Verification", description: "Review healthcare provider evidence and authorised verification decisions." },
  "/forgot-password": { title: "Request a Password Reset", description: "Request password recovery instructions for your MedReach account." },
  "/reset-password": { title: "Reset Your Password", description: "Use a valid password recovery link to set a new MedReach account password." },
  "/verify-email": { title: "Verify Your Email Address", description: "Complete email verification for your MedReach account." },
  "/verify-notification-email": { title: "Verify a Notification Contact", description: "Verify ownership of a healthcare notification contact email address." },
  "/activate-provider": { title: "Activate a Provider Account", description: "Use your account activation instructions to complete provider account setup." },
});

export function pageMetadata(path, details = PUBLIC_PAGES[path] || PRIVATE_PAGES[path]) {
  if (!details) throw new Error(`Missing metadata for ${path}`);
  return {
    title: details.title, description: details.description,
    alternates: { canonical: path },
    openGraph: { title: details.title, description: details.description, url: absoluteUrl(path), siteName: "MedReach Mumbai", locale: "en_IN", type: "website", images: [siteImage] },
    twitter: { card: "summary_large_image", title: details.title, description: details.description, images: [siteImage.url] },
  };
}

// Route-derived labels keep metadata independent of backend latency. They are
// navigation labels, not claims that a provider or job has been verified.
export function detailMetadata(kind, value) {
  const raw = typeof value === "string" ? value : "";
  const readable = raw.replace(/[^\p{L}\p{N}\s_-]/gu, " ").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "Listing";
  const path = `${kind === "hospital" ? "/hospitals" : "/jobs"}/${encodeURIComponent(raw)}`;
  const details = kind === "hospital"
    ? { title: `${readable} — Hospital Details`, description: `View the hospital listing for ${readable}. Review contact and facility information, and confirm current availability directly with the provider.` }
    : { title: `Healthcare Job — ${readable}`, description: `Review healthcare job listing ${readable}, role requirements and application instructions. Confirm current openings with the hiring organisation.` };
  return pageMetadata(path, details);
}

export function breadcrumbItems(pathname) {
  const base = [{ name: "Home", item: absoluteUrl("/") }];
  const page = PUBLIC_PAGES[pathname];
  if (page?.breadcrumb) return [...base, { name: page.breadcrumb, item: absoluteUrl(pathname) }];
  const match = /^\/(hospitals|jobs)\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  const parent = match[1] === "hospitals" ? "/hospitals" : "/careers";
  let segment;
  try { segment = decodeURIComponent(match[2]); } catch { segment = match[2]; }
  const readable = segment.replace(/[^\p{L}\p{N}\s_-]/gu, " ").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "Listing";
  return [...base, { name: PUBLIC_PAGES[parent].breadcrumb, item: absoluteUrl(parent) }, { name: match[1] === "hospitals" ? readable : `Job ${readable}`, item: absoluteUrl(pathname) }];
}
