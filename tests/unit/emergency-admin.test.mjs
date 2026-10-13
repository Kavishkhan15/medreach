import test from 'node:test';
import assert from 'node:assert/strict';
import { adminList } from '../../packages/core/src/adminState.js';
import { adminList as bootstrapAdminList } from '../../variants/bootstrap/_core/adminState.js';

const historical = { _id: 'historical-request', requestId: 'MR-HISTORY', status: 'EXPIRED', isEmergency: true, hospital: null, createdAt: '2026-10-01T12:00:00Z' };
for (const [variant, list] of [['shared', adminList], ['bootstrap', bootstrapAdminList]]) {
  test(`${variant}: emergency summaries preserve historical requests with unavailable hospitals and genuine empty results`, () => {
    const parse = list('emergencyRequest');
    const current = { ...historical, _id: 'current', hospital: { _id: 'h', name: 'Assigned hospital' }, status: 'REQUESTED' };
    assert.deepEqual(parse({ data: [historical, current] }), [historical, current]);
    assert.deepEqual(parse({ data: [] }), []);
    const closedLegacy = { ...historical }; delete closedLegacy.isEmergency;
    assert.deepEqual(parse({ data: [closedLegacy] }), [closedLegacy]);
  });
  test(`${variant}: malformed emergency summaries never become genuine empty results`, () => {
    const parse = list('emergencyRequest');
    for (const response of [{}, { data: null }, { data: [null] }, { data: [{ ...historical, hospital: {} }] }, { data: [{ ...historical, isEmergency: 'true' }] }, { data: [{ ...historical, status: "REQUESTED", isEmergency: undefined }] }, { data: [{ ...historical, status: null }] }]) {
      assert.throws(() => parse(response), { code: 'INVALID_RESPONSE' });
    }
    // Actionable staff workflows must keep their stricter validation.
    assert.throws(() => list('staffRequest')({ data: [{ ...historical, timeline: [], expiresAt: '2026-10-02T12:00:00Z' }] }), { code: 'INVALID_RESPONSE' });
  });
}
