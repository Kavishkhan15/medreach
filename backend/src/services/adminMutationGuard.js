import { User } from "../models/User.js";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
const schema = new mongoose.Schema({ _id: String, owner: String, expiresAt: Date });
const Lock = mongoose.model("AdminMutationLock", schema);
// Serialize role/status changes across API processes. Contention fails closed;
// a dead process releases its lease after expiry. No account is changed on failure.
export async function guardAdminMutation(operation) {
  const owner = randomUUID(), now = new Date();
  const lock = await Lock.findOneAndUpdate({ _id: "account-access", expiresAt: { $lte: now } },
    { $set: { owner, expiresAt: new Date(Date.now() + 300000) } }, { new: true });
  if (!lock) {
    try { await Lock.create({ _id: "account-access", owner, expiresAt: new Date(Date.now() + 300000) }); }
    catch (error) { if (error.code === 11000) throw Object.assign(new Error("Another account change is processing"), { status: 409 }); throw error; }
  }
  let lost = false;
  const assertHeld = async () => {
    if (lost || !await Lock.exists({ _id: "account-access", owner, expiresAt: { $gt: new Date() } })) {
      throw Object.assign(new Error("Account change lease expired; refresh before retrying"), { status: 409 });
    }
  };
  const renewal = setInterval(() => {
    Lock.updateOne({ _id: "account-access", owner, expiresAt: { $gt: new Date() } },
      { $set: { expiresAt: new Date(Date.now() + 300000) } })
      .then((result) => { if (!result.matchedCount) lost = true; }).catch(() => { lost = true; });
  }, 30000);
  renewal.unref();
  try { await assertHeld(); return await operation(assertHeld); }
  finally { clearInterval(renewal); await Lock.deleteOne({ _id: "account-access", owner }); }
}

// Recheck access after obtaining the lock: middleware may have run before a
// concurrent demotion completed. All System Admin account writers use this.
export async function guardSystemAdminMutation(actorId, operation) {
  return guardAdminMutation(async (assertHeld) => {
    if (!await User.exists({ _id: actorId, role: "system_admin", accountStatus: "active" })) {
      throw Object.assign(new Error("System administrator access is required"), { status: 403 });
    }
    return operation(assertHeld);
  });
}
