import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAudit } from '../../evaluation/security/audit.mjs';
import { riskScore } from '../../evaluation/scoring/risk-score.js';

test('missing, invalid and registry-error audit results cannot become zero vulnerabilities',()=>{
  for(const value of ['{}','null','not json',JSON.stringify({error:{code:'ENETUNREACH'}}),JSON.stringify({metadata:{vulnerabilities:{total:0}}})]) assert.throws(()=>parseAudit(value));
});
test('a genuine zero-vulnerability report is distinguishable from an unavailable audit',()=>{
  const counts={info:0,low:0,moderate:0,high:0,critical:0,total:0};
  assert.deepEqual(parseAudit(JSON.stringify({metadata:{vulnerabilities:counts},vulnerabilities:{}})),{counts,findings:[]});
  assert.throws(()=>parseAudit(JSON.stringify({metadata:{vulnerabilities:{...counts,high:null}},vulnerabilities:{}})));
  assert.throws(()=>parseAudit(JSON.stringify({metadata:{vulnerabilities:counts},vulnerabilities:[]})));
  assert.throws(()=>parseAudit(JSON.stringify({metadata:{vulnerabilities:{...counts,total:1}},vulnerabilities:{}})));
});
test('incomplete security dimensions never produce a fabricated composite grade',()=>{
  for(const input of [undefined,{}, {dependencies:{cvssSum:0}}, {xss:{}}]) assert.throws(()=>riskScore(input),/Incomplete security evidence/);
});
test('security scores accept complete synthetic fixtures but reject malformed metrics and weights',()=>{
  const complete={xss:{high:0,medium:0,low:0},dependencies:{cvssSum:0},supplyChain:{totalDeps:1},csp:{level:'moderate'},sri:{coverage:0},configuration:{observatoryGrade:'B'},maintenance:{monthsSinceRelease:1,eol:false},cssAttackSurface:{exploit:'none'}};
  assert.ok(Number.isFinite(riskScore(complete).risk));
  assert.throws(()=>riskScore({...complete,sri:{coverage:2}}));
  assert.throws(()=>riskScore({...complete,xss:{high:0}}));
  assert.throws(()=>riskScore({...complete,dependencies:{cvssSum:NaN}}));
  assert.throws(()=>riskScore(complete,{dependencies:1}));
});
