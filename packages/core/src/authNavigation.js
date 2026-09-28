export function safeReturnTo(candidate, fallback = "/") {
  if (typeof candidate !== "string" || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }
  try {
    const base = new URL("https://medreach.local");
    const parsed = new URL(candidate, base);
    if (parsed.origin !== base.origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function profileDestination(user, returnTo = "/") {
  const destination = safeReturnTo(returnTo);
  if (typeof user?.region === "string" && user.region.trim()) return destination;
  return `/profile?onboarding=1&returnTo=${encodeURIComponent(destination)}`;
}
