import { mfaEnabled, validateMfaConfiguration } from "../config/mfaPolicy.js";
import { PrivilegedSecurity, PrivilegedReauthentication } from "../models/PrivilegedSecurity.js";
export const privilegedRoles = ["system_admin", "provider_admin", "hospital_admin"];
export function mfaEnforced(role) {
  validateMfaConfiguration();
  return mfaEnabled() && process.env.MFA_ENFORCE_PRIVILEGED === "true"
    && (role === "system_admin" || (process.env.MFA_ENFORCE_PROVIDERS === "true" && privilegedRoles.includes(role)));
}
export async function mfaRequiredForUser(user) {
  if (!mfaEnabled() || !user) return false;
  const enforced = mfaEnforced(user.role);
  return enforced || Boolean(await PrivilegedSecurity.exists({ user: user._id || user.id, enabledAt: { $type: "date" } }));
}
export async function requireRecentPrivilegedAuthentication(req, res, next) {
  try {
    if (!await mfaRequiredForUser(req.user)) return next();
    if (!req.accessClaims?.sid) return res.status(401).json({ error: "Session authentication required" });
    const enrolled = await PrivilegedSecurity.exists({ user: req.user.id, enabledAt: { $exists: true } });
    if (!enrolled) return res.status(403).json({ error: "MFA enrollment required", code: "MFA_ENROLLMENT_REQUIRED" });
    const recent = await PrivilegedReauthentication.exists({ user: req.user.id, familyId: req.accessClaims.sid,
      authVersion: Number(req.accessClaims.av || 0), expiresAt: { $gt: new Date() } });
    if (!recent) return res.status(403).json({ error: "Recent password and MFA verification required", code: "REAUTHENTICATION_REQUIRED" });
    return next();
  } catch (error) { return next(error); }
}
