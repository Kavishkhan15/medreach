// Official Lighthouse CLI against the three PUBLIC hosted homepages only.
// npm exec keeps the pinned measurement tool outside application dependencies.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const run=`lighthouse-${new Date().toISOString().replaceAll(':','-')}`;
const directory=`${root}evaluation/results/${run}`;
mkdirSync(directory,{recursive:true});
const summary={generatedAt:new Date().toISOString(),tool:'Lighthouse 13.5.0',scope:'One diagnostic homepage audit per frontend/profile, not field data or a statistically stable ranking. No login or form submission.',reports:[]};
const targets={bootstrap:'https://medreachmumbai.vercel.app',tailwind:'https://medreach-tailwind.vercel.app',skeleton:'https://medreach-skeleton.vercel.app'};
for(const profile of ['mobile','desktop']) for(const [variant,url] of Object.entries(targets)) {
  const output=`${directory}/${variant}-${profile}`;
  const args=['exec','--yes','--package=lighthouse@13.5.0','--','lighthouse',url,'--quiet','--chrome-flags=--headless=new','--output=json','--output=html',`--output-path=${output}`,'--only-categories=performance,accessibility,best-practices,seo'];
  if(profile==='desktop') args.push('--preset=desktop');
  let executionFailed=false;
  try { execFileSync('npm',args,{cwd:root,stdio:['ignore','inherit','inherit'],timeout:240000,env:{...process.env,CHROME_PATH:process.env.CHROME_PATH||'/opt/google/chrome/chrome'}}); }
  catch { executionFailed=true; }
  const file=output+'.report.json';
  if(!existsSync(file)) {summary.reports.push({variant,profile,url,status:'unavailable',scores:null});continue;}
  const lhr=JSON.parse(readFileSync(file,'utf8'));
  const item={variant,profile,url,fetchTime:lhr.fetchTime,status:executionFailed||lhr.runtimeError?'failed':'measured',runtimeError:lhr.runtimeError?.code??null,lighthouseVersion:lhr.lighthouseVersion,
    scores:Object.fromEntries(Object.entries(lhr.categories||{}).map(([name,value])=>[name,value.score===null?null:Math.round(value.score*100)])),
    metrics:Object.fromEntries(['first-contentful-paint','largest-contentful-paint','total-blocking-time','cumulative-layout-shift','speed-index'].map(name=>[name,lhr.audits?.[name]?.numericValue??null])),
    failedAudits:Object.entries(lhr.audits||{}).filter(([,audit])=>audit.score!==null&&audit.score<1).map(([id,audit])=>({id,title:audit.title,score:audit.score,displayValue:audit.displayValue??null})),
    warnings:lhr.runWarnings,settings:lhr.configSettings,html:`evaluation/results/${run}/${variant}-${profile}.report.html`,json:`evaluation/results/${run}/${variant}-${profile}.report.json`};
  summary.reports.push(item);
  console.log(`${variant} ${profile}: ${JSON.stringify(item.scores)} (${item.status})`);
}
summary.finishedAt=new Date().toISOString();
writeFileSync(`${root}evaluation/results/lighthouse.json`,JSON.stringify(summary,null,2)+'\n');
if(summary.reports.some(r=>r.status!=='measured'))process.exitCode=1;
