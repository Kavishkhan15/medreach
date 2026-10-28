import test from "node:test";
import assert from "node:assert/strict";
import { validateBranchGroup, validateOnboarding } from "../src/services/providerAdoption.js";
const id = "507f1f77bcf86cd799439011";
test("branch groups preserve explicit identities and reject duplicate or invented branches", () => {
  assert.equal(validateBranchGroup({ name: "Healthcare group", expectedVersion: 0, branches: [{ kind: "hospital", organizationId: id }] }).branches.length, 1);
  assert.throws(() => validateBranchGroup({ name: "x", expectedVersion: 0, branches: [] }));
  assert.throws(() => validateBranchGroup({ name: "Group", expectedVersion: 0, branches: [{ kind: "hospital", organizationId: id }, { kind: "hospital", organizationId: id }] }));
  assert.throws(() => validateBranchGroup({ name: "Group", expectedVersion: 0, branches: [{ kind: "other", organizationId: id }] }));
  assert.throws(() => validateBranchGroup({ name: "Group", expectedVersion: 0, branches: [null] }), error => error.status === 400);
});
test("onboarding readiness requires explicit evidence and complete operator attestations", () => {
  const checklist = { ownershipReviewed: true, contactReviewed: true, reportingAgreed: true, escalationAgreed: true, responsibilitiesAccepted: true };
  const valid = { expectedVersion: 0, checklist, evidenceRefs: ["review:original-ownership-document"], reason: "Verified by platform operator", status: "ready" };
  assert.equal(validateOnboarding(valid).status, "ready");
  assert.throws(() => validateOnboarding({ ...valid, evidenceRefs: [] }));
  assert.throws(() => validateOnboarding({ ...valid, checklist: { ...checklist, ownershipReviewed: false } }));
  assert.throws(() => validateOnboarding({ ...valid, expectedVersion: -1 }));
  assert.equal(validateOnboarding({ ...valid, checklist: {}, evidenceRefs: [], status: "draft" }).status, "draft");
});
