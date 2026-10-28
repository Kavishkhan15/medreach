import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyResendWebhook } from '../src/services/resendWebhook.js';
const secret = `whsec_${Buffer.from('isolated-webhook-secret-32-bytes!!').toString('base64')}`;
function signed(body, timestamp = Math.floor(Date.now()/1000)) { const id='msg_isolated_123'; const signature=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(`${id}.${timestamp}.`).update(body).digest('base64'); return {'svix-id':id,'svix-timestamp':String(timestamp),'svix-signature':`v1,${signature}`}; }
test('Resend webhook authenticates exact raw bytes and rejects altered payloads',()=>{ const raw=Buffer.from('{"type":"email.delivered"}'); assert.equal(verifyResendWebhook(raw,signed(raw),secret).type,'email.delivered'); assert.throws(()=>verifyResendWebhook(Buffer.from('{ "type":"email.delivered"}'),signed(raw),secret)); });
test('Resend webhook rejects expired, future, missing and malformed signatures',()=>{ const raw=Buffer.from('{}'); for(const timestamp of [Math.floor(Date.now()/1000)-301,Math.floor(Date.now()/1000)+301]) assert.throws(()=>verifyResendWebhook(raw,signed(raw,timestamp),secret)); assert.throws(()=>verifyResendWebhook(raw,{},secret)); assert.throws(()=>verifyResendWebhook(raw,{'svix-id':'bad','svix-timestamp':'no','svix-signature':'v1,no'},secret)); assert.throws(()=>verifyResendWebhook(raw,signed(raw),'')); assert.throws(()=>verifyResendWebhook({},signed(raw),secret)); });
test('Resend webhook tolerates signing-key rotation signature lists',()=>{ const raw=Buffer.from('{}'); const h=signed(raw); h['svix-signature']=`v1,${Buffer.alloc(32).toString('base64')} ${h['svix-signature']}`; assert.deepEqual(verifyResendWebhook(raw,h,secret),{}); });
