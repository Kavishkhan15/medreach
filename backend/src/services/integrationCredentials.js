import mongoose from "mongoose";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { IntegrationCredential } from "../models/IntegrationCredential.js";
import { AuditLog } from "../models/AuditLog.js";
import { assertProviderPermission } from "./providerPermissions.js";
import { consumeOrganizationQuota } from "./organizationQuota.js";
const digest = secret => createHash("sha256").update(secret).digest("hex");
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
export async function createIntegrationCredential({ actor, kind, organizationId, label, scopes, expiresInDays = 30, requestId }) {
  const { user } = await assertProviderPermission({ actor, kind, organizationId, permission: "credentials:manage" });
  if (typeof label !== "string" || !label.trim() || label.length > 80 || !Array.isArray(scopes) || !scopes.length || scopes.length > 2 || scopes.some(s => !["inventory:read", "inventory:write"].includes(s)) || new Set(scopes).size !== scopes.length || !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 90) throw fail(400, "INVALID_CREDENTIAL", "Invalid credential configuration");
  await consumeOrganizationQuota({ kind, organizationId, operation: "credential" });
  const id = new mongoose.Types.ObjectId(), secret = randomBytes(32).toString("base64url");
  // Audit before issuance: failure prevents exposing any credential.
  await AuditLog.create({ user: actor.id, action: "create", entityType: "IntegrationCredential", entityId: id, after: { kind, organization: organizationId, scopes }, requestId });
  const record = await IntegrationCredential.create({ _id: id, user: user._id, kind, organization: organizationId, label: label.trim(), scopes, secretHash: digest(secret), authVersion: Number(user.authVersion || 0), expiresAt: new Date(Date.now() + expiresInDays * 86400000) });
  return { id, token: `mrk_${id}.${secret}`, expiresAt: record.expiresAt, scopes };
}
export async function listIntegrationCredentials({ actor, kind, organizationId, before, limit = 25 }) {
  await assertProviderPermission({ actor, kind, organizationId, permission: "credentials:manage" });
  const size = typeof limit === "string" && /^\d+$/.test(limit) ? Number(limit) : limit;
  if (!Number.isInteger(size) || size < 1 || size > 100 || (before !== undefined && !mongoose.isObjectIdOrHexString(before))) throw fail(400, "INVALID_PAGINATION", "Invalid credential pagination");
  const rows = await IntegrationCredential.find({ user: actor.id, kind, organization: organizationId, ...(before ? { _id: { $lt: before } } : {}) }).select("label kind organization scopes expiresAt revokedAt createdAt").sort({ _id: -1 }).limit(size + 1).lean();
  const data = rows.slice(0, size);
  return { data, nextCursor: rows.length > size ? String(data.at(-1)._id) : null };
}
export async function revokeIntegrationCredential({ actor, kind, organizationId, id, requestId }) {
  await assertProviderPermission({ actor, kind, organizationId, permission: "credentials:manage" });
  if (!mongoose.isObjectIdOrHexString(id)) throw fail(400, "INVALID_CREDENTIAL", "Invalid credential identifier");
  const key = { _id: id, user: actor.id, kind, organization: organizationId };
  if (!await IntegrationCredential.exists(key)) throw fail(404, "CREDENTIAL_NOT_FOUND", "Credential not found");
  await AuditLog.create({ user: actor.id, action: "update", entityType: "IntegrationCredential", entityId: id, after: { revoked: true }, requestId });
  await IntegrationCredential.updateOne({ ...key, revokedAt: null }, { $set: { revokedAt: new Date() } });
}
export async function authenticateIntegrationCredential(token, scope) {
  if (typeof token !== "string" || token.length > 150 || !/^mrk_[a-f0-9]{24}\.[A-Za-z0-9_-]{43}$/.test(token) || !["inventory:read", "inventory:write"].includes(scope)) throw fail(401, "INVALID_INTEGRATION_CREDENTIAL", "Invalid integration credential");
  const [id, secret] = token.slice(4).split(".");
  const record = await IntegrationCredential.findOne({ _id: id, revokedAt: null, expiresAt: { $gt: new Date() } }).select("+secretHash").lean();
  if (!record || !timingSafeEqual(Buffer.from(record.secretHash, "hex"), Buffer.from(digest(secret), "hex"))) throw fail(401, "INVALID_INTEGRATION_CREDENTIAL", "Invalid integration credential");
  if (!record.scopes.includes(scope)) throw fail(403, "INTEGRATION_SCOPE_FORBIDDEN", "Credential scope denied");
  const actor = { id: String(record.user) };
  const { user } = await assertProviderPermission({ actor, kind: record.kind, organizationId: record.organization, permission: scope });
  if (Number(user.authVersion || 0) !== record.authVersion) throw fail(401, "INVALID_INTEGRATION_CREDENTIAL", "Credential invalidated by account security change");
  await consumeOrganizationQuota({ kind: record.kind, organizationId: record.organization, operation: "integration" });
  return { actor, kind: record.kind, organizationId: String(record.organization), credentialId: record._id };
}
