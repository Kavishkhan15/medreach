import test from "node:test";
import assert from "node:assert/strict";
import { canManageHospital } from "../src/services/hospitalAccess.js";

const hospital = { admins: ["staff-1"] };

test("hospital staff may manage only assigned hospitals", () => {
  assert.equal(canManageHospital({ id: "staff-1", role: "hospital_admin" }, hospital), true);
  assert.equal(canManageHospital({ id: "staff-2", role: "hospital_admin" }, hospital), false);
  assert.equal(canManageHospital({ id: "staff-1", role: "user" }, hospital), false);
});

test("system administrators may manage hospitals; missing user never may", () => {
  assert.equal(canManageHospital({ id: "admin", role: "system_admin" }, hospital), true);
  assert.equal(canManageHospital({ id: "admin", role: "admin" }, hospital), false);
  assert.equal(canManageHospital(null, hospital), false);
});
