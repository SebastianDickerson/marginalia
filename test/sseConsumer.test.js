import test from 'node:test';
import assert from 'node:assert/strict';
import { createConsumer } from '../src/sseConsumer.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

function makeBody(chunks) {
  let i = 0;
  const enc = new TextEncoder();
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

function once(fetchImpl) {
  let calls = 0;
  return async (...args) => {
    calls += 1;
    if (calls > 1) {
      // After first call, return a never-resolving response so reconnect parks.
      return new Response(new ReadableStream({ start: (c) => {} }), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }
    return fetchImpl(...args);
  };
}

test('parses two SSE events split across chunk boundaries', async () => {
  const events = [];
  const body = makeBody([
    'data: {"a":1}',
    '\n\ndata: {"b":',
    '2}\n\n',
  ]);
  const fakeFetch = async () =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });

  const consumer = createConsumer({
    onEvent: (ev) => events.push(ev),
    logger: silentLogger,
    fetch: once(fakeFetch),
    backoffStartMs: 1,
    backoffCapMs: 1,
  });
  consumer.start();
  // Wait a tick for the read loop to drain.
  await new Promise((r) => setTimeout(r, 50));
  consumer.stop();
  assert.deepEqual(events, [{ a: 1 }, { b: 2 }]);
});

test('sends descriptive User-Agent header to Wikimedia', async () => {
  let seenHeaders = null;
  const fakeFetch = async (url, init) => {
    seenHeaders = init.headers;
    return new Response(makeBody([]), { status: 200 });
  };
  const consumer = createConsumer({
    onEvent: () => {},
    logger: silentLogger,
    fetch: fakeFetch,
    userAgent: 'marginalia-test/1.0 (test@example.com)',
  });
  consumer.start();
  await new Promise((r) => setTimeout(r, 20));
  consumer.stop();
  assert.match(seenHeaders['User-Agent'] || seenHeaders['user-agent'] || '', /marginalia-test\/1\.0/);
  assert.match(seenHeaders['Accept'] || seenHeaders['accept'] || '', /text\/event-stream/);
});

test('skips malformed JSON frames silently (warn only)', async () => {
  const warns = [];
  const events = [];
  const body = makeBody(['data: not-json\n\n', 'data: {"ok":true}\n\n']);
  const consumer = createConsumer({
    onEvent: (ev) => events.push(ev),
    logger: { ...silentLogger, warn: (...a) => warns.push(a.join(' ')) },
    fetch: once(async () => new Response(body, { status: 200 })),
    backoffStartMs: 1,
  });
  consumer.start();
  await new Promise((r) => setTimeout(r, 50));
  consumer.stop();
  assert.deepEqual(events, [{ ok: true }]);
  assert.ok(warns.some((w) => w.includes('parse')), 'expected parse warn');
});

test('stop() aborts the in-flight fetch', async () => {
  let aborted = false;
  const fakeFetch = async (url, init) => {
    init.signal.addEventListener('abort', () => { aborted = true; });
    return new Promise(() => {}); // never resolves
  };
  const consumer = createConsumer({
    onEvent: () => {},
    logger: silentLogger,
    fetch: fakeFetch,
  });
  consumer.start();
  await new Promise((r) => setTimeout(r, 10));
  consumer.stop();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(aborted, true);
});
