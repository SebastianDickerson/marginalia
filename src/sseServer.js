import express from 'express';
import { config } from './config.js';

export function createSseServer({ logger } = {}) {
  const log = logger ?? console;
  const clients = new Set();
  const replayBuffer = [];

  function pushToBuffer(narration) {
    replayBuffer.push(narration);
    while (replayBuffer.length > config.server.replayBufferSize) {
      replayBuffer.shift();
    }
  }

  function writeSse(res, eventName, payload) {
    const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    try {
      const ok = res.write(frame);
      return ok !== false;
    } catch (err) {
      return false;
    }
  }

  function evict(res, reason) {
    if (!clients.has(res)) return;
    clients.delete(res);
    if (res.__heartbeatId) {
      clearInterval(res.__heartbeatId);
      res.__heartbeatId = null;
    }
    try { res.end(); } catch { /* socket already gone */ }
    log.info(`[sse] client disconnected (${reason}, total=${clients.size})`);
  }

  function handleStream(req, res) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    clients.add(res);
    log.info(`[sse] client connected (total=${clients.size})`);

    try { res.write(': connected\n\n'); } catch { /* ignore — close handler will evict */ }

    for (const narration of replayBuffer) {
      const ok = writeSse(res, 'replay', narration);
      if (!ok) {
        evict(res, 'write-failed-during-replay');
        return;
      }
    }

    res.__heartbeatId = setInterval(() => {
      try {
        const ok = res.write(': heartbeat\n\n');
        if (ok === false) evict(res, 'heartbeat-backpressure');
      } catch {
        evict(res, 'heartbeat-error');
      }
    }, config.server.heartbeatMs);

    req.on('close', () => evict(res, 'client-close'));
  }

  function mount(app) {
    app.get('/healthz', (req, res) => res.type('text/plain').send('ok'));
    app.get('/stream', handleStream);
    app.use(express.static('public'));
    app.use((req, res) => {
      res.status(404).type('text/plain').send('Not found');
    });
  }

  function broadcast(narration) {
    pushToBuffer(narration);
    const dead = [];
    for (const res of clients) {
      const ok = writeSse(res, 'narration', narration);
      if (!ok) dead.push(res);
    }
    for (const res of dead) {
      log.warn(`[sse] evicting client (write failed)`);
      evict(res, 'broadcast-write-failed');
    }
    log.info(`[sse] broadcast → ${clients.size} client(s)`);
  }

  function getClientCount() {
    return clients.size;
  }

  function closeAll() {
    for (const res of [...clients]) {
      evict(res, 'shutdown');
    }
  }

  return { mount, broadcast, getClientCount, closeAll };
}
