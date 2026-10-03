import mongoose from "mongoose";
import { User } from "../../src/models/User.js";
import { AuthToken } from "../../src/models/AuthToken.js";
import { signToken } from "../../src/utils/token.js";

const users = new Map();
export function installAuthMocks(t) {
  users.clear();
  const descriptor = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
  Object.defineProperty(mongoose.connection, "readyState", { configurable: true, get: () => 1 });
  t.after(() => {
    if (descriptor) Object.defineProperty(mongoose.connection, "readyState", descriptor);
    else delete mongoose.connection.readyState;
  });
  t.mock.method(User, "findById", (id) => ({ select: () => ({ lean: async () => users.get(String(id)) }) }));
  t.mock.method(AuthToken, "exists", async (filter) => users.has(String(filter.user)) ? { _id: "unit-session" } : null);
}
export function signMockToken(user, sessionId = "unit-session") {
  users.set(String(user._id), { accountStatus: "active", ...user });
  return signToken(user, sessionId);
}
