import test from 'node:test';
import assert from 'node:assert/strict';
import { createNarrator } from '../src/llmNarrator.js';
import { defaultConfig } from '../src/config.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

const ev = {
  id: 'enwiki:1',
  user: 'MossWatcher2',
  title: 'Some Article',
  comment: 'fix typo',
  delta: -3,
  wiki: 'enwiki',
  type: 'edit',
  ts: Date.now(),
};

function anthropicResponse(text) {
  return new Response(
    JSON.stringify({ content: [{ type: 'text', text }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

test('narrate posts to /v1/messages with anthropic headers', async () => {
  let seenUrl = null;
  let seenInit = null;
  const fakeFetch = async (url, init) => {
    seenUrl = url;
    seenInit = init;
    return anthropicResponse('A quiet edit occurs in the slow-growing colony of Some Article.');
  };
  const n = createNarrator({
    logger: silentLogger,
    env: { ANTHROPIC_API_KEY: 'sk-test' },
    fetch: fakeFetch,
    config: defaultConfig,
  });
  const out = await n.narrate(ev);
  assert.ok(out, 'expected narration');
  assert.match(seenUrl, /api\.anthropic\.com\/v1\/messages/);
  assert.equal(seenInit.method, 'POST');
  assert.equal(seenInit.headers['x-api-key'], 'sk-test');
  assert.equal(seenInit.headers['anthropic-version'], '2023-06-01');
  assert.equal(seenInit.headers['content-type'], 'application/json');
  const body = JSON.parse(seenInit.body);
  assert.equal(body.model, defaultConfig.narrator.model);
  assert.equal(body.max_tokens, defaultConfig.narrator.maxTokens);
  assert.ok(typeof body.system === 'string' && body.system.length > 0);
});

test('narrate returns shape {id, text, title, ts}', async () => {
  const fakeFetch = async () => anthropicResponse('A small ripple passes through the article on Some Article.');
  const n = createNarrator({
    logger: silentLogger,
    env: { ANTHROPIC_API_KEY: 'sk' },
    fetch: fakeFetch,
  });
  const out = await n.narrate(ev);
  assert.equal(out.id, ev.id);
  assert.equal(out.title, ev.title);
  assert.equal(typeof out.text, 'string');
  assert.equal(typeof out.ts, 'number');
});

test('narrate rejects when text contains "Wikipedia"', async () => {
  const fakeFetch = async () => anthropicResponse('In the great library of Wikipedia, an edit ripples.');
  const n = createNarrator({
    logger: silentLogger,
    env: { ANTHROPIC_API_KEY: 'sk' },
    fetch: fakeFetch,
  });
  const out = await n.narrate(ev);
  assert.equal(out, null);
});

test('narrate rejects word count overflow', async () => {
  const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
  const fakeFetch = async () => anthropicResponse(long);
  const n = createNarrator({
    logger: silentLogger,
    env: { ANTHROPIC_API_KEY: 'sk' },
    fetch: fakeFetch,
  });
  assert.equal(await n.narrate(ev), null);
});

test('narrate returns null on upstream error', async () => {
  const fakeFetch = async () => new Response('boom', { status: 500 });
  const n = createNarrator({
    logger: silentLogger,
    env: { ANTHROPIC_API_KEY: 'sk' },
    fetch: fakeFetch,
  });
  assert.equal(await n.narrate(ev), null);
});

test('narrate rejects few-shot literal echo', async () => {
  const fakeFetch = async () => anthropicResponse('A familiar glow returns to Lichen as an editor passes by.');
  const n = createNarrator({
    logger: silentLogger,
    env: { ANTHROPIC_API_KEY: 'sk' },
    fetch: fakeFetch,
  });
  assert.equal(await n.narrate(ev), null);
});
