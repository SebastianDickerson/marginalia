import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

function fakeEnv() {
  const calls = { hub: [], assets: [] };
  const hubStub = {
    fetch: async (req) => {
      calls.hub.push(req.url);
      return new Response('from-hub', { status: 200, headers: { 'x-from': 'hub' } });
    },
  };
  return {
    env: {
      HUB: {
        idFromName: (name) => ({ name }),
        get: () => hubStub,
      },
      ASSETS: {
        fetch: async (req) => {
          calls.assets.push(req.url);
          return new Response('from-assets', { status: 200, headers: { 'x-from': 'assets' } });
        },
      },
    },
    calls,
  };
}

test('GET /healthz returns ok text/plain', async () => {
  const { env } = fakeEnv();
  const res = await worker.fetch(new Request('https://m.example/healthz'), env);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');
  assert.match(res.headers.get('content-type') || '', /text\/plain/);
});

test('GET /stream is forwarded to HubDO', async () => {
  const { env, calls } = fakeEnv();
  const res = await worker.fetch(new Request('https://m.example/stream'), env);
  assert.equal(res.headers.get('x-from'), 'hub');
  assert.equal(calls.hub.length, 1);
  assert.equal(calls.assets.length, 0);
});

test('GET /stats is forwarded to HubDO', async () => {
  const { env, calls } = fakeEnv();
  const res = await worker.fetch(new Request('https://m.example/stats'), env);
  assert.equal(res.headers.get('x-from'), 'hub');
  assert.equal(calls.hub.length, 1);
  assert.equal(calls.assets.length, 0);
});

test('GET /audio/:id is forwarded to HubDO with raw pathname', async () => {
  const { env, calls } = fakeEnv();
  const res = await worker.fetch(new Request('https://m.example/audio/enwiki%3A1'), env);
  assert.equal(res.headers.get('x-from'), 'hub');
  assert.equal(calls.hub.length, 1);
  assert.match(calls.hub[0], /\/audio\/enwiki%3A1$/);
});

test('GET / falls through to ASSETS binding', async () => {
  const { env, calls } = fakeEnv();
  const res = await worker.fetch(new Request('https://m.example/'), env);
  assert.equal(res.headers.get('x-from'), 'assets');
  assert.equal(calls.hub.length, 0);
  assert.equal(calls.assets.length, 1);
});

test('POST /healthz returns 405 method not allowed', async () => {
  const { env, calls } = fakeEnv();
  const res = await worker.fetch(
    new Request('https://m.example/healthz', { method: 'POST' }),
    env,
  );
  assert.equal(res.status, 405);
  assert.equal(calls.hub.length, 0);
  assert.equal(calls.assets.length, 0);
});

test('HEAD /stream is forwarded to HubDO (HEAD is allowed)', async () => {
  const { env, calls } = fakeEnv();
  const res = await worker.fetch(
    new Request('https://m.example/stream', { method: 'HEAD' }),
    env,
  );
  assert.equal(res.headers.get('x-from'), 'hub');
  assert.equal(calls.hub.length, 1);
});

test('worker re-exports HubDO class', async () => {
  const mod = await import('../src/worker.js');
  assert.equal(typeof mod.HubDO, 'function');
});
