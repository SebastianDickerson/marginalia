import test from 'node:test';
import assert from 'node:assert/strict';
import { createFilter } from '../src/eventFilter.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

function rawEdit(overrides = {}) {
  return {
    wiki: 'enwiki',
    bot: false,
    type: 'edit',
    title: 'Lichen',
    user: 'MossWatcher',
    comment: 'fix typo',
    length: { old: 100, new: 200 },
    meta: { id: 'evt-1', dt: '2026-05-16T00:00:00Z' },
    ...overrides,
  };
}

test('createFilter debug flag is opt-in (does not consult process.env.DEBUG)', () => {
  const prev = process.env.DEBUG;
  process.env.DEBUG = '1';
  const warns = [];
  const logger = { ...silentLogger, warn: (...a) => warns.push(a.join(' ')) };
  try {
    const f = createFilter({
      onAccept: () => {},
      getLastNarratedAt: () => 0,
      logger,
      debug: false,
    });
    f.handle({ wiki: 'dewiki', bot: false, type: 'edit', title: 'X', length: { old: 0, new: 1 } });
    f.stop();
    // With debug=false, reject() must NOT emit per-event reject logs even
    // though process.env.DEBUG=1.
    const rejectLogs = warns.filter((l) => l.includes('[eventFilter] reject'));
    assert.equal(rejectLogs.length, 0);
  } finally {
    process.env.DEBUG = prev;
  }
});

test('createFilter with debug=true emits reject logs', () => {
  const warns = [];
  const logger = { ...silentLogger, warn: (...a) => warns.push(a.join(' ')) };
  const f = createFilter({
    onAccept: () => {},
    getLastNarratedAt: () => 0,
    logger,
    debug: true,
  });
  f.handle({ wiki: 'dewiki', bot: false, type: 'edit', title: 'X', length: { old: 0, new: 1 } });
  f.stop();
  const rejectLogs = warns.filter((l) => l.includes('[eventFilter] reject'));
  assert.ok(rejectLogs.length > 0, 'expected reject log with debug=true');
});

test('createFilter accepts a basic enwiki edit and normalizes fields', () => {
  const seen = [];
  const f = createFilter({
    onAccept: (ev) => seen.push(ev),
    getLastNarratedAt: () => 0,
    logger: silentLogger,
    debug: false,
  });
  f.handle(rawEdit({ title: 'Some_Article' }));
  f.stop();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].title, 'Some Article');
  assert.equal(seen[0].user, 'MossWatcher');
  assert.equal(seen[0].delta, 100);
  assert.equal(seen[0].wiki, 'enwiki');
  assert.equal(seen[0].id, 'enwiki:evt-1');
});

test('createFilter rejects non-enwiki', () => {
  const seen = [];
  const f = createFilter({ onAccept: (ev) => seen.push(ev), logger: silentLogger });
  f.handle(rawEdit({ wiki: 'dewiki' }));
  f.stop();
  assert.equal(seen.length, 0);
});

test('createFilter rejects when below tickMs since lastNarratedAt', () => {
  const seen = [];
  const f = createFilter({
    onAccept: (ev) => seen.push(ev),
    getLastNarratedAt: () => Date.now(),
    logger: silentLogger,
  });
  f.handle(rawEdit());
  f.stop();
  assert.equal(seen.length, 0);
});

test('createFilter dedup reporter does not invoke .unref (Workers compat)', () => {
  const original = global.setInterval;
  const sentinel = {
    get unref() {
      throw new Error('eventFilter must not call .unref on setInterval result');
    },
  };
  global.setInterval = () => sentinel;
  try {
    const f = createFilter({ onAccept: () => {}, logger: silentLogger });
    f.handle(rawEdit());
    f.stop();
  } finally {
    global.setInterval = original;
  }
});
