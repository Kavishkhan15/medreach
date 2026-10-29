import { Hospital } from "../models/Hospital.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { excludedReadFields } from "./readProjection.js";

// Parent archival is tested in the same database command as the provider read;
// no cached/global list of archived hospitals can become stale between reads.
export function publicResourcePipeline(filter, { limit = 100 } = {}) {
  return [
    { $match: { ...filter, archivedAt: null, approvalStatus: { $nin: ["pending", "rejected"] }, active: { $ne: false } } },
    { $sort: { verificationStatus: 1, name: 1 } },
    { $lookup: { from: Hospital.collection.name, localField: "hospital", foreignField: "_id",
      pipeline: [{ $match: { archivedAt: { $ne: null } } }, { $project: { _id: 1 } }], as: "__archivedParent" } },
    { $match: { "__archivedParent.0": { $exists: false } } },
    { $limit: limit },
    { $project: { ...excludedReadFields(ResourceProvider, "-email"), __archivedParent: 0 } },
  ];
}

export const readPublicResources = (filter, options) => ResourceProvider.aggregate(publicResourcePipeline(filter, options));
