// Reusable backend tools for MedReach Assistant
// Queries real MongoDB collections only — NEVER fabricates data.

import { Hospital } from "../models/Hospital.js";
import { HospitalFacility } from "../models/HospitalFacility.js";
import { AvailabilityObservation } from "../models/AvailabilityObservation.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { Job } from "../models/Job.js";
import { latestByFacility } from "./availabilityService.js";
import { relativeTime } from "./freshnessService.js";
import { rankHospitals } from "./rankingService.js";
import { composeHospitalDataView } from "./hospitalDataView.js";

// Haversine distance in km between two lat/lng coordinates
export function computeDistanceKm(lat1, lon1, lat2, lon2) {
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return null;
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 1. Search Hospitals using real Mongoose models & ranking
export async function searchHospitals({ locality, category, specialty, emergencyOnly = false, limit = 4, origin } = {}) {
  try {
    const escapeRegex = (value) => value.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = {};
    if (locality) {
      const escapedLoc = escapeRegex(locality);
      filter.$and = [{ $or: [
        // "Bandra" includes Bandra West/East; "Bandra West" stays specific.
        { locality: { $regex: new RegExp(`^${escapedLoc}(?:\\s|$)`, "i") } },
        { city: { $regex: new RegExp(`^${escapedLoc}$`, "i") } },
      ] }];
    }
    const requestedSpecialties = specialty ? [specialty] : category?.specialties || [];
    const specialtyPatterns = requestedSpecialties.map((name) => new RegExp(`\\b${escapeRegex(name)}\\b`, "i"));
    const requestedFacilities = !specialty ? category?.facilities || [] : [];
    const facilityIds = requestedFacilities.length
      ? await HospitalFacility.distinct("hospital", {
          facility: { $in: requestedFacilities }, capability: "yes", capabilityConflict: { $ne: true },
        })
      : [];
    if (specialty) {
      filter.$and = [...(filter.$and || []), { $or: [
        { specialties: { $in: specialtyPatterns } }, { departments: { $in: specialtyPatterns } },
      ] }];
    } else if (category) {
      const matches = [];
      if (specialtyPatterns.length) matches.push(
        { specialties: { $in: specialtyPatterns } }, { departments: { $in: specialtyPatterns } },
      );
      if (facilityIds.length) matches.push({ _id: { $in: facilityIds } });
      if (!matches.length) return [];
      filter.$and = [...(filter.$and || []), { $or: matches }];
    }

    // Rank the complete eligible set, so an arbitrary database row order cannot
    // hide a closer or better-matched hospital from the results.
    let candidates = await Hospital.find(filter).lean();
    if (emergencyOnly && candidates.length) {
      const capable = await HospitalFacility.distinct("hospital", {
        hospital: { $in: candidates.map((hospital) => hospital._id) },
        facility: "Emergency Department",
        capability: "yes", capabilityConflict: { $ne: true },
      });
      const capableIds = new Set(capable.map(String));
      candidates = candidates.filter((hospital) => capableIds.has(String(hospital._id)));
    }

    const ranked = rankHospitals(candidates, { category });
    if (origin) ranked.sort((a, b) => {
      const distance = (hospital) => {
        const [lng, lat] = hospital.location?.coordinates || [];
        return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)
          ? computeDistanceKm(origin.lat, origin.lng, lat, lng) : Infinity;
      };
      return distance(a) - distance(b) || b._rank.score - a._rank.score;
    });
    const selected = ranked.slice(0, limit);

    return await Promise.all(
      selected.map(async (h) => {
        const facilities = await HospitalFacility.find({ hospital: h._id }).lean();
        const matchedFacilities = category?.facilities?.length
          ? facilities.filter((f) => category.facilities.includes(f.facility) && f.capability === "yes" && !f.capabilityConflict).map((f) => f.facility)
          : facilities.filter((f) => f.capability === "yes" && !f.capabilityConflict).slice(0, 3).map((f) => f.facility);
        const specialties = [...new Set([...(h.specialties || []), ...(h.departments || [])])];
        const matchedSpecialties = specialties.filter((name) => specialtyPatterns.some((pattern) => pattern.test(name)));

        const summary = {
          id: String(h._id),
          slug: h.slug,
          name: h.name,
          locality: h.locality || h.city || null,
          address: h.address || null,
          specialties,
          matchedFacilities,
          matchedSpecialties,
          verificationStatus: h.verificationStatus || "unverified",
          phone: h.emergencyPhone || h.phone || null,
          coordinates:
            h.location?.coordinates &&
            Array.isArray(h.location.coordinates) &&
            h.location.coordinates.some((v) => v !== 0)
              ? h.location.coordinates
              : null,
          hospitalType: h.hospitalType || null,
        };

        if (origin && summary.coordinates) {
          const [lng, lat] = summary.coordinates;
          summary.distanceKm = computeDistanceKm(origin.lat, origin.lng, lat, lng);
        }

        const relevantFacility = matchedFacilities[0] || facilities[0]?.facility;
        if (relevantFacility) {
          const obs = await AvailabilityObservation.find({ hospital: h._id, facility: relevantFacility })
            .sort({ retrievedAt: -1 })
            .limit(1)
            .lean();
          const latest = latestByFacility(obs)[0];
          const current = composeHospitalDataView(h, facilities, obs).facilities
            .find((facility) => facility.facility === relevantFacility);
          summary.facilityDetail = {
            facility: relevantFacility,
            status: current?.status || "unknown",
            confidence: current?.confidence || "UNKNOWN",
            retrievedAtRelative: latest?.retrievedAt ? relativeTime(latest.retrievedAt) : null,
          };
        }

        return summary;
      })
    );
  } catch (err) {
    console.error("searchHospitals error:", err);
    throw err;
  }
}

