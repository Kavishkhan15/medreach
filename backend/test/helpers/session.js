import { issueSession } from "../../src/services/authTokenService.js";
import { signToken } from "../../src/utils/token.js";

// Integration fixtures exercise the same persisted refresh-session requirement as login.
export async function signSessionToken(user) {
  const { entry } = await issueSession(user);
  return signToken(user, entry.familyId);
}
