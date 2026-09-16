// MongoDB-backed repository implementing the crawler PersistenceService repo
// contract (see _crawler/persistence/persistenceService.js). This is the ONLY
// module that lets crawler output reach the real database — everything upstream
// (adapters, parsers, normalizer, validator, change detection) stays DB-free and
// unit-testable. Built entirely on EXISTING models; no new collections.
//
// Mapping notes:
//   - "sourceId" here is the crawler registry STRING id (e.g. "lilavati"),
//     resolved to a DataSource document via DataSource.sourceKey.
//   - Facility capability is stored separately from current availability.
//     A static-site crawl writes HospitalFacility.capability but cannot assert
//     open beds; current status comes from AvailabilityObservation.
//   - The "previous normalized record" (for change detection) is the payload of
//     the most recent CrawlResult for that hospital — no extra collection needed.

import { Hospital } from "../models/Hospital.js";
import { HospitalFacility } from "../models/HospitalFacility.js";
import { AvailabilityObservation } from "../models/AvailabilityObservation.js";
import { DataSource } from "../models/DataSource.js";
import { CrawlResult } from "../models/CrawlResult.js";
import { FacilitySourceClaim } from "../models/FacilitySourceClaim.js";
import { fuseFacilityClaims } from "../services/facilityClaimFusion.js";
import { syncFacilityConflict } from "../services/facilityConflictService.js";
import { canonicalHospitalName, uniqueHospitalIdentityMatch } from "../_crawler/identity/hospitalIdentity.js";
import { HOSPITAL_CLAIM_FIELDS } from "../models/HospitalFieldClaim.js";
import { recordHospitalFieldClaims, normalizeFieldValue } from "../services/hospitalFieldFusion.js";

