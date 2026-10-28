// Native-driver reads only. Do not import application models or initialise indexes here.
const classifications = ["demo", "provider_confirmed", "historical_imported", "unknown"];
const knownCollections = ["users", "hospitals", "resourceproviders", "providermemberships", "providerapplications", "jobs", "jobapplications", "emergencyrequests", "bloodrequests", "ambulancebookings", "emaildeliveries", "requestnotifications", "backgroundjobs", "availabilityobservations", "resourceinventories", "inventoryobservations", "auditlogs"];
const boundedIds = (rows) => rows.slice(0, 50).map((row) => String(row._id));

export function assertLocalAuditTarget(uri) {
  if (typeof uri !== "string" || !/^mongodb:\/\/(?:127\.0\.0\.1|localhost):[0-9]+\/medreach$/.test(uri)) {
    throw new Error("Audit requires an explicit single loopback host and the local medreach database; no URI options are accepted.");
  }
  return "medreach";
}

export function classifyDataRecord(record) {
  if (record.demo === true || record.demoAccount === true || record.classification === "demo") return "demo";
  if (classifications.includes(record.classification)) return record.classification;
  if (record.sourceName || record.sourceUrl || record.sourceIds?.length) return "historical_imported";
  return "unknown";
}

const classExpression = { $switch: { branches: [
  { case: { $or: [{ $eq: ["$demo", true] }, { $eq: ["$demoAccount", true] }, { $eq: ["$classification", "demo"] }] }, then: "demo" },
  { case: { $in: ["$classification", classifications] }, then: "$classification" },
  { case: { $or: [{ $gt: [{ $strLenCP: { $ifNull: ["$sourceName", ""] } }, 0] }, { $gt: [{ $strLenCP: { $ifNull: ["$sourceUrl", ""] } }, 0] }, { $gt: [{ $size: { $ifNull: ["$sourceIds", []] } }, 0] }] }, then: "historical_imported" },
], default: "unknown" } };

