// MongoDB-backed repository implementing the crawler PersistenceService repo
// contract (see _crawler/persistence/persistenceService.js). This is the ONLY
// module that lets crawler output reach the real database — everything upstream
// (adapters, parsers, normalizer, validator, change detection) stays DB-free and
// unit-testable. Built entirely on EXISTING models; no new collections.
//
// Mapping notes:
//   - "sourceId" here is the crawler registry STRING id (e.g. "lilavati"),
//     resolved to a DataSource document via DataSource.sourceKey.
//   - Facility CAPABILITY is stored on HospitalFacility.status (yes→"available"
//     is WRONG — capability is not availability, so we keep capability out of the
//     availability enum entirely: HospitalFacility.status stores the crawler's
//     capability signal projected onto the availability vocabulary only for the
//     "is this facility known to exist" boolean via `count` being null vs 0 is
//     insufficient, so we introduce no schema change and instead record capability
//     as a boolean-shaped status: "available" means "capability confirmed present",
//     never "currently has open beds". The UI must read AvailabilityObservation
//     (always "unknown" from these sources) for real-time state, never
//     HospitalFacility.status, to avoid conflating the two (spec §9).
//   - The "previous normalized record" (for change detection) is the payload of
//     the most recent CrawlResult for that hospital — no extra collection needed.

import { Hospital } from "../models/Hospital.js";
import { HospitalFacility } from "../models/HospitalFacility.js";
import { AvailabilityObservation } from "../models/AvailabilityObservation.js";
import { DataSource } from "../models/DataSource.js";
import { CrawlResult } from "../models/CrawlResult.js";

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

    async getPreviousRecord(hospitalId) {
      const last = await CrawlResult.findOne({ hospital: hospitalId, valid: true })
        .sort({ createdAt: -1 })
        .lean();
      return last ? last.payload : null;
    },

    async upsertHospital(record) {
      const source = await DataSource.findOne({ sourceKey: record.provenance.sourceId });
      const h = record.hospital;
      let hospital = source ? await Hospital.findOne({ sourceIds: source._id }) : null;

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
      const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

      if (!hospital) {
        hospital = await Hospital.create({
          ...clean,
          slug: `${slugify(h.name)}-${Math.random().toString(36).slice(2, 7)}`,
          verificationStatus: "unverified",
          sourceIds: source ? [source._id] : [],
        });
      } else {
        Object.assign(hospital, clean);
        if (source && !hospital.sourceIds.some((id) => String(id) === String(source._id))) {
          hospital.sourceIds.push(source._id);
        }
        await hospital.save();
      }
      return hospital.toObject();
    },

    async saveFacilityCapability(hospitalId, facility, { capability, source, confidence, at }) {
      const dataSource = await DataSource.findOne({ sourceKey: source });
      await HospitalFacility.findOneAndUpdate(
        { hospital: hospitalId, facility },
        {
          // Capability presence is recorded via status; real-time availability
          // NEVER lives here (see module header). "available" = capability
          // confirmed by the source, not "beds open now".
          status: capability === "yes" ? "available" : "unknown",
          lastUpdated: at ? new Date(at) : new Date(),
          source: dataSource?._id,
          confidence,
        },
        { upsert: true, new: true }
      );
    },

    async addObservation(observation) {
      const dataSource = await DataSource.findOne({ sourceKey: observation.sourceId });
      const doc = await AvailabilityObservation.create({
        hospital: observation.hospitalId,
        facility: observation.facility,
        status: observation.status, // always "unknown" from crawler sources
        quantity: observation.quantity, // always null — never fabricated
        source: dataSource?._id,
        observedAt: observation.observedAt ? new Date(observation.observedAt) : new Date(),
        retrievedAt: observation.retrievedAt ? new Date(observation.retrievedAt) : new Date(),
        confidence: observation.confidence,
        verificationStatus: observation.verificationStatus || "unverified",
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
  };
}
