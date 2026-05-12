import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/index.js';

test('GET /stream returns 200 with text/event-stream', async () => {
  const app = await createApp({ startPipeline: false });
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/stream`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
    res.body?.cancel?.();
  } finally {
    server.close();
  }
});
