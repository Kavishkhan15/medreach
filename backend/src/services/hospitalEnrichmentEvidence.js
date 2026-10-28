import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { Hospital } from '../models/Hospital.js';
import { HospitalFieldClaim } from '../models/HospitalFieldClaim.js';
import { FacilitySourceClaim } from '../models/FacilitySourceClaim.js';
import { DataSource } from '../models/DataSource.js';
const stable = value => value instanceof Date ? value.toISOString() : value instanceof mongoose.Types.ObjectId ? String(value) : Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export const enrichmentHash = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
export function evidenceUrl(value) {
  if (typeof value !== 'string' || value.length > 1000) return null;
  try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export async function loadEnrichmentEvidence(idOrSlug) {
  if (typeof idOrSlug !== 'string' || !idOrSlug || idOrSlug.length > 220) return null;
  const query = mongoose.isObjectIdOrHexString(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  const hospital = await Hospital.findOne({ ...query, archivedAt: null, approvalStatus: { $nin: ['pending','rejected'] } })
    .select('name slug address pincode phone emergencyPhone specialties departments locality city website location updatedAt').lean();
  if (!hospital) return null;
  const [fields, facilities] = await Promise.all([
    HospitalFieldClaim.find({ hospital: hospital._id, verificationStatus: { $ne: 'rejected' } }).select('field value evidenceText source sourcePageUrl confidence verificationStatus observedAt updatedAt').sort({ _id: 1 }).limit(51).lean(),
    FacilitySourceClaim.find({ hospital: hospital._id, verificationStatus: { $ne: 'rejected' } }).select('facility capability evidenceText source sourcePageUrl confidence verificationStatus observedAt updatedAt').sort({ _id: 1 }).limit(51).lean(),
  ]);
  const claims = [...fields, ...facilities], ids = [...new Set(claims.filter(c => c.source).map(c => String(c.source)))];
  const sources = ids.length ? await DataSource.find({ _id: { $in: ids } }).select('name url updatedAt').sort({ _id: 1 }).lean() : [];
  const sourceMap = new Map(sources.map(s => [String(s._id), s]));
  const evidence = claims.flatMap(claim => {
    const source = sourceMap.get(String(claim.source)), url = evidenceUrl(claim.sourcePageUrl) || evidenceUrl(source?.url);
    if (!source || !url || typeof claim.evidenceText !== 'string' || !claim.evidenceText.trim() || claim.evidenceText.length > 300) return [];
    return [{ id: String(claim._id), text: claim.evidenceText, sourceId: String(source._id), sourceName: String(source.name || 'Recorded source').slice(0,120), sourceUrl: url, observedAt: claim.observedAt || null, verificationStatus: claim.verificationStatus || 'unverified' }];
  }).slice(0, 15);
  const tooMany = fields.length > 50 || facilities.length > 50;
  return { hospital, evidence, inputHash: enrichmentHash({ hospital, fields, facilities, sources }), tooMany };
}
