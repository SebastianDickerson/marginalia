// HubDO — single Durable Object owning the upstream pipeline + SSE fan-out.

import { buildConfig } from './config.js';
import { createConsumer } from './sseConsumer.js';
import { createFilter } from './eventFilter.js';
import { createNarrator } from './llmNarrator.js';
import { createTtsSynth } from './ttsSynth.js';

const ALARM_INTERVAL_MS = 30_000;

export class HubDO {
  constructor(state, env, deps = {}) {
    this.state = state;
    this.env = env;
    this.deps = deps;

    this.config = deps.config || buildConfig(env);
    this.logger = deps.logger || makeLogger(env);

    this.clients = new Set();
    this.replay = [];
    this.bootAt = Date.now();
    this.booted = false;
    this.inFlight = false;
    this.lastNarratedAt = 0;
    this.counters = {
      upstreamEvents: 0,
      narrations: 0,
      broadcasts: 0,
      clientsTotal: 0,
      alarms: 0,
      lastAlarmAt: 0,
    };

    state.blockConcurrencyWhile(async () => {
      this.#boot();
      await this.#ensureAlarm();
    });
  }

  #boot() {
    if (this.booted) return;
    this.booted = true;

    const fetchImpl = this.deps.fetch || globalThis.fetch;
    const factories = this.deps.factories || {};

    this.narrator = (factories.createNarrator || createNarrator)({
      logger: this.logger,
      env: this.env,
      config: this.config,
      fetch: fetchImpl,
    });
    this.tts = (factories.createTtsSynth || createTtsSynth)({
      logger: this.logger,
      env: this.env,
      config: this.config,
      fetch: fetchImpl,
    });
    this.filter = (factories.createFilter || createFilter)({
      onAccept: (ev) => this.#runNarration(ev),
      getLastNarratedAt: () => this.lastNarratedAt,
      logger: this.logger,
      config: this.config,
      debug: this.env.DEBUG === '1',
    });
    this.consumer = (factories.createConsumer || createConsumer)({
      onEvent: (raw) => this.#onUpstreamEvent(raw),
      logger: this.logger,
      fetch: fetchImpl,
    });

    if (this.deps.skipUpstream !== true) {
      this.consumer.start();
    }
  }

  #onUpstreamEvent(raw) {
    this.counters.upstreamEvents += 1;
    this.filter.handle(raw);
  }

  async #runNarration(ev) {
    if (this.inFlight) return;
    const now = Date.now();
    if (now - this.lastNarratedAt < this.config.filter.tickMs) return;
    this.inFlight = true;
    try {
      const narration = await this.narrator.narrate(ev);
      if (narration) {
        this.lastNarratedAt = Date.now();
        const audioUrl = this.tts.register(narration);
        if (audioUrl) narration.audioUrl = audioUrl;
        this.counters.narrations += 1;
        this.#pushReplay(narration);
        this.#broadcast(narration);
      }
    } catch (err) {
      this.logger.warn?.(`[hubDO] narration crashed: ${err?.message || err}`);
    } finally {
      this.inFlight = false;
    }
  }

  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/stream') return this.#openSseClient();
    if (url.pathname === '/stats') return this.#statsResponse();
    if (url.pathname.startsWith('/audio/')) {
      const raw = url.pathname.slice('/audio/'.length);
      let id;
      try {
        id = decodeURIComponent(raw);
      } catch {
        return new Response('bad id', { status: 400 });
      }
      const out = await this.tts.serveAudio(id);
      return new Response(out.body, { status: out.status, headers: out.headers });
    }

    return new Response('hubDO: not found', { status: 404 });
  }

  async alarm() {
    this.counters.alarms += 1;
    this.counters.lastAlarmAt = Date.now();
    this.logger.info?.(
      `[alarm] tick #${this.counters.alarms} clients=${this.clients.size}`,
    );
    // Consumer reconnects itself via its internal backoff loop; alarm() only
    // keeps the DO awake so that loop keeps running across idle periods.
    // Idempotent: always reschedule, even if a stale alarm fired.
    await this.#ensureAlarm();
  }

  async #ensureAlarm() {
    // Unconditional setAlarm — spike showed conditional gate could wedge the
    // DO across Miniflare reloads. Setting overwrites silently on real Workers.
    await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
  }

  #pushReplay(item) {
    this.replay.push(item);
    while (this.replay.length > this.config.server.replayBufferSize) {
      this.replay.shift();
    }
  }

  #broadcast(narration) {
    if (this.clients.size === 0) return;
    const frame = sseFrameBytes('narration', narration);
    const dead = [];
    for (const c of this.clients) {
      try {
        c.controller.enqueue(frame);
      } catch {
        dead.push(c);
      }
    }
    for (const c of dead) this.#dropClient(c, 'enqueue-failed');
    this.counters.broadcasts += 1;
  }

  #openSseClient() {
    const encoder = new TextEncoder();
    const heartbeatMs = this.config.server.heartbeatMs;
    const clientMaxMs = this.config.server.clientMaxMs;
    let client;
    const stream = new ReadableStream({
      start: (controller) => {
        client = {
          controller: { enqueue: (b) => controller.enqueue(b) },
          rawController: controller,
          heartbeat: null,
          closeTimer: null,
        };
        this.clients.add(client);
        this.counters.clientsTotal += 1;
        this.logger.info?.(`[sse] client connected (total=${this.clients.size})`);

        controller.enqueue(encoder.encode(': connected\n\n'));
        for (const r of this.replay) {
          controller.enqueue(encoder.encode(sseFrameStr('replay', r)));
        }

        client.heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            this.#dropClient(client, 'heartbeat-error');
          }
        }, heartbeatMs);

        client.closeTimer = setTimeout(() => {
          try { controller.close(); } catch { /* already closed */ }
          this.#dropClient(client, 'max-age');
        }, clientMaxMs);
      },
      cancel: () => {
        if (client) this.#dropClient(client, 'client-cancel');
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'x-accel-buffering': 'no',
      },
    });
  }

  #dropClient(client, reason) {
    if (!this.clients.has(client)) return;
    this.clients.delete(client);
    if (client.heartbeat) clearInterval(client.heartbeat);
    if (client.closeTimer) clearTimeout(client.closeTimer);
    this.logger.info?.(`[sse] client gone (${reason}, total=${this.clients.size})`);
  }

  #statsResponse() {
    const body = {
      now: Date.now(),
      bootAt: this.bootAt,
      ageSec: Math.floor((Date.now() - this.bootAt) / 1000),
      clients: this.clients.size,
      replaySize: this.replay.length,
      lastNarratedAt: this.lastNarratedAt,
      counters: this.counters,
    };
    return new Response(JSON.stringify(body, null, 2), {
      headers: { 'content-type': 'application/json' },
    });
  }
}

function sseFrameStr(name, payload) {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function sseFrameBytes(name, payload) {
  return new TextEncoder().encode(sseFrameStr(name, payload));
}

function makeLogger(env) {
  const debug = env.DEBUG === '1';
  return {
    info: (...a) => console.info(...a),
    warn: (...a) => console.warn(...a),
    error: (...a) => console.error(...a),
    debug: debug ? (...a) => console.log(...a) : () => {},
  };
}
