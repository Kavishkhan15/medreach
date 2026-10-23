// Aggregate measured evidence only. Missing axes remain explicitly unmeasured.
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const directory=fileURLToPath(new URL('./results/',import.meta.url));
const summary={ project:'MedReach',generatedAt:new Date().toISOString(),architecture:'Three frontends → one shared Express API → one Atlas dataset (database topology reported by owner, not directly inspected)',
  securityScore:{status:'not-measured',score:null,reason:'No complete measured eight-dimension evidence; no fabricated safety grade.'}, axes:{} };
for(const [axis,file] of Object.entries({dependencies:'security.json',hostedSecurity:'hosted-security.json',hosted:'hosted.json',lighthouse:'lighthouse.json',networkDiagnostics:'network-diagnostics.json',bundles:'performance.json'})) {
  const path=directory+file;
  summary.axes[axis]=existsSync(path) ? {status:'evidence-present',evidence:JSON.parse(readFileSync(path,'utf8'))} : {status:'not-measured'};
}
mkdirSync(directory,{recursive:true});writeFileSync(directory+'summary.json',JSON.stringify(summary,null,2)+'\n');
console.log('Wrote evaluation/results/summary.json. Evidence retains its own timestamps, source revisions and limitations.');
