import test from "node:test";
import assert from "node:assert/strict";
import { encodeHospitalCursor, decodeHospitalCursor, hospitalCursorFilter } from "../src/services/hospitalPagination.js";
test("hospital cursor preserves duplicate-name tie breaker", () => {
  const row = { name: "Hospital A", _id: "507f1f77bcf86cd799439011" };
  const parsed = decodeHospitalCursor(encodeHospitalCursor(row));
  assert.equal(parsed.name, row.name); assert.equal(String(parsed.id), row._id);
  const query = hospitalCursorFilter(parsed);
  assert.equal(query.$or[1].name, row.name); assert.equal(String(query.$or[1]._id.$gt), row._id);
});
test("hospital cursor rejects malformed and injected query values", () => {
  for (const value of [null, {}, "!", Buffer.from(JSON.stringify({ name: { $gt: "" }, id: "507f1f77bcf86cd799439011" })).toString("base64url"), Buffer.from(JSON.stringify({ name: "x", id: "507f1f77bcf86cd799439011", extra: true })).toString("base64url")]) assert.throws(() => decodeHospitalCursor(value), e => e.status === 400);
});
