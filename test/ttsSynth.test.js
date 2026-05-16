import test from 'node:test';
import assert from 'node:assert/strict';
import { createTtsSynth } from '../src/ttsSynth.js';
import { defaultConfig } from '../src/config.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

function fakeOkFetch(bytes = new Uint8Array([1, 2, 3])) {
  let calls = 0;
  const fn = async () => {
    calls += 1;
    return new Response(bytes, {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    });
  };
  fn.calls = () => calls;
  return fn;
}

test('register returns null when ELEVENLABS_API_KEY missing', () => {
  const tts = createTtsSynth({
    logger: silentLogger,
    config: defaultConfig,
    env: {},
    fetch: fakeOkFetch(),
  });
  const url = tts.register({ id: 'a', text: 'hi' });
  assert.equal(url, null);
  assert.equal(tts.isEnabled(), false);
});

test('register returns /audio/:id when enabled', () => {
  const tts = createTtsSynth({
    logger: silentLogger,
    config: defaultConfig,
    env: { ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' },
    fetch: fakeOkFetch(),
  });
  assert.equal(tts.register({ id: 'enwiki:1', text: 'hello' }), '/audio/enwiki%3A1');
  assert.equal(tts.isEnabled(), true);
});

test('serveAudio returns 404 when id not registered', async () => {
  const tts = createTtsSynth({
    logger: silentLogger,
    config: defaultConfig,
    env: { ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' },
    fetch: fakeOkFetch(),
  });
  const res = await tts.serveAudio('missing');
  assert.equal(res.status, 404);
});

test('serveAudio synthesizes once, caches for second call', async () => {
  const f = fakeOkFetch(new Uint8Array([9, 9, 9]));
  const tts = createTtsSynth({
    logger: silentLogger,
    config: defaultConfig,
    env: { ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' },
    fetch: f,
  });
  tts.register({ id: 'x', text: 'hello' });
  const r1 = await tts.serveAudio('x');
  const r2 = await tts.serveAudio('x');
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(r1.headers['content-type'], 'audio/mpeg');
  assert.equal(f.calls(), 1);
  assert.ok(r1.body instanceof Uint8Array, 'body must be Uint8Array (no Buffer)');
  assert.deepEqual(Array.from(r1.body), [9, 9, 9]);
});

test('serveAudio returns 502 on upstream error', async () => {
  const errFetch = async () =>
    new Response('boom', { status: 500, headers: { 'content-type': 'text/plain' } });
  const tts = createTtsSynth({
    logger: silentLogger,
    config: defaultConfig,
    env: { ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' },
    fetch: errFetch,
  });
  tts.register({ id: 'x', text: 'hello' });
  const res = await tts.serveAudio('x');
  assert.equal(res.status, 502);
});

test('register exhausts daily cap and returns null thereafter', () => {
  const cfg = {
    ...defaultConfig,
    tts: {
      elevenlabs: { ...defaultConfig.tts.elevenlabs, dailyCharCap: 10 },
    },
  };
  const tts = createTtsSynth({
    logger: silentLogger,
    config: cfg,
    env: { ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' },
    fetch: fakeOkFetch(),
  });
  assert.ok(tts.register({ id: 'a', text: '12345' })); // 5 chars → 5 used
  assert.ok(tts.register({ id: 'b', text: '12345' })); // 5 chars → 10 used
  assert.equal(tts.register({ id: 'c', text: '1' }), null); // would exceed
});
