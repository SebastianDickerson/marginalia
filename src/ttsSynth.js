// ElevenLabs TTS synth — lazy in-memory LRU cache. Worker-shape:
// register() decides eligibility + returns /audio/:id; serveAudio(id)
// returns { status, body, headers } that the DO wraps in a Response.

import { defaultConfig } from './config.js';

export function createTtsSynth({
  logger,
  config: cfgOverride,
  env = {},
  fetch: fetchImpl = globalThis.fetch,
} = {}) {
  const cfg = cfgOverride ?? defaultConfig;
  const tts = cfg.tts.elevenlabs;
  const log = logger ?? console;

  const apiKey = env.ELEVENLABS_API_KEY;
  const voiceId = env.ELEVENLABS_VOICE_ID;
  const enabled = Boolean(apiKey && voiceId);

  if (apiKey && !voiceId) {
    log.error?.('[tts] ELEVENLABS_API_KEY is set but ELEVENLABS_VOICE_ID is missing — audio path disabled');
  }

  // id → { text, buffer? }. Map insertion order is LRU order; bump on access.
  const cache = new Map();
  let dailyCharsUsed = 0;
  const thresholds = [25, 50, 75, 100];
  const thresholdsFired = new Set();
  const errorSeen = new Set();

  function bump(id) {
    if (!cache.has(id)) return;
    const v = cache.get(id);
    cache.delete(id);
    cache.set(id, v);
  }

  function evictExcess() {
    while (cache.size > tts.cacheSize) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
  }

  function maybeLogThreshold() {
    const pct = (dailyCharsUsed / tts.dailyCharCap) * 100;
    for (const t of thresholds) {
      if (pct >= t && !thresholdsFired.has(t)) {
        thresholdsFired.add(t);
        log.info?.(`[tts] day-char total=${dailyCharsUsed} cap=${tts.dailyCharCap} (${t}%)`);
      }
    }
  }

  function register(narration) {
    if (!enabled) return null;
    if (!narration || typeof narration.id !== 'string' || typeof narration.text !== 'string') {
      return null;
    }
    const len = narration.text.length;
    if (len === 0 || len > tts.maxChars) return null;
    if (dailyCharsUsed + len > tts.dailyCharCap) return null;
    cache.set(narration.id, { text: narration.text });
    evictExcess();
    dailyCharsUsed += len;
    maybeLogThreshold();
    return '/audio/' + encodeURIComponent(narration.id);
  }

  async function synthesize(id, text) {
    const url = `${tts.apiBase}/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
    const body = JSON.stringify({
      text,
      model_id: tts.modelId,
      voice_settings: tts.voiceSettings,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), tts.requestTimeoutMs);
    const started = Date.now();
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
        },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        const errText = await safeReadText(res);
        const err = new Error(`elevenlabs ${res.status}: ${truncate(errText, 160)}`);
        err.status = res.status;
        throw err;
      }
      const ab = await res.arrayBuffer();
      const bytes = new Uint8Array(ab);
      const ms = Date.now() - started;
      log.debug?.(`[tts] synth ok id=${id} chars=${text.length} ms=${ms} (cache size=${cache.size})`);
      return bytes;
    } finally {
      clearTimeout(timer);
    }
  }

  async function serveAudio(id) {
    if (!cache.has(id)) {
      return { status: 404, body: new Uint8Array(), headers: {} };
    }
    bump(id);
    const entry = cache.get(id);
    if (entry.buffer) {
      return {
        status: 200,
        body: entry.buffer,
        headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' },
      };
    }
    try {
      const bytes = await synthesize(id, entry.text);
      entry.buffer = bytes;
      return {
        status: 200,
        body: bytes,
        headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' },
      };
    } catch (err) {
      if (!errorSeen.has(id)) {
        errorSeen.add(id);
        log.warn?.(`[tts] synth error id=${id} status=${err.status ?? 'n/a'} msg=${err.message}`);
      }
      return { status: 502, body: new Uint8Array(), headers: {} };
    }
  }

  return {
    register,
    serveAudio,
    isEnabled: () => enabled,
  };
}

function truncate(s, n) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
