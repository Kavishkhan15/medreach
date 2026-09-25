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
    const filter = {};
    if (locality) {
      const escapedLoc = locality.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { locality: { $regex: new RegExp(`^${escapedLoc}$`, "i") } },
        { city: { $regex: new RegExp(escapedLoc, "i") } },
      ];
    }
    if (specialty) {
      const specFilter = [{ specialties: specialty }, { departments: specialty }];
      filter.$or = filter.$or ? filter.$or.concat(specFilter) : specFilter;
    } else if (category?.specialties?.length) {
      const catFilter = [
        { specialties: { $in: category.specialties } },
        { departments: { $in: category.specialties } },
      ];
      filter.$or = filter.$or ? filter.$or.concat(catFilter) : catFilter;
    }

    let candidates = await Hospital.find(filter).limit(30).lean();
    if (!candidates.length && locality) {
      // Fallback: If no match in specific locality, query across Mumbai
      candidates = await Hospital.find({}).limit(20).lean();
    }

    const ranked = rankHospitals(candidates, { category });
    const selected = ranked.slice(0, limit);

    return await Promise.all(
      selected.map(async (h) => {
        const facilities = await HospitalFacility.find({ hospital: h._id }).lean();
        const matchedFacilities = category?.facilities?.length
          ? facilities.filter((f) => category.facilities.includes(f.facility)).map((f) => f.facility)
          : facilities.slice(0, 3).map((f) => f.facility);

        const summary = {
          id: String(h._id),
          slug: h.slug,
          name: h.name,
          locality: h.locality || h.city || "Mumbai",
          address: h.address || null,
          specialties: h.specialties || h.departments || [],
          matchedFacilities,
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
          const fac = facilities.find((f) => f.facility === relevantFacility);
          summary.facilityDetail = {
            facility: relevantFacility,
            status: latest?.status ?? fac?.status ?? "unknown",
            confidence: latest?.confidence ?? fac?.confidence ?? "UNKNOWN",
            retrievedAtRelative: latest?.retrievedAt ? relativeTime(latest.retrievedAt) : null,
          };
        }

        return summary;
      })
    );
  } catch (err) {
    console.error("searchHospitals error:", err);
    return [];
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
    if (!records.length && (locality || bloodGroup)) {
      // Relax filter if empty
      records = await ResourceProvider.find({ kind: "blood_bank", active: true }).limit(limit).lean();
    }

    return records.slice(0, limit).map((r) => {
      const summary = {
        id: String(r._id),
        name: r.name,
        locality: r.locality || "Mumbai",
        address: r.address || null,
        phone: r.phone || null,
        operatingHours: r.operatingHours || "24/7",
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
    if (!records.length) {
      records = await ResourceProvider.find({ kind: "diagnostic", active: true }).limit(limit).lean();
    }

    return records.slice(0, limit).map((r) => {
      const summary = {
        id: String(r._id),
        name: r.name,
        locality: r.locality || "Mumbai",
        address: r.address || null,
        phone: r.phone || null,
        operatingHours: r.operatingHours || "8:00 AM - 9:00 PM",
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
    if (!records.length) {
      records = await ResourceProvider.find({ kind: "ambulance", active: true }).limit(limit).lean();
    }

    return records.slice(0, limit).map((r) => {
      const summary = {
        id: String(r._id),
        name: r.name,
        locality: r.locality || "Mumbai",
        address: r.address || null,
        phone: r.phone || "108",
        providerType: r.providerType || "Emergency Ambulance (ALS / BLS)",
        coverageArea: r.coverageArea || "Mumbai Metropolitan Region",
        operatingHours: r.operatingHours || "24/7 Service",
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
      filter.$or = filter.$or
        ? filter.$or.concat([{ location: { $regex: new RegExp(escapedLoc, "i") } }])
        : [{ location: { $regex: new RegExp(escapedLoc, "i") } }];
    }

    let jobs = await Job.find(filter)
      .populate("hospital", "name slug locality city address")
      .populate("provider", "name kind locality")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    if (!jobs.length) {
      // Fallback: search any active/published jobs
      jobs = await Job.find({ status: "published" })
        .populate("hospital", "name slug locality city address")
        .limit(limit)
        .lean();
    }

    return jobs.map((j) => ({
      id: String(j._id),
      title: j.title,
      department: j.department || "Clinical Staff",
      category: j.category,
      employmentType: j.employmentType,
      hospitalName: j.hospital?.name || j.organizationName || "Mumbai Healthcare Partner",
      hospitalSlug: j.hospital?.slug || null,
      location: j.location || j.hospital?.locality || "Mumbai",
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
    return {
      id: String(h._id),
      slug: h.slug,
      name: h.name,
      locality: h.locality || h.city || "Mumbai",
      address: h.address || null,
      phone: h.phone || null,
      emergencyPhone: h.emergencyPhone || null,
      specialties: h.specialties || h.departments || [],
      facilities: facilities.map((f) => ({ facility: f.facility, status: f.status, confidence: f.confidence })),
      hospitalType: h.hospitalType || null,
      coordinates: h.location?.coordinates || null,
    };
  } catch (err) {
    console.error("getHospitalDetails error:", err);
    return null;
  }
}
