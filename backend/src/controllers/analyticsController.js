import { Hospital } from "../models/Hospital.js";
import { HospitalFacility } from "../models/HospitalFacility.js";
import { ResourceProvider } from "../models/ResourceProvider.js";
import { EmergencyRequest } from "../models/EmergencyRequest.js";
import { Job } from "../models/Job.js";
import { JobApplication } from "../models/JobApplication.js";
import { DataSource } from "../models/DataSource.js";
import { CrawlJob } from "../models/CrawlJob.js";
import { DataConflict } from "../models/DataConflict.js";
import { HospitalFieldConflict } from "../models/HospitalFieldConflict.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const countBy = async (model, field, filter = {}) => model.aggregate([{ $match: filter },
  { $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 30 }]);

export const analyticsOverview = asyncHandler(async (_req, res) => {
  const [hospitals, verified, byLocality, byType, facilities, resources, requests, jobs, applications,
    sources, crawls, facilityConflicts, fieldConflicts] = await Promise.all([
    Hospital.countDocuments(), Hospital.countDocuments({ verificationStatus: "verified" }),
    countBy(Hospital, "locality"), countBy(Hospital, "hospitalType"), countBy(HospitalFacility, "facility"),
    countBy(ResourceProvider, "kind"), countBy(EmergencyRequest, "status"), countBy(Job, "status"),
    countBy(JobApplication, "status"), countBy(DataSource, "healthStatus", { sourceKey: { $exists: true } }),
    countBy(CrawlJob, "status"), DataConflict.countDocuments({ status: "open" }),
    HospitalFieldConflict.countDocuments({ status: "open" }),
  ]);
  res.json({ hospitals: { total: hospitals, verified, byLocality, byType, facilityCoverage: facilities },
    resources, emergencyRequests: requests, jobs, applications, sources, crawls,
    conflicts: { facility: facilityConflicts, field: fieldConflicts } });
});
