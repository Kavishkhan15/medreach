import { PrivilegedSecurity } from "../models/PrivilegedSecurity.js";
import { decryptMfaSecret, matchingTotpStep, recoveryDigest } from "./mfaCrypto.js";
// Both TOTP steps and recovery codes are consumed with atomic compare-and-set.
// A concurrent second use always fails, including across API replicas.
export async function verifyAndConsumeMfa(userId, { code, recoveryCode } = {}) {
  const record = await PrivilegedSecurity.findOne({ user: userId, enabledAt: { $exists: true } }).select("+encryptedSecret");
  if (!record) return false;
  if (typeof recoveryCode === "string" && /^[a-fA-F0-9]{32}$/.test(recoveryCode)) {
    return Boolean(await PrivilegedSecurity.findOneAndUpdate({ _id: record._id, enabledAt: record.enabledAt,
      recoveryHashes: recoveryDigest(recoveryCode) }, { $pull: { recoveryHashes: recoveryDigest(recoveryCode) } }));
  }
  const step = matchingTotpStep(decryptMfaSecret(record.encryptedSecret), code, { lastStep: record.lastStep });
  if (step === null) return false;
  return Boolean(await PrivilegedSecurity.findOneAndUpdate({ _id: record._id, enabledAt: record.enabledAt,
    lastStep: record.lastStep }, { $set: { lastStep: step } }));
}
