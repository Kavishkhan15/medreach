import { Hospital } from "../models/Hospital.js";
import { HospitalFacility } from "../models/HospitalFacility.js";
import { AvailabilityObservation } from "../models/AvailabilityObservation.js";
import { HospitalFieldConflict } from "../models/HospitalFieldConflict.js";
import { HospitalFieldClaim } from "../models/HospitalFieldClaim.js";
import { FacilitySourceClaim } from "../models/FacilitySourceClaim.js";
import { DataSource } from "../models/DataSource.js";
import { composeHospitalEvidence } from "./hospitalDataLoader.js";
import { excludedReadFields } from "./readProjection.js";

const project = fields => Object.fromEntries(fields.split(" ").map(field => [field, 1]));
const observationFields = project("hospital facility observedAt retrievedAt verificationStatus status quantity confidence source verifiedBy");
const claimFields = project("hospital field value source sourcePageUrl sourcePageUrls evidenceText evidenceKind observedAt parserVersion confidence verificationStatus");
const facilityClaimFields = project("hospital facility capability source sourcePageUrl evidenceText evidenceKind observedAt parserVersion confidence verificationStatus");

const sourceJoin = [
  { $lookup: { from: DataSource.collection.name, localField: "source", foreignField: "_id",
    pipeline: [{ $project: project("name type sourceKey url") }], as: "__source" } },
  { $set: { source: { $ifNull: [{ $arrayElemAt: ["$__source", 0] }, null] } } },
  { $unset: "__source" },
];
const lookup = (Model, as, pipeline) => ({ $lookup: { from: Model.collection.name,
  localField: "_id", foreignField: "hospital", pipeline, as } });

export function hospitalEvidenceStages(now) {
  const observations = (field, filter, as) => lookup(AvailabilityObservation, as, [
    { $match: filter }, { $sort: { facility: 1, [field]: -1, _id: -1 } },
    { $group: { _id: "$facility", item: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$item" } }, { $project: observationFields },
  ]);
  return [
    lookup(HospitalFacility, "__facilities", [{ $project: project("hospital facility capability capabilityConflict confidence lastUpdated source") }]),
    observations("observedAt", { observedAt: { $gt: new Date(0), $lte: now } }, "__observed"),
    observations("retrievedAt", { observedAt: null, retrievedAt: { $gt: new Date(0), $lte: now } }, "__retrieved"),
    lookup(HospitalFieldConflict, "__conflicts", [{ $project: { hospital: 1, field: 1, status: 1, sourceCount: { $size: { $ifNull: ["$claims", []] } } } }]),
    lookup(HospitalFieldClaim, "__claims", [{ $project: claimFields }, ...sourceJoin]),
    lookup(FacilitySourceClaim, "__facilityClaims", [{ $project: facilityClaimFields }, ...sourceJoin]),
  ];
}

function composeRows(rows) {
  const hospitals = [], evidence = { facilities: [], observations: [], fieldConflicts: [], fieldClaims: [], facilityClaims: [] };
  for (const row of rows) {
    const { __facilities, __observed, __retrieved, __conflicts, __claims, __facilityClaims, ...hospital } = row;
    hospitals.push(hospital);
    evidence.facilities.push(...__facilities);
    evidence.fieldConflicts.push(...__conflicts);
    evidence.fieldClaims.push(...__claims);
    evidence.facilityClaims.push(...__facilityClaims);
    // Preserve effective timestamp precedence and stable _id ties across both branches.
    const latest = new Map();
    for (const item of [...__observed, ...__retrieved]) {
      const previous = latest.get(item.facility);
      const time = value => new Date(value.observedAt || value.retrievedAt).getTime();
      if (!previous || time(item) > time(previous)
        || (time(item) === time(previous) && String(item._id) > String(previous._id))) latest.set(item.facility, item);
    }
    evidence.observations.push(...latest.values());
  }
  // Check expiry after I/O as well: a slow query cannot extend an observation's life.
  return composeHospitalEvidence(hospitals, evidence, new Date());
}

export function hospitalPagePipeline({ filter, countFilter = filter, skip = 0, limit = 12, projection, includeTotal = true, now = new Date() }) {
  const stages = [{ $match: filter }, { $sort: { name: 1, _id: 1 } }, { $skip: skip }, { $limit: limit },
    { $project: excludedReadFields(Hospital, projection) }, ...hospitalEvidenceStages(now),
    { $replaceWith: { row: "$$ROOT" } }];
  if (includeTotal) stages.push({ $unionWith: { coll: Hospital.collection.name, pipeline: [{ $match: countFilter }, { $count: "total" }] } });
  // unionWith makes no order guarantee. Sort only the bounded page plus count,
  // never all candidate hospitals (as an unbounded facet/sort would do).
  stages.push({ $sort: { "row.name": 1, "row._id": 1 } });
  return stages;
}

export async function readHospitalPage(options) {
  const result = await Hospital.aggregate(hospitalPagePipeline(options));
  return { data: composeRows(result.filter(item => item.row).map(item => item.row)),
    total: options.includeTotal === false ? null : result.find(item => Object.hasOwn(item, "total"))?.total || 0 };
}
