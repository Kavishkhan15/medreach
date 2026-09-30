// Idempotent auth/security migration for existing MongoDB deployments.
// Adds the session invalidation counter to legacy users and synchronizes only
// the indexes owned by the affected models. It never reads or prints secrets.
import { connectDB, disconnectDB } from "../src/config/db.js";
import { User } from "../src/models/User.js";
import { AuthToken } from "../src/models/AuthToken.js";

async function main() {
  await connectDB();
  const users = await User.updateMany({ authVersion: { $exists: false } }, { $set: { authVersion: 0 } });
  // These fields belong to the retired sign-in flow. Keep user accounts intact;
  // passwordless accounts can establish a password through email recovery.
  const retiredSubjects = await User.collection.updateMany({ googleSubject: { $exists: true } },
    { $unset: { googleSubject: "" } });
  const retiredStates = await AuthToken.collection.deleteMany({ purpose: "oauth_state" });
  await Promise.all([User.syncIndexes(), AuthToken.syncIndexes()]);
  console.log(`[medreach] auth migration complete; users initialized: ${users.modifiedCount || 0}; retired subjects removed: ${retiredSubjects.modifiedCount || 0}; transient states removed: ${retiredStates.deletedCount || 0}`);
}

main().then(disconnectDB).catch(async (error) => {
  console.error("[medreach] auth migration failed", { name: error.name, code: error.code });
  await disconnectDB();
  process.exitCode = 1;
});
