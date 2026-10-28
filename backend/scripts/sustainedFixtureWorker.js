/** Only the owned sustained-rehearsal queue is processed; no delivery integration. */
import mongoose from 'mongoose';
import { claimJob, assertJobLease, completeJob } from '../src/services/backgroundJobs.js';
import { guardedSustainedUri } from './sustainedReliabilitySupport.js';
const uri = guardedSustainedUri(process.env.MEDREACH_SUSTAINED_PROXY_URI, {
  proxy: true
});
if (process.env.EMAIL_ENABLED !== 'false' || process.env.NODE_ENV !== 'production') throw Error('Isolated fixture configuration required');
await mongoose.connect(uri, {
  autoIndex: false,
  autoCreate: false,
  serverSelectionTimeoutMS: 1000,
  socketTimeoutMS: 1500
});
const marker = process.env.MEDREACH_SUSTAINED_OWNER;
if (!marker || !(await mongoose.connection.db.collection('_sustained_owner').findOne({
  _id: marker
}))) throw Error('Owned fixture marker required');
const effects = mongoose.connection.db.collection('_sustained_effects');
let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  while (!stopping) {
    try {
      const job = await claimJob({
        types: ['rehearsal.effect'],
        workerId: `fixture-${process.pid}`,
        leaseMs: 1000
      });
      if (!job) {
        await pause(80);
        continue;
      }
      await assertJobLease(job);
      await effects.updateOne({
        _id: job.key
      }, {
        $setOnInsert: {
          originalAttempt: job.attempts,
          marker
        }
      }, {
        upsert: true
      });
      if (process.env.MEDREACH_SUSTAINED_CRASH === 'after_effect') {
        console.log('SYNTHETIC_EFFECT_COMMITTED');
        await new Promise(() => {});
      }
      if (!(await completeJob(job, {
        result: {
          syntheticEffect: true
        }
      }))) throw Error('FIXTURE_LEASE_LOST');
    } catch {
      if (!stopping) await pause(100);
    }
  }
} finally {
  await mongoose.disconnect();
}
