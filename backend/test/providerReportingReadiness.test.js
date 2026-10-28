import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportingReadiness } from '../src/services/providerReportingReadiness.js';
const now = new Date('2026-10-27T10:00:00Z');
test('reporting review distinguishes absent, unknown, zero, demo and overdue observations', () => {
  const report = buildReportingReadiness({
    kind: 'hospital',
    now,
    reportingAgreed: false,
    reporters: [],
    inventory: [{
      resourceKey: 'general_beds',
      unit: 'beds',
      available: 0,
      capacity: 50,
      classification: 'provider_confirmed',
      observedAt: new Date(+now - 60000),
      updatedBy: 'known'
    }, {
      resourceKey: 'icu_beds',
      unit: 'beds',
      available: 15,
      classification: 'demo',
      observedAt: new Date(+now - 60000)
    }, {
      resourceKey: 'nicu_beds',
      unit: 'beds',
      available: 2,
      classification: 'provider_confirmed',
      observedAt: new Date(+now - 1800001),
      updatedBy: 'known'
    }]
  });
  assert.equal(report.resources.find(r => r.resourceKey === 'general_beds').available, 0);
  assert.equal(report.resources.find(r => r.resourceKey === 'icu_beds').available, null);
  assert.equal(report.resources.find(r => r.resourceKey === 'nicu_beds').available, null);
  assert.deepEqual(report.overdueResourceKeys, ['nicu_beds']);
  assert.ok(report.actions.includes('ASSIGN_ACTIVE_REPORTER'));
  assert.ok(report.actions.includes('RECORD_REPORTING_RESPONSIBILITY'));
  assert.equal(report.clinicalReadinessImplied, false);
  assert.equal(report.individualResponsibilityEstablished, false);
  assert.ok(report.actions.includes('VERIFY_NAMED_REPORTING_OWNER_AND_COVERAGE'));
});
test('missing resource observations remain unknown and contact ownership is independently reviewed', () => {
  const report = buildReportingReadiness({
    kind: 'hospital',
    now,
    reportingAgreed: true,
    reporters: [{
      id: 'known',
      verifiedContact: false
    }],
    inventory: []
  });
  assert.deepEqual(report.missingRequiredResources, ['general_beds', 'icu_beds']);
  assert.ok(report.resources.every(row => row.available === null));
  assert.ok(report.actions.includes('VERIFY_REPORTER_CONTACT'));
  assert.equal(report.reportingContactVerified, false);
});
