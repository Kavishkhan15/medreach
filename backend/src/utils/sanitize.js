// Defense-in-depth input handling for the assistant endpoint, on top of
// express-validator's length/type checks in the route. Strips characters that
// have no legitimate place in a chat message and enforces a hard length cap
// so a single request cannot pass an oversized payload into a provider call.
const MAX_MESSAGE_LENGTH = 500;

// Strips control characters (except newline/tab) that could be used to smuggle
// terminal escape sequences or corrupt downstream logging/rendering.
function stripControlChars(input) {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

export function sanitizeMessage(raw) {
  if (typeof raw !== "string") return "";
  return stripControlChars(raw).trim().slice(0, MAX_MESSAGE_LENGTH);
}

export { MAX_MESSAGE_LENGTH };
