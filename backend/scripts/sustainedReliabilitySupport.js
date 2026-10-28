import assert from 'node:assert/strict';
import { createServer, connect } from 'node:net';
export const SUSTAINED_DATABASE = 'medreach_sustained_reliability_test';
export function guardedSustainedUri(raw = `mongodb://127.0.0.1:27017/${SUSTAINED_DATABASE}`, {
  proxy = false
} = {}) {
  const url = new URL(raw);
  assert.equal(url.protocol, 'mongodb:');
  assert.ok(['127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, `/${SUSTAINED_DATABASE}`);
  assert.ok(!url.username && !url.password && !url.hash);
  assert.equal(url.search, proxy ? '?directConnection=true' : '');
  assert.ok(/^\d+$/.test(url.port) && Number(url.port) > 0);
  return url.href;
}
export function sustainedSeconds(value = '30') {
  const text = String(value);
  if (!/^\d+$/.test(text) || Number(text) < 15 || Number(text) > 120) throw Error('Sustained duration must be 15–120 seconds');
  return Number(text);
}
/** An owned TCP fault boundary; interrupt never stops the shared MongoDB server. */
export async function interruptibleMongoProxy(target) {
  const url = new URL(guardedSustainedUri(target));
  let enabled = true;
  const sockets = new Set();
  const remember = socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    return socket;
  };
  const server = createServer(client => {
    remember(client);
    if (!enabled) {
      client.destroy();
      return;
    }
    const upstream = remember(connect({
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: Number(url.port)
    }));
    client.pipe(upstream);
    upstream.pipe(client);
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    port: server.address().port,
    interrupt() {
      enabled = false;
      for (const socket of sockets) socket.destroy();
    },
    resume() {
      enabled = true;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
    }
  };
}