export async function auditBackendData(db, { now = new Date() } = {}) {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((r) => r.name));
  const collectionCounts = {};
  for (const name of [...new Set([...knownCollections, ...existing])].sort()) collectionCounts[name] = existing.has(name) ? await db.collection(name).countDocuments() : 0;
  const aggregate = async (name, pipeline) => existing.has(name) ? db.collection(name).aggregate(pipeline, { maxTimeMS: 30000 }).toArray() : [];
  const groupCounts = async (name, key) => (await aggregate(name, [{ $group: { _id: { $ifNull: [`$${key}`, "unknown"] }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }])).map((row) => ({ value: row._id, count: row.count }));
  const dataClassifications = {};
  for (const name of ["users", "hospitals", "resourceproviders", "availabilityobservations", "resourceinventories", "inventoryobservations"]) {
    const rows = await aggregate(name, [{ $group: { _id: classExpression, count: { $sum: 1 } } }]);
    dataClassifications[name] = Object.fromEntries(classifications.map((value) => [value, rows.find((r) => r._id === value)?.count || 0]));
  }
  const dangling = async (name, field, target, filter = {}) => {
    const rows = await aggregate(name, [{ $match: { ...filter, [field]: { $exists: true, $ne: null } } }, { $lookup: { from: target, localField: field, foreignField: "_id", as: "auditTarget" } }, { $match: { auditTarget: { $size: 0 } } }, { $facet: { total: [{ $count: "count" }], samples: [{ $project: { _id: 1 } }, { $limit: 50 }] } }]);
    return { count: rows[0]?.total[0]?.count || 0, sampleIds: boundedIds(rows[0]?.samples || []) };
  };
  const duplicateGroups = async (name, fields) => {
    const rows = await aggregate(name, [{ $group: { _id: Object.fromEntries(fields.map((field) => [field, { $toLower: { $trim: { input: { $ifNull: [`$${field}`, ""] } } } }])), count: { $sum: 1 }, ids: { $push: "$_id" } } }, { $match: { count: { $gt: 1 } } }, { $facet: { total: [{ $count: "count" }], samples: [{ $limit: 50 }, { $project: { _id: 0, count: 1, ids: { $slice: ["$ids", 50] } } }] } }]);
    return { groups: rows[0]?.total[0]?.count || 0, samples: (rows[0]?.samples || []).map((row) => ({ count: row.count, ids: row.ids.map(String) })), interpretation: "Candidates for manual review only; matching names do not establish identity." };
  };
  const membershipDependencies = {
    missingUser: await dangling("providermemberships", "user", "users"),
    missingHospital: await dangling("providermemberships", "organization", "hospitals", { kind: "hospital" }),
    missingResourceProvider: await dangling("providermemberships", "organization", "resourceproviders", { kind: { $in: ["blood_bank", "diagnostic", "ambulance"] } }),
    providerMissingHospital: await dangling("resourceproviders", "hospital", "hospitals"),
  };
  const dependencies = {};
  for (const name of ["emergencyrequests", "bloodrequests", "ambulancebookings"]) dependencies[name] = await dangling(name, "user", "users");
  dependencies.jobApplicants = await dangling("jobapplications", "applicant", "users");
  dependencies.jobApplications = await dangling("jobapplications", "job", "jobs");
  dependencies.emergencyHospitals = await dangling("emergencyrequests", "hospital", "hospitals");
  dependencies.bloodProviders = await dangling("bloodrequests", "provider", "resourceproviders");
  dependencies.ambulanceProviders = await dangling("ambulancebookings", "provider", "resourceproviders");
  dependencies.hospitalJobs = await dangling("jobs", "hospital", "hospitals");
  dependencies.providerJobs = await dangling("jobs", "provider", "resourceproviders");
  dependencies.notificationRecipients = await dangling("requestnotifications", "recipient", "users");
  const invalidMemberRoles = await aggregate("providermemberships", [{ $match: { active: true } }, { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "account" } }, { $match: { "account.role": { $ne: "provider_admin" } } }, { $facet: { total: [{ $count: "count" }], samples: [{ $project: { _id: 1 } }, { $limit: 50 }] } }]);
  membershipDependencies.activeNonProviderAccounts = { count: invalidMemberRoles[0]?.total[0]?.count || 0, sampleIds: boundedIds(invalidMemberRoles[0]?.samples || []) };
  const relatedOrganizations = await aggregate("resourceproviders", [{ $match: { hospital: { $exists: true, $ne: null } } }, { $group: { _id: "$hospital", providerCount: { $sum: 1 }, kinds: { $addToSet: "$kind" }, providerIds: { $push: "$_id" } } }, { $sort: { _id: 1 } }, { $limit: 50 }]);
  const roles = await groupCounts("users", "role");
  const activeSystemAdmins = existing.has("users") ? await db.collection("users").countDocuments({ role: "system_admin", accountStatus: "active" }) : 0;
  const legacyAccounts = existing.has("users") ? await db.collection("users").find({ role: { $in: ["admin", "hospital_admin", "user_admin"] } }, { projection: { _id: 1, role: 1, accountStatus: 1 } }).limit(50).toArray() : [];
  const staleInventoryCount = existing.has("resourceinventories") ? await db.collection("resourceinventories").countDocuments({ $or: [{ observedAt: null }, { observedAt: { $lt: new Date(now.getTime() - 30 * 60000) } }] }) : 0;
  return { readOnly: true, migrationApplied: false, database: db.databaseName, generatedAt: now.toISOString(),
    consistency: "Live read-only observations; counts may change if the application writes during this audit.", collectionCounts,
    accounts: { roles, statuses: await groupCounts("users", "accountStatus"), activeSystemAdmins, legacyAccounts: legacyAccounts.map((row) => ({ id: String(row._id), role: row.role, status: row.accountStatus || "unknown" })) },
    systemAdminLockoutRisk: activeSystemAdmins === 0, dataClassifications,
    classificationPolicy: "Explicit stored classifications take precedence; demo markers remain demo. Source metadata implies historical/imported only. Legacy verification badges never imply provider-confirmed live availability. No records are changed.",
    membershipDependencies, membershipKinds: await groupCounts("providermemberships", "kind"), membershipActiveStates: await groupCounts("providermemberships", "active"), dependencies,
    duplicates: { accountsByNormalizedLogin: await duplicateGroups("users", ["email"]), hospitalsByNameCity: await duplicateGroups("hospitals", ["name", "city"]), providersByKindNameCity: await duplicateGroups("resourceproviders", ["kind", "name", "city"]) },
    relatedOrganizations: relatedOrganizations.map((r) => ({ hospitalId: String(r._id), providerCount: r.providerCount, kinds: r.kinds, providerIds: r.providerIds.slice(0, 50).map(String) })),
    hospitalApprovals: await groupCounts("hospitals", "approvalStatus"), providerApprovals: await groupCounts("resourceproviders", "approvalStatus"), providerKinds: await groupCounts("resourceproviders", "kind"),
    requestStatuses: Object.fromEntries(await Promise.all(["emergencyrequests", "bloodrequests", "ambulancebookings"].map(async (name) => [name, await groupCounts(name, "status")]))),
    notificationStatuses: await groupCounts("emaildeliveries", "status"), notificationLifecycleStatuses: await groupCounts("emaildeliveries", "lifecycleStatus"), requestNotificationStatuses: await groupCounts("requestnotifications", "status"), backgroundJobStatuses: await groupCounts("backgroundjobs", "status"), staleOrUnknownInventory: staleInventoryCount,
    reportPrivacy: "Names, contact addresses, passwords, hashes, tokens, request contents and connection strings are excluded. Record IDs are bounded samples for manual review. No deletion or migration is proposed automatically." };
}
