import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, connect } from 'node:net';
import { guardedSustainedUri, SUSTAINED_DATABASE, sustainedSeconds, interruptibleMongoProxy } from '../scripts/sustainedReliabilitySupport.js';
test('sustained rehearsal refuses application databases, remote hosts, credentials and URI options', () => {
  assert.equal(guardedSustainedUri(), `mongodb://127.0.0.1:27017/${SUSTAINED_DATABASE}`);
  for (const uri of [`mongodb://127.0.0.1:27017/medreach`, `mongodb://localhost:27017/${SUSTAINED_DATABASE}`, `mongodb://remote.example:27017/${SUSTAINED_DATABASE}`, `mongodb://u:p@127.0.0.1:27017/${SUSTAINED_DATABASE}`, `mongodb://127.0.0.1:27017/${SUSTAINED_DATABASE}?dbName=medreach`, `mongodb://127.0.0.1:27017/${SUSTAINED_DATABASE}#unsafe`]) assert.throws(() => guardedSustainedUri(uri));
  assert.equal(sustainedSeconds(), 30);
  for (const value of ['0', '14', '121', '30.5', '30x']) assert.throws(() => sustainedSeconds(value));
});
test('owned network boundary interrupts connections and resumes without stopping target', async () => {
  const target = createServer(socket => socket.pipe(socket));
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  const proxy = await interruptibleMongoProxy(`mongodb://127.0.0.1:${target.address().port}/${SUSTAINED_DATABASE}`);
  const exchange = () => new Promise((resolve, reject) => {
    const socket = connect(proxy.port, '127.0.0.1');
    const timer = setTimeout(() => {
      socket.destroy();
      reject(Error('timeout'));
    }, 1000);
    socket.once('connect', () => socket.write('owned fixture'));
    socket.once('data', chunk => {
      clearTimeout(timer);
      socket.destroy();
      resolve(chunk.toString());
    });
    socket.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    socket.once('close', () => {
      clearTimeout(timer);
      reject(Error('closed'));
    });
  });
  try {
    assert.equal(await exchange(), 'owned fixture');
    proxy.interrupt();
    await assert.rejects(exchange());
    proxy.resume();
    assert.equal(await exchange(), 'owned fixture');
  } finally {
    await proxy.close();
    await new Promise(resolve => target.close(resolve));
  }
});
