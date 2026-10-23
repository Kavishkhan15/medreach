// Lockfile dependency evidence, not a deployed-version or penetration-test claim.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function parseAudit(raw) {
  const report = JSON.parse(raw);
  const counts = report.metadata?.vulnerabilities;
  if (report.error || !counts || !report.vulnerabilities || typeof report.vulnerabilities !== 'object' || Array.isArray(report.vulnerabilities)) throw new Error('No usable npm audit report; security status is unknown.');
  for (const key of ['info','low','moderate','high','critical','total']) {
    if (!Number.isInteger(counts[key]) || counts[key] < 0) throw new Error('Malformed vulnerability counts; security status is unknown.');
  }
  if (['info','low','moderate','high','critical'].reduce((n,key)=>n+counts[key],0)!==counts.total || Object.keys(report.vulnerabilities).length!==counts.total) throw new Error('Inconsistent vulnerability counts; security status is unknown.');
  return { counts, findings: Object.entries(report.vulnerabilities).map(([name,v]) => ({name,severity:v.severity,isDirect:v.isDirect,fixAvailable:v.fixAvailable})) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const dir = `${root}evaluation/results`;
  const evidence = { generatedAt:new Date().toISOString(), scope:'Repository package-lock.json, all workspaces; deployed dependencies not independently identified', status:'unavailable',
    sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    lockfileSha256:createHash('sha256').update(readFileSync(`${root}package-lock.json`)).digest('hex') };
  try {
    let raw;
    try { raw=execFileSync('npm',['audit','--json'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000}); }
    catch(error) { if(error.status!==1 || !error.stdout) throw new Error('Registry audit unavailable; no zero-vulnerability claim is valid.'); raw=error.stdout.toString(); }
    Object.assign(evidence, parseAudit(raw));
    evidence.status=evidence.counts.high || evidence.counts.critical ? 'failed' : 'passed';
    console.log(JSON.stringify(evidence,null,2));
    if(evidence.status==='failed') process.exitCode=1;
  } catch(error) { evidence.error=error.message.startsWith('Registry') || error.message.includes('security status') ? error.message : 'Audit could not be validated; security status is unknown.'; console.error(evidence.error); process.exitCode=1; }
  mkdirSync(dir,{recursive:true}); writeFileSync(`${dir}/security.json`,JSON.stringify(evidence,null,2)+'\n');
}
