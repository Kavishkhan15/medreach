/** Finite isolated staging rehearsal; reuses the real-process supervisor. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyBackendProcesses } from './verifyBackendProcesses.js';
export async function runLocalStaging({ outputDirectory = '/tmp/medreach-local-staging' } = {}) {
  const directory = resolve(outputDirectory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const report = await verifyBackendProcesses();
  report.environment = 'isolated_local_staging';
  report.limitations = ['Synthetic dataset; single host; short finite load', 'External email, webhooks and AI integrations disabled',
    'No hosted capacity or clinical service guarantee', 'No live database interruption or in-flight notification delivery exercised'];
  const reportPath = resolve(directory, `process-rehearsal-${Date.now()}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return { ok: true, reportPath, measurements: report.measurements, checks: report.checks };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await runLocalStaging({ outputDirectory: process.env.MEDREACH_STAGING_REPORT_DIRECTORY }), null, 2)); }
  catch { console.error(JSON.stringify({ event: 'local_staging_failed', code: 'STAGING_REHEARSAL_FAILED' })); process.exitCode = 1; }
}
