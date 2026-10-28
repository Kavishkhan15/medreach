import { HospitalEnrichment } from '../models/HospitalEnrichment.js';
import { loadEnrichmentEvidence, evidenceUrl } from './hospitalEnrichmentEvidence.js';

// This public read is deterministic: no external model, enqueue or write occurs.
// Reviewed extraction may fill missing directory fields, never availability.
export async function enrichHospitalData(hospitalIdOrSlug) {
  const state = await loadEnrichmentEvidence(hospitalIdOrSlug);
  if (!state) return null;
  const { hospital, evidence, inputHash, tooMany } = state;
  const approved = !tooMany ? await HospitalEnrichment.findOne({ hospital: hospital._id, inputHash, status: 'approved' })
    .select('approvedFields reviewedBy reviewedAt').lean() : null;
  const fields = approved?.approvedFields || {}, usedFields = [];
  const value = (field, current) => {
    if (Array.isArray(current) ? current.length > 0 : Boolean(current)) return current;
    if (fields[field]?.value !== undefined) { usedFields.push(field); return fields[field].value; }
    return null;
  };
  const address = value('address', hospital.address), pincode = value('pincode', hospital.pincode);
  const phone = value('phone', hospital.phone || hospital.emergencyPhone);
  const specialties = value('specialties', hospital.specialties?.length ? hospital.specialties : hospital.departments);
  const source = evidence[0];
  const result = {
    hospitalId: hospital._id, slug: hospital.slug, name: hospital.name,
    address: address || (hospital.locality ? `${hospital.locality}, ${hospital.city || 'Mumbai'}` : 'Not available.'),
    pincode: pincode || 'Not available.', phone: phone || 'Not available.',
    specialties: specialties?.length ? specialties : ['Not available.'],
    sourceName: source?.sourceName || 'Hospital directory record', sourceUrl: source?.sourceUrl || evidenceUrl(hospital.website),
    enriched: usedFields.length > 0, location: hospital.location,
    // Do not label a general helpline as a hospital's own telephone number.
    emergencyPhone: hospital.emergencyPhone || 'Not available.',
  };
  if (usedFields.length) result.enrichmentReview = { reviewedBy: approved.reviewedBy, reviewedAt: approved.reviewedAt,
    fields: Object.fromEntries(usedFields.map(field => [field, fields[field]])) };
  return result;
}