// 2. Search Blood Banks
export async function searchBloodBanks({ locality, bloodGroup, limit = 4, origin } = {}) {
  try {
    const filter = { kind: "blood_bank", active: true };
    if (locality) {
      const escapedLoc = locality.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { locality: { $regex: new RegExp(escapedLoc, "i") } },
        { address: { $regex: new RegExp(escapedLoc, "i") } },
        { city: { $regex: new RegExp(escapedLoc, "i") } },
      ];
    }
    if (bloodGroup) {
      const bgUpper = bloodGroup.trim().toUpperCase();
      filter.listedBloodGroups = bgUpper;
    }

    let records = await ResourceProvider.find(filter).limit(limit * 2).lean();

    return records.slice(0, limit).map((r) => {
      const summary = {
        id: String(r._id),
        name: r.name,
        locality: r.locality || r.city || null,
        address: r.address || null,
        phone: r.phone || null,
        operatingHours: r.operatingHours || null,
        listedBloodGroups: r.listedBloodGroups || [],
        verificationStatus: r.verificationStatus || "unverified",
        confidence: r.confidence || "UNKNOWN",
        coordinates:
          r.location?.coordinates &&
          Array.isArray(r.location.coordinates) &&
          r.location.coordinates.some((v) => v !== 0)
            ? r.location.coordinates
            : null,
      };
      if (origin && summary.coordinates) {
        const [lng, lat] = summary.coordinates;
        summary.distanceKm = computeDistanceKm(origin.lat, origin.lng, lat, lng);
      }
      return summary;
    });
  } catch (err) {
    console.error("searchBloodBanks error:", err);
    return [];
  }
}

// 3. Search Diagnostic Centres
export async function searchDiagnostics({ locality, service, limit = 4, origin } = {}) {
  try {
    const filter = { kind: "diagnostic", active: true };
    if (locality) {
      const escapedLoc = locality.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { locality: { $regex: new RegExp(escapedLoc, "i") } },
        { address: { $regex: new RegExp(escapedLoc, "i") } },
        { city: { $regex: new RegExp(escapedLoc, "i") } },
      ];
    }
    if (service) {
      const escapedService = service.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.services = { $regex: new RegExp(escapedService, "i") };
    }

    let records = await ResourceProvider.find(filter).limit(limit * 2).lean();

    return records.slice(0, limit).map((r) => {
      const summary = {
        id: String(r._id),
        name: r.name,
        locality: r.locality || r.city || null,
        address: r.address || null,
        phone: r.phone || null,
        operatingHours: r.operatingHours || null,
        services: r.services || [],
        verificationStatus: r.verificationStatus || "unverified",
        confidence: r.confidence || "UNKNOWN",
        coordinates:
          r.location?.coordinates &&
          Array.isArray(r.location.coordinates) &&
          r.location.coordinates.some((v) => v !== 0)
            ? r.location.coordinates
            : null,
      };
      if (origin && summary.coordinates) {
        const [lng, lat] = summary.coordinates;
        summary.distanceKm = computeDistanceKm(origin.lat, origin.lng, lat, lng);
      }
      return summary;
    });
  } catch (err) {
    console.error("searchDiagnostics error:", err);
    return [];
  }
}

