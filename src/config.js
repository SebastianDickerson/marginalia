export const defaultConfig = Object.freeze({
  filter: {
    minBytes: 50,
    tickMs: 4000,
    titleCooldownMs: 5 * 60 * 1000,
    titleCooldownLruCap: 200,
    allowedTypes: ['edit', 'new'],
    wiki: 'enwiki',
    titleBlockedPrefixes: ['User:', 'Talk:', 'Wikipedia:', 'File:', 'Template:'],
    inputMax: { user: 50, title: 100, comment: 200 },
  },
  narrator: {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 80,
    temperature: 0.9,
    timeoutMs: 5000,
    rejectPatterns: [
      /wikipedia/i,
      /["'“”‘’]/,
      /\bAI\b|language model|instructions?|system prompt|ignore (the|above|previous)/i,
      /[A-Z]{10,}/,
    ],
    rejectMaxWords: 30,
  },
  server: {
    replayBufferSize: 5,
    heartbeatMs: 20_000,
    clientMaxMs: 4 * 60_000,
  },
  frontendMirror: {
    stackSize: 5,
    fadeMs: 1500,
    replayStaggerMs: 400,
    hoverDrainStaggerMs: 400,
  },
  tts: {
    elevenlabs: {
      apiBase: 'https://api.elevenlabs.io',
      modelId: 'eleven_turbo_v2_5',
      voiceSettings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.30,
        use_speaker_boost: true,
      },
      cacheSize: 100,
      maxChars: 300,
      dailyCharCap: 30000,
      requestTimeoutMs: 8000,
    },
  },
});

function numberOr(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function buildConfig(env = {}) {
  const d = defaultConfig;
  return Object.freeze({
    ...d,
    narrator: Object.freeze({
      ...d.narrator,
      model: env.MODEL || d.narrator.model,
    }),
    tts: Object.freeze({
      elevenlabs: Object.freeze({
        ...d.tts.elevenlabs,
        modelId: env.ELEVENLABS_MODEL_ID || d.tts.elevenlabs.modelId,
        dailyCharCap: numberOr(env.ELEVENLABS_DAILY_CHAR_CAP, d.tts.elevenlabs.dailyCharCap),
      }),
    }),
  });
}

export const config = defaultConfig;
