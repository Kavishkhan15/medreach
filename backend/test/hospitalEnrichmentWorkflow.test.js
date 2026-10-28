import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnrichmentProposal } from '../src/services/hospitalEnrichmentWorkflow.js';
test('extraction accepts only bounded directory fields backed by an exact captured quote', () => {
  const evidence=[{ id:'claim-a', text:'Telephone 02212345678. Address 10 Hospital Road, Mumbai 400001.' }];
  assert.deepEqual(validateEnrichmentProposal({phone:{value:'02212345678',evidenceId:'claim-a',quote:'Telephone 02212345678.'}},evidence),{phone:{value:'02212345678',evidenceId:'claim-a',quote:'Telephone 02212345678.'}});
  for(const proposed of [
    {bedsAvailable:{value:15,evidenceId:'claim-a',quote:evidence[0].text}},
    {phone:{value:'02299999999',evidenceId:'claim-a',quote:'Telephone 02212345678.'}},
    {phone:{value:'02212345678',evidenceId:'claim-b',quote:'Telephone 02212345678.'}},
    {phone:{value:'02212345678',evidenceId:'claim-a',quote:'Invented quote 02212345678'}},
  ]) assert.throws(()=>validateEnrichmentProposal(proposed,evidence),e=>e.code==='INVALID_ENRICHMENT_PROPOSAL');
});
