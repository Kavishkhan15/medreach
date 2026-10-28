import mongoose from "mongoose";
import { OrganizationUsage } from "../models/OrganizationUsage.js";
import { PROVIDER_KINDS } from "../models/ProviderMembership.js";
const defaults = { integration: 120, import: 10, export: 20, credential: 10 };
export async function consumeOrganizationQuota({ kind, organizationId, operation, now = new Date() }) {
  if (!PROVIDER_KINDS.includes(kind) || !mongoose.isObjectIdOrHexString(organizationId) || !Object.hasOwn(defaults, operation) || !Number.isFinite(now.getTime())) throw new TypeError("Invalid organisation quota scope");
  const raw = process.env[`ORGANIZATION_${operation.toUpperCase()}_LIMIT`];
  const limit = raw === undefined ? defaults[operation] : Number(raw);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100000) throw new Error("Invalid organisation quota configuration");
  const duration = operation === "integration" ? 60000 : 3600000;
  const window = Math.floor(now.getTime() / duration);
  const key = { kind, organization: organizationId, operation, window };
  // Seed an empty bucket before a conditional increment; concurrent inserts share a unique key.
  try { await OrganizationUsage.updateOne(key, { $setOnInsert: { used: 0, expiresAt: new Date((window + 2) * duration) } }, { upsert: true }); } catch (error) { if (error.code !== 11000) throw error; }
  const consumed = await OrganizationUsage.findOneAndUpdate({ ...key, used: { $lt: limit } }, { $inc: { used: 1 } }, { new: true }).lean();
  if (!consumed) throw Object.assign(new Error("Organisation usage limit reached"), { status: 429, code: "ORGANIZATION_QUOTA_EXCEEDED", retryAfterSeconds: Math.ceil(((window + 1) * duration - now.getTime()) / 1000) });
  return { remaining: Math.max(0, limit - consumed.used), resetAt: new Date((window + 1) * duration) };
}
