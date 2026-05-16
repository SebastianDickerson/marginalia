const UPSTREAM_URL = 'https://stream.wikimedia.org/v2/stream/recentchange';
const DEFAULT_USER_AGENT =
  'marginalia/0.1 (sebastian@r6digital.com.au) https://github.com/sebastiandickerson12/marginalia';

export function createConsumer({
  onEvent,
  logger = console,
  fetch: fetchImpl = globalThis.fetch,
  url = UPSTREAM_URL,
  userAgent = DEFAULT_USER_AGENT,
  backoffStartMs = 1000,
  backoffCapMs = 30_000,
} = {}) {
  if (typeof onEvent !== 'function') {
    throw new Error('createConsumer: onEvent is required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('createConsumer: fetch is required (runtime or injected)');
  }

  let abort = null;
  let running = false;
  let stopped = false;

  async function loop() {
    let backoff = backoffStartMs;
    while (!stopped) {
      abort = new AbortController();
      try {
        logger.info?.('[sseConsumer] upstream connecting');
        const res = await fetchImpl(url, {
          headers: {
            Accept: 'text/event-stream',
            'User-Agent': userAgent,
          },
          signal: abort.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`upstream status ${res.status}`);
        }
        logger.info?.('[sseConsumer] upstream open');
        backoff = backoffStartMs;
        await consume(res.body);
        logger.info?.('[sseConsumer] upstream ended');
      } catch (err) {
        if (stopped) break;
        logger.warn?.(`[sseConsumer] error: ${err?.message || err} — backoff ${backoff}ms`);
      }
      if (stopped) break;
      await sleep(backoff);
      backoff = Math.min(backoff * 2, backoffCapMs);
    }
    running = false;
  }

  async function consume(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (!stopped) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (stopped) return;
        throw err;
      }
      if (chunk.done) return;
      buf += decoder.decode(chunk.value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        handleFrame(frame);
      }
    }
  }

  function handleFrame(frame) {
    const dataLines = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) return;
    let parsed;
    try {
      parsed = JSON.parse(dataLines.join('\n'));
    } catch (e) {
      logger.warn?.('[sseConsumer] failed to parse message', e?.message || '');
      return;
    }
    try {
      onEvent(parsed);
    } catch (e) {
      logger.warn?.('[sseConsumer] onEvent threw', e?.message || '');
    }
  }

  function start() {
    if (running) return;
    running = true;
    stopped = false;
    loop();
  }

  function stop() {
    stopped = true;
    if (abort) {
      try { abort.abort(); } catch { /* already aborted */ }
    }
    logger.info?.('[sseConsumer] upstream stopped');
  }

  return { start, stop };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
