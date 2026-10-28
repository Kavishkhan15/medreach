import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateDisabledOperationsPlan, validateProbeReceiver } from '../scripts/validateLocalOperationsPlan.js';
test('operations schedule remains disabled with automatic deletion and unapproved targets prohibited', async () => {
 const plan = JSON.parse(await readFile(new URL('../operations/local-staging/operations-plan.json', import.meta.url), 'utf8'));
 assert.equal(validateDisabledOperationsPlan(plan).safeDisabledDraft, true);
 for (const change of [{ automaticDeletionEnabled: true }, { schedulerInstalled: true }, { backup: { ...plan.backup, enabled: true } }, { draftRecoveryTargets: { ...plan.draftRecoveryTargets, approved: true } }]) assert.throws(() => validateDisabledOperationsPlan({ ...plan, ...change }), /UNSAFE_OR_APPROVAL/);
});
test('offline probe receiver validation requires HTTPS, no URL credentials and private persistent-state location', () => {
 const good = { readinessUrl: 'https://staging.invalid/health/ready', receiverUrl: 'https://monitor.invalid/alerts', receiverSecret: 'x'.repeat(32), statePath: '/private/probe-state.json' };
 assert.deepEqual(validateProbeReceiver(good), { configurationValid: true, connectivityTested: false, deliveryVerified: false });
 for (const change of [{ readinessUrl: 'http://staging.invalid' }, { receiverUrl: 'https://user:secret@monitor.invalid' }, { receiverUrl: 'https://monitor.invalid/#fragment' }, { receiverSecret: 'short' }, { statePath: 'relative.json' }]) assert.throws(() => validateProbeReceiver({ ...good, ...change }), /CONFIG_INVALID/);
});
