// Every crawl destination must be public, including the addresses resolved by DNS.
import { BlockList, isIP } from "node:net";

const blockedV4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 3],
]) blockedV4.addSubnet(address, prefix, "ipv4");
const publicV6 = new BlockList();
publicV6.addSubnet("2000::", 3, "ipv6");
const blockedV6 = new BlockList();
// Documentation and transition mechanisms can embed non-public IPv4 addresses.
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16]]) {
  blockedV6.addSubnet(address, prefix, "ipv6");
}

export function isPublicAddress(address) {
  if (isIP(address) === 4) return !blockedV4.check(address, "ipv4");
  if (isIP(address) === 6) return publicV6.check(address, "ipv6") && !blockedV6.check(address, "ipv6");
  return false;
}

export function assertSafeUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return { ok: false, reason: "invalid_url" }; }
  if (!["http:", "https:"].includes(url.protocol)) return { ok: false, reason: "protocol_not_allowed" };
  if (url.username || url.password) return { ok: false, reason: "credentials_in_url" };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (!host || host === "localhost" || [".localhost", ".local", ".internal"].some((suffix) => host.endsWith(suffix)) ||
      (isIP(host) && !isPublicAddress(host))) {
    return { ok: false, reason: "private_or_local_host" };
  }
  return { ok: true, url };
}

export const isSafeUrl = (raw) => assertSafeUrl(raw).ok;
