import test from 'node:test';
import assert from 'node:assert/strict';
import { HubDO } from '../src/hubDO.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

function fakeState() {
  const alarms = [];
  return {
    alarms,
    blockConcurrencyWhile: async (fn) => fn(),
    storage: {
      setAlarm: async (t) => { alarms.push(t); },
      getAlarm: async () => alarms.length ? alarms[alarms.length - 1] : null,
    },
  };
}

function noopFactories(overrides = {}) {
  return {
    createNarrator: () => ({ narrate: async () => null }),
    createTtsSynth: () => ({
      register: () => null,
      serveAudio: async () => ({ status: 404, body: new Uint8Array(), headers: {} }),
      isEnabled: () => false,
    }),
    createFilter: () => ({ handle: () => {} }),
    createConsumer: () => ({ start: () => {}, stop: () => {} }),
    ...overrides,
  };
}

function makeHub(overrides = {}) {
  const state = fakeState();
  const env = overrides.env || {};
  const deps = {
    skipUpstream: true,
    logger: silentLogger,
    factories: noopFactories(overrides.factories),
    ...overrides.deps,
  };
  const hub = new HubDO(state, env, deps);
  return { hub, state };
}

test('GET /stream returns 200 with text/event-stream and `: connected` first chunk', async () => {
  const { hub } = makeHub();
  const res = await hub.fetch(new Request('https://do/stream'));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
  const reader = res.body.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  assert.match(text, /: connected/);
  await reader.cancel();
});

test('GET /audio/:id decodes id and proxies tts.serveAudio bytes', async () => {
  const calls = [];
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const { hub } = makeHub({
    factories: {
      createTtsSynth: () => ({
        register: () => null,
        serveAudio: async (id) => {
          calls.push(id);
          return { status: 200, body: bytes, headers: { 'Content-Type': 'audio/mpeg' } };
        },
        isEnabled: () => true,
      }),
    },
  });
  const res = await hub.fetch(new Request('https://do/audio/enwiki%3A1'));
  assert.equal(res.status, 200);
  assert.equal(calls[0], 'enwiki:1');
  const body = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual(Array.from(body), [1, 2, 3, 4]);
});

test('GET /audio/:id returns 404 when tts has no recording', async () => {
  const { hub } = makeHub();
  const res = await hub.fetch(new Request('https://do/audio/missing'));
  assert.equal(res.status, 404);
});

test('GET /stats returns JSON with counters surface', async () => {
  const { hub } = makeHub();
  const res = await hub.fetch(new Request('https://do/stats'));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /application\/json/);
  const body = await res.json();
  assert.equal(typeof body.counters.clientsTotal, 'number');
  assert.equal(typeof body.counters.alarms, 'number');
  assert.equal(typeof body.bootAt, 'number');
});

test('alarm() bumps counter and re-arms via storage.setAlarm', async () => {
  const { hub, state } = makeHub();
  const before = state.alarms.length;
  await hub.alarm();
  assert.equal(hub.counters.alarms, 1);
  assert.ok(state.alarms.length > before, 'alarm() should re-arm');
});

test('GET /stream replays buffered narrations as `event: replay`', async () => {
  const { hub } = makeHub();
  hub.replay.push({ id: 'r1', text: 'first' });
  const res = await hub.fetch(new Request('https://do/stream'));
  const reader = res.body.getReader();
  let buf = '';
  const decoder = new TextDecoder();
  for (let i = 0; i < 4 && !buf.includes('event: replay'); i++) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }
  assert.match(buf, /event: replay\n/);
  assert.match(buf, /"id":"r1"/);
  await reader.cancel();
});
