import { createHash } from "node:crypto";
import { AuditLog } from "../models/AuditLog.js";
import { env } from "../config/env.js";

// Hash the IP with a salt so audit logs carry no raw personal identifiers.
export function hashIp(ip) {
  if (!ip) return null;
  return createHash("sha256").update(String(ip) + (env.jwtSecret || "salt")).digest("hex").slice(0, 32);
}

// Best-effort audit write. Never throws into the request path.
export async function writeAudit(entry) {
  try { await AuditLog.create(entry); } catch { /* audit must not break the request */ }
}
