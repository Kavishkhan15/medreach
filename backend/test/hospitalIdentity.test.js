import test from "node:test";
import assert from "node:assert/strict";
import { canonicalHospitalName, uniqueHospitalIdentityMatch } from "../src/services/hospitalIdentity.js";

test("identity matching requires an exact canonical name and pincode", () => {
  const candidates = [
    { _id: "a", name: "Lilavati Hospital & Research Centre", pincode: "400050" },
    { _id: "b", name: "Lilavati Hospital North", pincode: "400050" },
    { _id: "c", name: "Lilavati Hospital and Research Centre", pincode: "400053" },
  ];
  assert.equal(canonicalHospitalName("Lilavati Hospital & Research Centre"), canonicalHospitalName("Lilavati Hospital and Research Centre"));
  assert.equal(uniqueHospitalIdentityMatch({ name: "Lilavati Hospital and Research Centre", pincode: "400050" }, candidates)?._id, "a");
  assert.equal(uniqueHospitalIdentityMatch({ name: "Lilavati Hospital", pincode: "400050" }, candidates), null);
  assert.equal(uniqueHospitalIdentityMatch({ name: "Lilavati Hospital and Research Centre" }, candidates), null);
  assert.equal(uniqueHospitalIdentityMatch({ name: "Lilavati Hospital and Research Centre", pincode: "400050" }, [...candidates, { _id: "d", name: candidates[0].name, pincode: "400050" }]), null);
  assert.equal(uniqueHospitalIdentityMatch({ name: "Lilavati Hospital & Research Centre", pincode: "400050", address: "West Wing" }, [{ ...candidates[0], address: "East Wing" }]), null);
});
