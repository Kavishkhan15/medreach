import { isIP } from "node:net";

// Default is direct connections. Deployments must describe their actual proxy boundary.
export function parseTrustProxy(value) {
  if (!value || value === "false" || value === "0") return false;
  if (/^[1-9]$/.test(value)) return Number(value);
  const entries = value.split(",").map((entry) => entry.trim());
  for (const entry of entries) {
    const [address, prefix, extra] = entry.split("/");
    const family = isIP(address);
    if (!family || extra !== undefined || (prefix !== undefined &&
        (!/^\d+$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)))) {
      throw new Error("TRUST_PROXY must be false, a proxy hop count (1-9), or trusted IP/CIDR addresses");
    }
  }
  return entries;
}
