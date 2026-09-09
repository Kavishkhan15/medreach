// In-memory repository implementing the PersistenceService repo contract.
// Used for --dry-run and for running the crawler without a live MongoDB, and by
// unit tests. Keeps the crawler testable with zero database dependency.

export function createMemoryRepo(seed = {}) {
  const store = {
    hospitals: new Map(seed.hospitals || []), // sourceId -> hospital
    previous: new Map(seed.previous || []),   // hospitalId -> normalized record
    facilities: [],
    observations: [],
    anomalies: [],
  };
  let idSeq = 1;

  return {
    store,
    async findHospitalBySourceId(sourceId) {
      return store.hospitals.get(sourceId) || null;
    },
    async getPreviousRecord(hospitalId) {
      return store.previous.get(String(hospitalId)) || null;
    },
    async upsertHospital(record) {
      const sourceId = record?.provenance?.sourceId ?? null;
      let hospital = store.hospitals.get(sourceId);
      if (!hospital) {
        hospital = { _id: `mem-${idSeq++}`, sourceId, name: record.hospital.name };
        store.hospitals.set(sourceId, hospital);
      }
      hospital.name = record.hospital.name;
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
      store.previous.set(String(hospitalId), record);
    },
    async flagAnomaly(sourceId, info) {
      store.anomalies.push({ sourceId, ...info });
    },
  };
}
