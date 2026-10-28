import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { Hospital } from '../src/models/Hospital.js';
import { ProviderMembership } from '../src/models/ProviderMembership.js';
import { ResourceInventory } from '../src/models/ResourceInventory.js';
import { providerReportingReadiness } from '../src/services/providerReportingReadiness.js';
const uri = process.env.MEDREACH_PROVIDER_ADOPTION_TEST_MONGO_URI;
const safe = /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/medreach_provider_adoption_test$/.test(uri || '');
test('reporting responsibility review uses current exact assignments and reveals no contacts', {
  skip: !safe,
  timeout: 30000
}, async t => {
  await mongoose.connect(uri);
  assert.equal(mongoose.connection.name, 'medreach_provider_adoption_test');
  await mongoose.connection.dropDatabase();
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  const [provider, other, disabled] = await User.create([{
    name: 'Fixture provider',
    email: 'reporter@example.test',
    role: 'provider_admin',
    accountStatus: 'active',
    notificationsEnabled: true,
    notificationEmail: 'PRIVATE-CONTACT@example.test',
    notificationEmailVerifiedAt: new Date()
  }, {
    name: 'Other fixture',
    email: 'other@example.test',
    role: 'provider_admin',
    accountStatus: 'active'
  }, {
    name: 'Disabled fixture',
    email: 'disabled@example.test',
    role: 'provider_admin',
    accountStatus: 'suspended'
  }]);
  const hospital = await Hospital.create({
    name: 'Synthetic reporting hospital',
    approvalStatus: 'approved'
  });
  const memberships = await ProviderMembership.create([{
    user: provider._id,
    organization: hospital._id,
    kind: 'hospital',
    assignedBy: provider._id
  }, {
    user: disabled._id,
    organization: hospital._id,
    kind: 'hospital',
    assignedBy: provider._id
  }]);
  await ResourceInventory.create({
    kind: 'hospital',
    organization: hospital._id,
    resourceKey: 'general_beds',
    unit: 'beds',
    capacity: 50,
    available: 0,
    observedAt: new Date(),
    updatedBy: provider._id,
    version: 1,
    classification: 'provider_confirmed',
    reportingMethod: 'provider_report'
  });
  const scope = {
    actor: {
      id: provider.id
    },
    kind: 'hospital',
    organizationId: hospital.id
  };
  const report = await providerReportingReadiness(scope);
  assert.equal(report.capableReporterCount, 1);
  assert.equal(report.reportingContactVerified, true);
  assert.equal(report.resources.find(row => row.resourceKey === 'general_beds').available, 0);
  assert.equal(report.resources.find(row => row.resourceKey === 'general_beds').reporterCurrentlyAssigned, true);
  assert.deepEqual(report.missingRequiredResources, ['icu_beds']);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE-CONTACT|reporter@example|Fixture provider/);
  await assert.rejects(providerReportingReadiness({
    ...scope,
    actor: {
      id: other.id,
      role: 'system_admin'
    }
  }), error => error.status === 403);
  await ProviderMembership.updateOne({
    _id: memberships[0]._id
  }, {
    $set: {
      active: false
    }
  });
  await assert.rejects(providerReportingReadiness(scope), error => error.status === 403);
});
