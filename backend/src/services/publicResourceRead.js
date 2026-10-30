import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { excludedReadFields } from "./readProjection.js";

// Parent archival is tested in the same database command as the provider read;
// no cached/global list of archived hospitals can become stale between reads.
const directoryFields = Object.fromEntries("_id kind name hospital address locality city phone website operatingHours services listedBloodGroups providerType coverageArea location verificationStatus confidence approvalStatus demo".split(" ").map(field => [field, 1]));
export function publicResourcePipeline(filter, { limit = 100, skip = 0, summary = false } = {}) {
  return [
    { $match: { ...filter, archivedAt: null, approvalStatus: { $nin: ["pending", "rejected"] }, active: { $ne: false } } },
    { $sort: { verificationStatus: 1, name: 1, _id: 1 } },
    { $lookup: { from: Hospital.collection.name, localField: "hospital", foreignField: "_id",
      pipeline: [{ $match: { archivedAt: { $ne: null } } }, { $project: { _id: 1 } }], as: "__archivedParent" } },
    { $match: { "__archivedParent.0": { $exists: false } } },
    { $skip: skip },
    { $limit: limit },
    { $project: summary ? directoryFields : { ...excludedReadFields(ResourceProvider, "-email"), __archivedParent: 0 } },
  ];
}

export const readPublicResources = (filter, options) => ResourceProvider.aggregate(publicResourcePipeline(filter, options));
