import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminList, adminOverviewData, adminAnalyticsData, adminEntity, adminErrorMessage, adminAvailabilityData, loadAdminHospitals } from '../../packages/core/src/adminState.js';

test('admin lists accept explicit empty results and reject absent, null and malformed records', () => {
  const parse = adminList('audit');
  assert.deepEqual(parse({ data: [] }), []);
  for (const response of [{}, { data: null }, { data: {} }, { data: [null] }, { data: [{ _id: 'a', action: {} }] }]) {
    assert.throws(() => parse(response), { code: 'INVALID_RESPONSE' });
  }
});
test('counts must be genuine non-negative integer response values', () => {
  assert.equal(adminOverviewData({ hospitals: 0, verified: 0, verificationQueue: 0 }).hospitals, 0);
  for (const hospitals of [undefined, null, '0', -1, NaN, Infinity]) assert.throws(() => adminOverviewData({ hospitals, verified: 0, verificationQueue: 0 }));
  assert.throws(() => adminAnalyticsData({ hospitals: { total: 0, verified: 0 }, conflicts: { facility: 0, field: 0 }, resources: null, jobs: [], applications: [], emergencyRequests: [] }));
});
test('write confirmations require an expected entity or acknowledgement', () => {
  for (const response of [{}, { hospital: null }, { hospital: { _id: 'h' } }]) assert.throws(() => adminEntity('hospital')(response));
  assert.equal(adminEntity('hospital')({ hospital: { _id: 'h', name: 'Hospital', slug: 'hospital' } })._id, 'h');
  // Mutation envelopes contain unpopulated IDs; list endpoints populate names.
  assert.equal(adminEntity('request')({ request: { _id: 'r', requestId: 'MR-TEST', status: 'UNDER_REVIEW', hospital: 'h' } })._id, 'r');
  assert.equal(adminEntity('job')({ job: { _id: 'j', title: 'Nurse', status: 'draft', hospital: 'h' } })._id, 'j');
});
test('admin messages distinguish permissions, sessions, validation and uncertain writes without server details', () => {
  assert.match(adminErrorMessage({ status: 403, message: 'SECRET' }), /permission/);
  assert.match(adminErrorMessage({ status: 401 }), /Sign in/);
  assert.match(adminErrorMessage({ status: 422 }), /Check the fields/);
  assert.match(adminErrorMessage({ status: 503, message: 'SECRET' }, true), /may have completed/);
  assert.doesNotMatch(adminErrorMessage({ message: 'SECRET' }), /SECRET/);
});
test('complete hospital reads use every page and reject missing pagination', async () => {
  const fetch = globalThis.fetch;
  const pages = [];
  globalThis.fetch = async (url) => {
    const page = Number(new URL(url).searchParams.get('page')); pages.push(page);
    return new Response(JSON.stringify({ data: [{ _id: String(page), name: 'Hospital', slug: 'hospital' }], page, perPage: 1, total: 2 }), { status: 200 });
  };
  try {
    assert.equal((await loadAdminHospitals(new AbortController().signal)).data.length, 2);
    assert.deepEqual(pages, [1, 2]);
    globalThis.fetch = async () => new Response('{"data":[]}', { status: 200 });
    await assert.rejects(() => loadAdminHospitals(new AbortController().signal), { code: 'INVALID_RESPONSE' });
  } finally { globalThis.fetch = fetch; }
});

test('availability distinguishes a genuine zero history from malformed current data', () => {
  assert.equal(adminAvailabilityData({ observations: 0, latest: [] }).observations, 0);
  for (const response of [{ latest: [] }, { observations: 0, latest: null }, { observations: 1, latest: [{ facility: 'ICU' }] }]) assert.throws(() => adminAvailabilityData(response), { code: 'INVALID_RESPONSE' });
});

test('staff request filtering cannot mistake missing hospital references for an empty assignment', () => {
  const parse = adminList('staffRequest');
  const request = { _id: 'r', requestId: 'MR-TEST', status: 'SENT', timeline: [], expiresAt: '2026-10-12T00:00:00Z' };
  for (const hospital of [undefined, null, {}, { name: 'Hospital' }]) assert.throws(() => parse({ data: [{ ...request, hospital }] }), { code: 'INVALID_RESPONSE' });
  assert.equal(parse({ data: [{ ...request, hospital: 'h' }] }).length, 1);
});
