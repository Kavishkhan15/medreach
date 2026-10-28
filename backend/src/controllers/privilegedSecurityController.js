import { revokeAllSessions } from "../services/authTokenService.js";
import { User } from "../models/User.js";
import { PrivilegedSecurity, PrivilegedReauthentication } from "../models/PrivilegedSecurity.js";
import { privilegedRoles, mfaEnforced } from "../middleware/privilegedSecurity.js";
import { newMfaSecret, encryptMfaSecret, decryptMfaSecret, matchingTotpStep, newRecoveryCodes } from "../services/mfaCrypto.js";
import { verifyAndConsumeMfa } from "../services/privilegedMfaService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { writeAudit, hashIp } from "../utils/audit.js";
const audit = (req, operation) => writeAudit({ user: req.user.id, action: "update", entityType: "PrivilegedSecurity",
  entityId: req.user.id, after: { operation }, requestId: req.id, ipHash: hashIp(req.ip) });
async function validPassword(req) {
  const user = await User.findById(req.user.id).select("+passwordHash");
  return user?.passwordHash && typeof req.body.password === "string" && await user.comparePassword(req.body.password);
}
export const mfaStatus = asyncHandler(async (req, res) => {
  const enrolled = await PrivilegedSecurity.exists({ user: req.user.id, enabledAt: { $exists: true } });
  res.json({ enabled: Boolean(enrolled), required: mfaEnforced(req.user.role), eligible: privilegedRoles.includes(req.user.role) });
});
export const beginMfaEnrollment = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!privilegedRoles.includes(req.user.role)) return res.status(403).json({ error: "Privileged account required" });
  if (!await validPassword(req)) return res.status(401).json({ error: "Password verification failed" });
  const secret = newMfaSecret(), encrypted = encryptMfaSecret(secret);
  const exists = await PrivilegedSecurity.findOne({ user: req.user.id });
  if (exists?.enabledAt) return res.status(409).json({ error: "MFA already enrolled" });
  try {
    const entry = await PrivilegedSecurity.findOneAndUpdate({ user: req.user.id, enabledAt: { $exists: false } },
      { $set: { pendingSecret: encrypted, pendingUntil: new Date(Date.now() + 600000) } }, { upsert: true, new: true });
    if (!entry) return res.status(409).json({ error: "MFA enrollment changed" });
  } catch (error) { if (error.code === 11000) return res.status(409).json({ error: "MFA enrollment changed" }); throw error; }
  await audit(req, "enrollment_started");
  res.json({ secret, provisioningUri: `otpauth://totp/MedReach:${encodeURIComponent(req.user.email)}?secret=${secret}&issuer=MedReach&algorithm=SHA1&digits=6&period=30`, expiresInSeconds: 600 });
});
export const confirmMfaEnrollment = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!await validPassword(req)) return res.status(401).json({ error: "Password verification failed" });
  const record = await PrivilegedSecurity.findOne({ user: req.user.id, enabledAt: { $exists: false }, pendingUntil: { $gt: new Date() } }).select("+pendingSecret");
  if (!record) return res.status(409).json({ error: "Restart MFA enrollment" });
  const step = matchingTotpStep(decryptMfaSecret(record.pendingSecret), req.body.code);
  if (step === null) return res.status(401).json({ error: "Invalid MFA code" });
  const recovery = newRecoveryCodes();
  const saved = await PrivilegedSecurity.findOneAndUpdate({ _id: record._id, pendingSecret: record.pendingSecret,
    pendingUntil: { $gt: new Date() }, enabledAt: { $exists: false } },
  { $set: { encryptedSecret: record.pendingSecret, enabledAt: new Date(), lastStep: step, recoveryHashes: recovery.hashes }, $unset: { pendingSecret: 1, pendingUntil: 1 } });
  if (!saved) return res.status(409).json({ error: "MFA enrollment changed" });
  await audit(req, "enrollment_confirmed");
  await User.updateOne({ _id: req.user.id }, { $inc: { authVersion: 1 } });
  await revokeAllSessions(req.user.id, "mfa_enrollment");
  await PrivilegedReauthentication.deleteMany({ user: req.user.id });
  res.json({ enabled: true, signedOut: true, recoveryCodes: recovery.codes, message: "Save these single-use recovery codes securely; they cannot be retrieved." });
});
export const reauthenticate = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!req.accessClaims?.sid) return res.status(401).json({ error: "Session required" });
  if (!await validPassword(req) || !await verifyAndConsumeMfa(req.user.id, req.body)) {
    await audit(req, "reauthentication_failed");
    return res.status(401).json({ error: "Password and MFA verification required" });
  }
  const expiresAt = new Date(Date.now() + 5 * 60000);
  await PrivilegedReauthentication.findOneAndUpdate({ user: req.user.id, familyId: req.accessClaims.sid },
    { $set: { authVersion: Number(req.accessClaims.av || 0), expiresAt } }, { upsert: true });
  await audit(req, req.body.recoveryCode ? "reauthenticated_with_recovery_code" : "reauthenticated");
  res.json({ verified: true, expiresAt });
});
export const rotateRecoveryCodes = asyncHandler(async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!await validPassword(req) || !await verifyAndConsumeMfa(req.user.id, req.body)) {
    return res.status(401).json({ error: "Password and MFA verification required" });
  }
  if (!req.accessClaims?.sid) return res.status(401).json({ error: "Session required" });
  // Invalidate existing credentials/session grants before replacing codes. A
  // database interruption fails closed and cannot leave old sessions authorised.
  const changed = await User.updateOne({ _id: req.user.id, authVersion: Number(req.accessClaims.av || 0) }, { $inc: { authVersion: 1 } });
  if (changed.modifiedCount !== 1) return res.status(409).json({ error: "Account security changed; sign in again" });
  await revokeAllSessions(req.user.id, "mfa_recovery_rotation");
  await PrivilegedReauthentication.deleteMany({ user: req.user.id });
  const recovery = newRecoveryCodes();
  const saved = await PrivilegedSecurity.findOneAndUpdate({ user: req.user.id, enabledAt: { $exists: true } },
    { $set: { recoveryHashes: recovery.hashes } });
  if (!saved) return res.status(409).json({ error: "MFA enrollment changed" });
  await audit(req, "recovery_codes_rotated");
  res.json({ signedOut: true, recoveryCodes: recovery.codes, message: "Previous recovery codes and sessions have been invalidated. Sign in again." });
});
