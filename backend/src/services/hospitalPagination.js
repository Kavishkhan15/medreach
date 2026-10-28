import mongoose from "mongoose";
const invalid = () => Object.assign(new Error("Invalid hospital pagination cursor"), { status: 400, code: "INVALID_CURSOR" });
export function decodeHospitalCursor(value) {
  if (typeof value !== "string" || value.length > 1500 || !/^[A-Za-z0-9_-]+$/.test(value)) throw invalid();
  let parsed;
  try { parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { throw invalid(); }
  if (!parsed || typeof parsed.name !== "string" || parsed.name.length > 200 || !mongoose.isObjectIdOrHexString(parsed.id) || Object.keys(parsed).sort().join(",") !== "id,name") throw invalid();
  return { name: parsed.name, id: new mongoose.Types.ObjectId(parsed.id) };
}
export function encodeHospitalCursor(row) {
  return Buffer.from(JSON.stringify({ name: row.name, id: String(row._id) })).toString("base64url");
}
export function hospitalCursorFilter(cursor) {
  return { $or: [{ name: { $gt: cursor.name } }, { name: cursor.name, _id: { $gt: cursor.id } }] };
}
