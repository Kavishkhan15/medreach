/** Offline validation only: never installs a scheduler or contacts endpoints. */
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
export function validateProbeReceiver({ readinessUrl, receiverUrl, receiverSecret, statePath } = {}) {
 for (const value of [readinessUrl, receiverUrl]) {
  let url; try { url = new URL(value); } catch { throw Error('OPERATIONS_PROBE_CONFIG_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error('OPERATIONS_PROBE_CONFIG_INVALID');
 }
 if (typeof receiverSecret !== 'string' || receiverSecret.length < 32 || !isAbsolute(statePath || '')) throw Error('OPERATIONS_PROBE_CONFIG_INVALID');
 return { configurationValid: true, connectivityTested: false, deliveryVerified: false };
}
export function validateDisabledOperationsPlan(plan) {
 if (plan?.schemaVersion !== 1 || plan.environment !== 'isolated-local-staging' || plan.schedulerInstalled !== false || plan.automaticDeletionEnabled !== false
  || plan.backup?.enabled !== false || plan.backup.enforceRetention !== false || plan.backup.requiresVerifiedQuiescence !== true || plan.backup.restoreEmailEnabled !== false
  || plan.readinessProbe?.enabled !== false || plan.draftRecoveryTargets?.approved !== false) throw Error('OPERATIONS_PLAN_UNSAFE_OR_APPROVAL_REQUIRED');
 return { safeDisabledDraft: true, schedulerInstalled: false, automaticDeletionEnabled: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 try {
  const path = process.argv[2]; if (!path) throw Error('OPERATIONS_PLAN_PATH_REQUIRED');
  console.log(JSON.stringify(validateDisabledOperationsPlan(JSON.parse(await readFile(path, 'utf8')))));
 } catch { console.error(JSON.stringify({ event: 'operations_plan_validation_failed' })); process.exitCode = 1; }
}