const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export function createMongoRepo({ job = null } = {}) {
  return {
    async findHospitalBySourceId(sourceId) {
      const source = await DataSource.findOne({ sourceKey: sourceId });
      if (!source) return null;
      const hospital = await Hospital.findOne({ sourceIds: source._id });
      return hospital ? hospital.toObject() : null;
    },

    async getPreviousRecord(hospitalId, sourceId) {
      const source = await DataSource.findOne({ sourceKey: sourceId });
      if (!source) return null;
      const last = await CrawlResult.findOne({ hospital: hospitalId, source: source._id, valid: true })
        .sort({ createdAt: -1 })
        .lean();
      return last ? last.payload : null;
    },

    async upsertHospital(record) {
      const source = await DataSource.findOne({ sourceKey: record.provenance.sourceId });
      if (!source) throw new Error(`unknown_source:${record.provenance.sourceId}`);
      const h = record.hospital;
      let hospital = source ? await Hospital.findOne({ sourceIds: source._id }) : null;
      if (!hospital && source?.hospital) hospital = await Hospital.findById(source.hospital);
      if (!hospital && h.pincode) {
        const candidates = await Hospital.find({ pincode: String(h.pincode) });
        hospital = uniqueHospitalIdentityMatch(h, candidates);
      }

      const fields = {
        name: h.name,
        description: h.description || undefined,
        hospitalType: h.hospitalType || undefined,
        address: h.address || undefined,
        locality: h.locality || undefined,
        city: h.city || "Mumbai",
        pincode: h.pincode || undefined,
        phone: h.phone || undefined,
        emergencyPhone: h.emergencyPhone || undefined,
        website: h.website || undefined,
        specialties: record.specialties?.length ? record.specialties : undefined,
      };
      // Never overwrite a real field with undefined (Mongoose skips undefined on $set only
      // if we build the object without those keys — done implicitly by JSON stripping below).
      const clean = Object.fromEntries(Object.entries(fields)
        .map(([field, value]) => [field, HOSPITAL_CLAIM_FIELDS.includes(field) ? normalizeFieldValue(field, value) : value])
        .filter(([, value]) => value !== undefined && value !== null));

      if (!hospital) {
        hospital = await Hospital.create({
          ...clean,
          slug: `${slugify(h.name)}-${Math.random().toString(36).slice(2, 7)}`,
          verificationStatus: "unverified",
          sourceIds: source ? [source._id] : [],
        });
      } else {
        // Tracked identity/contact/specialty fields are applied only after
        // source-specific fusion. A conflicting crawl cannot replace them.
        Object.assign(hospital, Object.fromEntries(Object.entries(clean)
          .filter(([field]) => !HOSPITAL_CLAIM_FIELDS.includes(field))));
        if (source && !hospital.sourceIds.some((id) => String(id) === String(source._id))) {
          hospital.sourceIds.push(source._id);
        }
        await hospital.save();
      }
      await recordHospitalFieldClaims({
        hospitalId: hospital._id, source,
        values: { ...h, specialties: record.specialties },
        sourcePageUrl: record.provenance.sourcePageUrl,
        fieldEvidence: record.fieldEvidence,
        observedAt: record.retrievedAt,
        parserVersion: record.provenance.parserVersion,
        confidence: record.confidence || "UNKNOWN",
      });
      return (await Hospital.findById(hospital._id)).toObject();
    },

    async saveFacilityCapability(hospitalId, facility, { capability, source, confidence, at, sourcePageUrl, evidenceText, parserVersion }) {
      const dataSource = await DataSource.findOne({ sourceKey: source });
      if (!dataSource) throw new Error(`unknown_source:${source}`);
      const key = { hospital: hospitalId, facility, source: dataSource._id };
      const previous = await FacilitySourceClaim.findOne(key).lean();
      const normalized = ["yes", "no"].includes(capability) ? capability : "unknown";
      const changed = previous && (
        previous.capability !== normalized
        || (evidenceText && previous.evidenceText !== evidenceText)
        || (sourcePageUrl && previous.sourcePageUrl !== sourcePageUrl)
        || (parserVersion && previous.parserVersion !== parserVersion)
      );
      const recordedEvidence = evidenceText || `Normalized crawl record: ${facility} capability ${normalized}; source excerpt unavailable.`;
      const patch = {
        capability: normalized,
        confidence: confidence || "UNKNOWN",
        observedAt: at ? new Date(at) : new Date(),
        sourcePageUrl: sourcePageUrl || dataSource.url || `medreach://source/${dataSource._id}`,
        evidenceKind: !sourcePageUrl ? "legacy_snapshot" : evidenceText ? "source_excerpt" : "normalized_record",
        evidenceText: recordedEvidence.slice(0, 200),
        parserVersion: parserVersion || undefined,
        ...(changed ? { verificationStatus: "unverified", reviewedBy: null, reviewedAt: null, reviewNote: null } : {}),
      };
      await FacilitySourceClaim.findOneAndUpdate(key, { $set: patch }, { upsert: true, new: true, runValidators: true });
      const claims = await FacilitySourceClaim.find({ hospital: hospitalId, facility }).lean();
      const resolved = fuseFacilityClaims(claims);
      await syncFacilityConflict({ hospital: hospitalId, facility, claims, resolution: resolved });
      await HospitalFacility.findOneAndUpdate(
        { hospital: hospitalId, facility },
        {
          capability: resolved.capability,
          capabilityConflict: resolved.conflict,
          status: "unknown",
          count: null,
          lastUpdated: at ? new Date(at) : new Date(),
          source: resolved.selectedClaim?.source || null,
          confidence: resolved.selectedClaim?.confidence || "UNKNOWN",
        },
        { upsert: true, new: true }
      );
    },

    async addObservation(observation) {
      const dataSource = await DataSource.findOne({ sourceKey: observation.sourceId });
      if (!dataSource) throw new Error(`unknown_source:${observation.sourceId}`);
      // This repository is fed by the static capability crawler. A future
      // current-capacity integration needs a separate, verified write path.
      // Never trust an adapter-supplied status or bed quantity here.
      const doc = await AvailabilityObservation.create({
        hospital: observation.hospitalId,
        facility: observation.facility,
        status: "unknown",
        quantity: null,
        source: dataSource?._id,
        observedAt: observation.observedAt ? new Date(observation.observedAt) : new Date(),
        retrievedAt: observation.retrievedAt ? new Date(observation.retrievedAt) : new Date(),
        confidence: observation.confidence,
        verificationStatus: "unverified",
      });
      return doc.toObject();
    },

    async savePreviousRecord(hospitalId, record) {
      const source = await DataSource.findOne({ sourceKey: record.provenance.sourceId });
      if (!source) return;
      await CrawlResult.create({
        job: job || undefined,
        source: source._id,
        hospital: hospitalId,
        payload: record,
        valid: true,
        confidence: "UNKNOWN",
        applied: true,
      });
    },

    async flagAnomaly(sourceId, info) {
      const source = await DataSource.findOne({ sourceKey: sourceId });
      if (!source) return;
      await CrawlResult.create({
        job: job || undefined,
        source: source._id,
        payload: info,
        valid: false,
        validationErrors: ["PARSING_ANOMALY"],
        applied: false,
      });
    },

    // ---- directory-source repo contract (see crawler/src/persistence/directoryPersistenceService.js) ----

    // An exact prior listing from this directory wins. Otherwise require one
    // unique canonical name + six-digit pincode match across hospitals.
    async findHospitalByName(listing, sourceId) {
      const source = await DataSource.findOne({ sourceKey: sourceId });
      if (source && (listing.pincode || listing.address)) {
        const prior = await CrawlResult.find({
          source: source._id,
          "payload.directoryListing.name": listing.name,
        }).select("hospital payload.directoryListing").lean();
        const ids = [...new Set(prior.filter((row) =>
          canonicalHospitalName(row.payload?.directoryListing?.name) === canonicalHospitalName(listing.name)
          && String(row.payload?.directoryListing?.pincode || "") === String(listing.pincode || "")
          && String(row.payload?.directoryListing?.address || "") === String(listing.address || "")
        ).map((row) => String(row.hospital)))];
        if (ids.length === 1) {
          const matched = await Hospital.findById(ids[0]);
          if (matched) return matched.toObject();
        }
        if (ids.length > 1) return null;
      }
      if (!/^\d{6}$/.test(String(listing.pincode || ""))) return null;
      const candidates = await Hospital.find({ pincode: listing.pincode }).lean();
      return uniqueHospitalIdentityMatch(listing, candidates);
    },

    // Creates a minimal, unverified hospital stub from directory-only fields.
    // Never includes facility/specialty data — a directory doesn't publish
    // that, so this never fabricates any.
    async createHospitalStub(listing, sourceId) {
      const source = await DataSource.findOne({ sourceKey: sourceId });
      const hasCoords = typeof listing.longitude === "number" && typeof listing.latitude === "number";
      const hospital = await Hospital.create({
        name: listing.name,
        address: listing.address || undefined,
        pincode: listing.pincode || undefined,
        phone: listing.phone || undefined,
        city: "Mumbai",
        verificationStatus: "unverified",
        sourceIds: source ? [source._id] : [],
        ...(hasCoords
          ? { location: { type: "Point", coordinates: [listing.longitude, listing.latitude] } }
          : {}),
      });
      return hospital.toObject();
    },

    // Records the directory->hospital link with full provenance. If the
    // listing MATCHED an existing hospital (created by a different,
    // authoritative hospital_site source), we only add this directory as an
    // additional source — never overwrite the hospital's existing identity
    // fields, since the directory is a lower-authority cross-reference here.
    async linkDirectoryListing(sourceId, listing, hospitalId, { matched, sourcePageUrl, retrievedAt, parserVersion, confidence } = {}) {
      const source = await DataSource.findOne({ sourceKey: sourceId });
      if (matched && source) {
        await Hospital.findByIdAndUpdate(hospitalId, { $addToSet: { sourceIds: source._id } });
      }
      await CrawlResult.create({
        job: job || undefined,
        source: source?._id,
        hospital: hospitalId,
        payload: { directoryListing: listing, matched },
        valid: true,
        confidence: "MEDIUM",
        applied: true,
      });
      await recordHospitalFieldClaims({
        hospitalId, source,
        values: { ...listing, website: listing.officialWebsite },
        sourcePageUrl, observedAt: retrievedAt, parserVersion,
        confidence: confidence || "UNKNOWN",
      });
    },
  };
}