// 4. Search Ambulances
export async function searchAmbulances({ locality, providerType, limit = 4, origin } = {}) {
  try {
    const filter = { kind: "ambulance", active: true };
    if (locality) {
      const escapedLoc = locality.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { locality: { $regex: new RegExp(escapedLoc, "i") } },
        { coverageArea: { $regex: new RegExp(escapedLoc, "i") } },
        { address: { $regex: new RegExp(escapedLoc, "i") } },
      ];
    }
    if (providerType) {
      filter.providerType = { $regex: new RegExp(providerType.trim(), "i") };
    }

    let records = await ResourceProvider.find(filter).limit(limit * 2).lean();

    return records.slice(0, limit).map((r) => {
      const summary = {
        id: String(r._id),
        name: r.name,
        locality: r.locality || r.city || null,
        address: r.address || null,
        phone: r.phone || null,
        providerType: r.providerType || null,
        coverageArea: r.coverageArea || null,
        operatingHours: r.operatingHours || null,
        verificationStatus: r.verificationStatus || "unverified",
        confidence: r.confidence || "UNKNOWN",
        coordinates:
          r.location?.coordinates &&
          Array.isArray(r.location.coordinates) &&
          r.location.coordinates.some((v) => v !== 0)
            ? r.location.coordinates
            : null,
      };
      if (origin && summary.coordinates) {
        const [lng, lat] = summary.coordinates;
        summary.distanceKm = computeDistanceKm(origin.lat, origin.lng, lat, lng);
      }
      return summary;
    });
  } catch (err) {
    console.error("searchAmbulances error:", err);
    return [];
  }
}

// 5. Search Jobs / Careers
export async function searchJobs({ locality, department, query, limit = 4 } = {}) {
  try {
    const filter = { status: "published" };
    if (department) {
      filter.department = { $regex: new RegExp(department.trim(), "i") };
    }
    if (query) {
      const escapedQ = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: new RegExp(escapedQ, "i") } },
        { category: { $regex: new RegExp(escapedQ, "i") } },
        { description: { $regex: new RegExp(escapedQ, "i") } },
      ];
    }
    if (locality) {
      const escapedLoc = locality.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.location = { $regex: new RegExp(escapedLoc, "i") };
    }

    let jobs = await Job.find(filter)
      .populate("hospital", "name slug locality city address")
      .populate("provider", "name kind locality")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();


    return jobs.map((j) => ({
      id: String(j._id),
      title: j.title,
      department: j.department || null,
      category: j.category,
      employmentType: j.employmentType,
      hospitalName: j.hospital?.name || j.provider?.name || j.organizationName || null,
      hospitalSlug: j.hospital?.slug || null,
      location: j.location || j.hospital?.locality || null,
      createdAt: j.createdAt,
    }));
  } catch (err) {
    console.error("searchJobs error:", err);
    return [];
  }
}

// 6. Get Hospital Details by ID or Slug
export async function getHospitalDetails({ idOrSlug }) {
  try {
    if (!idOrSlug) return null;
    const isId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);
    const filter = isId ? { _id: idOrSlug } : { slug: idOrSlug };
    const h = await Hospital.findOne(filter).lean();
    if (!h) return null;

    const facilities = await HospitalFacility.find({ hospital: h._id }).lean();
    const observations = await AvailabilityObservation.find({ hospital: h._id })
      .sort({ retrievedAt: -1 }).limit(100).lean();
    const current = composeHospitalDataView(h, facilities, observations);
    return {
      id: String(h._id),
      slug: h.slug,
      name: h.name,
      locality: h.locality || h.city || null,
      address: h.address || null,
      phone: h.phone || null,
      emergencyPhone: h.emergencyPhone || null,
      specialties: h.specialties || h.departments || [],
      facilities: current.facilities.map((f) => ({
        facility: f.facility,
        capability: f.capability,
        status: f.status,
        confidence: f.confidence,
        observedAt: f.observedAt,
      })),
      hospitalType: h.hospitalType || null,
      coordinates: Array.isArray(h.location?.coordinates) && h.location.coordinates.some((value) => value !== 0)
        ? h.location.coordinates : null,
    };
  } catch (err) {
    console.error("getHospitalDetails error:", err);
    return null;
  }
}
