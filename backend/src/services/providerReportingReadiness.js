import mongoose from 'mongoose';
import { ResourceInventory } from '../models/ResourceInventory.js';
import { ProviderMembership, PROVIDER_KINDS } from '../models/ProviderMembership.js';
import { User } from '../models/User.js';
import { ProviderOnboarding } from '../models/providerAdoptionModels.js';
import { publicInventorySnapshot } from './inventoryService.js';
import { organizationIsAvailable } from './providerLifecycle.js';
import { assertProviderPermission } from './providerPermissions.js';
const fail = (status, code) => Object.assign(new Error(code), {
  status,
  code
});
const MAX_AGE = 30 * 60 * 1000;
/** Read-only operating review. Membership capability is not an attested owner. */
export function buildReportingReadiness({
  kind,
  inventory = [],
  reporters = [],
  reportingAgreed = false,
  now = new Date()
}) {
  if (!PROVIDER_KINDS.includes(kind) || !(now instanceof Date) || !Number.isFinite(+now)) throw new TypeError('Invalid reporting review');
  const required = kind === 'hospital' ? ['general_beds', 'icu_beds'] : [];
  const missingRequiredResources = required.filter(key => !inventory.some(row => row.resourceKey === key));
  const rows = [...inventory, ...missingRequiredResources.map(resourceKey => ({
    resourceKey,
    unit: 'beds',
    classification: 'unknown'
  }))];
  const reporterIds = new Set(reporters.map(row => String(row.id)));
  const resources = rows.map(row => {
    const snapshot = publicInventorySnapshot(row, now);
    const at = row.observedAt ? new Date(row.observedAt).getTime() : NaN;
    return {
      ...snapshot,
      overdue: row.classification === 'provider_confirmed' && Number.isFinite(at) && at > 0 && at <= +now && +now - at > MAX_AGE,
      observationAttributed: Boolean(row.updatedBy),
      reporterCurrentlyAssigned: Boolean(row.updatedBy && reporterIds.has(String(row.updatedBy)))
    };
  });
  const overdueResourceKeys = resources.filter(row => row.overdue).map(row => row.resourceKey);
  // The current model records an agreement and capable staff, but no attested
  // individual coverage owner. Never infer that ownership from membership.
  const actions = ['VERIFY_NAMED_REPORTING_OWNER_AND_COVERAGE'];
  if (!reporters.length) actions.push('ASSIGN_ACTIVE_REPORTER');
  const reportingContactVerified = reporters.some(row => row.verifiedContact);
  if (!reportingContactVerified) actions.push('VERIFY_REPORTER_CONTACT');
  if (!reportingAgreed) actions.push('RECORD_REPORTING_RESPONSIBILITY');
  if (missingRequiredResources.length || resources.some(row => row.status === 'unknown')) actions.push('VERIFY_CURRENT_OBSERVATION');
  if (overdueResourceKeys.length) actions.push('VERIFY_OVERDUE_RESOURCE');
  if (resources.some(row => row.classification === 'provider_confirmed' && !row.reporterCurrentlyAssigned)) actions.push('REVIEW_OBSERVATION_ATTRIBUTION');
  return {
    checkedAt: now,
    maximumObservationAgeMinutes: 30,
    capableReporterCount: reporters.length,
    reportingContactVerified,
    reportingAgreementRecorded: reportingAgreed,
    individualResponsibilityEstablished: false,
    missingRequiredResources,
    overdueResourceKeys,
    resources,
    actions,
    containsPatientData: false,
    clinicalReadinessImplied: false,
    note: 'Current membership shows reporting capability, not individual responsibility. Verify an explicit reporting agreement and coverage owner. No contact details or historical relationships are changed.'
  };
}
export async function providerReportingReadiness({
  actor,
  kind,
  organizationId,
  now = new Date()
}) {
  if (!PROVIDER_KINDS.includes(kind) || !mongoose.isObjectIdOrHexString(organizationId) || !mongoose.isObjectIdOrHexString(actor?.id)) throw fail(400, 'INVALID_REPORTING_SCOPE');
  const user = await User.findOne({
    _id: actor.id,
    accountStatus: 'active'
  }).select('role').lean();
  if (!user) throw fail(403, 'REPORTING_SCOPE_FORBIDDEN');
  if (user.role !== 'system_admin') await assertProviderPermission({
    actor,
    kind,
    organizationId,
    permission: 'inventory:read'
  });
  if (!(await organizationIsAvailable(kind, organizationId))) throw fail(404, 'ORGANIZATION_NOT_FOUND');
  const [members, inventory, onboarding] = await Promise.all([ProviderMembership.find({
    kind,
    organization: organizationId,
    active: true,
    $or: [{
      accessLevel: {
        $in: ['admin', 'inventory_reporter']
      }
    }, {
      accessLevel: {
        $exists: false
      }
    }]
  }).select('user').limit(101).lean(), ResourceInventory.find({
    kind,
    organization: organizationId
  }).select('resourceKey unit capacity available observedAt updatedBy version classification reportingMethod').limit(101).lean(), ProviderOnboarding.findOne({
    kind,
    organization: organizationId
  }).select('checklist.reportingAgreed').lean()]);
  if (members.length > 100 || inventory.length > 100) throw fail(413, 'REPORTING_REVIEW_LIMIT');
  const users = await User.find({
    _id: {
      $in: members.map(row => row.user)
    },
    role: 'provider_admin',
    accountStatus: 'active'
  }).select('_id notificationsEnabled notificationEmail notificationEmailVerifiedAt').lean();
  const reporters = users.map(row => ({
    id: row._id,
    verifiedContact: Boolean(row.notificationsEnabled && row.notificationEmail && row.notificationEmailVerifiedAt)
  }));
  return {
    kind,
    organizationId,
    ...buildReportingReadiness({
      kind,
      inventory,
      reporters,
      reportingAgreed: onboarding?.checklist?.reportingAgreed === true,
      now
    })
  };
}
