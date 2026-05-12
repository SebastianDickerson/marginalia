export const config = Object.freeze({
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
    model: process.env.MODEL || 'claude-haiku-4-5-20251001',
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
    port: Number(process.env.PORT) || 3000,
    replayBufferSize: 5,
    heartbeatMs: 20_000,
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
      modelId: process.env.ELEVENLABS_MODEL_ID || 'eleven_turbo_v2_5',
      voiceSettings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.30,
        use_speaker_boost: true,
      },
      cacheSize: 20,
      maxChars: 300,
      dailyCharCap: Number(process.env.ELEVENLABS_DAILY_CHAR_CAP) || 30000,
      requestTimeoutMs: 8000,
    },
  },
});
