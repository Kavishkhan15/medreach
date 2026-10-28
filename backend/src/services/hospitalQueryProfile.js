// Read-only query plans; native collections avoid automatic schema/index writes.
export async function profileHospitalQueries(db, { limit = 20 } = {}) {
  const collection = db.collection("hospitals");
  const variants = [
    ["public_name_page", { archivedAt: null, approvalStatus: { $nin: ["pending", "rejected"] } }, { name: 1, _id: 1 }],
    ["public_region_page", { archivedAt: null, approvalStatus: { $nin: ["pending", "rejected"] }, region: "Mumbai" }, { name: 1, _id: 1 }],
  ];
  const results = [];
  for (const [name, filter, sort] of variants) {
    const plan = await collection.find(filter).project({ _id: 1, name: 1 }).sort(sort).limit(limit).explain("executionStats");
    const stats = plan.executionStats;
    results.push({ name, returned: stats.nReturned, documentsExamined: stats.totalDocsExamined,
      keysExamined: stats.totalKeysExamined, executionTimeMs: stats.executionTimeMillis,
      winningPlan: plan.queryPlanner.winningPlan });
  }
  return { recordedAt: new Date().toISOString(), hospitalCount: await collection.countDocuments(), readOnly: true,
    note: "Directory plans only. Derived status filtering also evaluates fresh evidence; these plans do not justify a cached availability summary.", results };
}
