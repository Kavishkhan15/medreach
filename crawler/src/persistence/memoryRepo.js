// In-memory repository implementing the PersistenceService repo contract.
// Used for --dry-run and for running the crawler without a live MongoDB, and by
// unit tests. Keeps the crawler testable with zero database dependency.
import { canonicalHospitalName, uniqueHospitalIdentityMatch } from "../identity/hospitalIdentity.js";

export function createMemoryRepo(seed = {}) {
  const store = {
    hospitals: new Map(seed.hospitals || []), // sourceId -> hospital
    previous: new Map(seed.previous || []),   // hospitalId -> normalized record
    facilities: [],
    observations: [],
    anomalies: [],
    directoryListings: [], // { sourceId, name, ...listing, linkedHospitalId }
  };
  let idSeq = 1;

  return {
    store,
    async findHospitalBySourceId(sourceId) {
      return store.hospitals.get(sourceId) || null;
    },
    async getPreviousRecord(hospitalId, sourceId) {
      return store.previous.get(`${hospitalId}:${sourceId}`) || store.previous.get(String(hospitalId)) || null;
    },
    async upsertHospital(record) {
      const sourceId = record?.provenance?.sourceId ?? null;
      let hospital = store.hospitals.get(sourceId);
      if (!hospital) {
        hospital = { _id: `mem-${idSeq++}`, sourceId, name: record.hospital.name };
        store.hospitals.set(sourceId, hospital);
      }
      hospital.name = record.hospital.name;
      hospital.pincode = record.hospital.pincode;
      return hospital;
    },
    async saveFacilityCapability(hospitalId, facility, meta) {
      store.facilities.push({ hospitalId: String(hospitalId), facility, ...meta });
    },
    async addObservation(observation) {
      store.observations.push(observation);
      return observation;
    },
    async savePreviousRecord(hospitalId, record) {
      store.previous.set(`${hospitalId}:${record.provenance.sourceId}`, record);
    },
    async flagAnomaly(sourceId, info) {
      store.anomalies.push({ sourceId, ...info });
    },

    // ---- directory-source repo contract (see persistence/directoryPersistenceService.js) ----

    // First reuse an exact prior link from the same directory. Cross-source
    // matching requires a unique canonical name + matching six-digit pincode.
    async findHospitalByName(listing, sourceId) {
      const previous = store.directoryListings.filter((row) => row.sourceId === sourceId
        && canonicalHospitalName(row.listing.name) === canonicalHospitalName(listing.name)
        && String(row.listing.pincode || "") === String(listing.pincode || "")
        && String(row.listing.address || "") === String(listing.address || ""));
      const priorIds = [...new Set(previous.map((row) => row.hospitalId))];
      if (priorIds.length === 1) {
        return [...store.hospitals.values()].find((h) => String(h._id) === priorIds[0]) || null;
      }
      if (priorIds.length > 1) return null;
      return uniqueHospitalIdentityMatch(listing, [...store.hospitals.values()]);
    },

    // Creates a minimal, unverified hospital stub from directory-only fields.
    // Never includes facility/specialty data — directories don't provide it.
    async createHospitalStub(listing, sourceId) {
      const hospital = {
        _id: `mem-dir-${idSeq++}`,
        sourceId,
        name: listing.name,
        address: listing.address,
        pincode: listing.pincode,
        phone: listing.phone,
        latitude: listing.latitude,
        longitude: listing.longitude,
        fromDirectory: true,
      };
      store.hospitals.set(`${sourceId}:${listing.name}`, hospital);
      return hospital;
    },

    // Records the directory->hospital link with full provenance, whether the
    // hospital was newly created or matched to an existing one.
    async linkDirectoryListing(sourceId, listing, hospitalId, { matched }) {
      store.directoryListings.push({ sourceId, listing, hospitalId: String(hospitalId), matched });
    },
  };
}
