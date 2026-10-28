import { createHmac, randomBytes, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from "node:crypto";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function encodeBase32(bytes) {
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
export function decodeBase32(secret) {
  let bits = 0, value = 0; const bytes = [];
  for (const c of secret.toUpperCase().replace(/=+$/, "")) {
    const index = alphabet.indexOf(c); if (index < 0) throw new Error("Invalid secret");
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}
export const newMfaSecret = () => encodeBase32(randomBytes(20));
export function totp(secret, step, digits = 6) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).padStart(digits, "0");
}
export function matchingTotpStep(secret, code, { now = Date.now(), lastStep = -1 } = {}) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1]) {
    if (step > lastStep && timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}
function encryptionKey() {
  const value = process.env.MFA_ENCRYPTION_KEY;
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) throw Object.assign(new Error("MFA is not configured"), { status: 503 });
  return Buffer.from(value, "hex");
}
export function encryptMfaSecret(secret) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((value) => value.toString("base64url")).join(".");
}
export function decryptMfaSecret(value) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString("utf8");
}
export const recoveryDigest = (code) => createHash("sha256").update(String(code).trim().toLowerCase()).digest("hex");
export function newRecoveryCodes() {
  const codes = Array.from({ length: 10 }, () => randomBytes(16).toString("hex"));
  return { codes, hashes: codes.map(recoveryDigest) };
}
