# Wave 3a — ElevenLabs TTS synth (server module + frontend audio path)

You are the **Wave 3a builder**. Read these files first:

1. `hub/HUB.md` — current state (regenerate via `node hub/rebuild-hub.mjs` before reading).
2. `hub/decisions/0007-2026-05-12T11:34:24.000Z-scope-expansion-elevenlabs.md` — binding Q-set Q28–Q50. THIS IS THE SPEC.
3. `hub/decisions/0002-2026-05-12T10:29:54.000Z-scope-grill.md` — Q1–Q27 baseline (Q10, Q16, Q19, Q26 still authoritative outside the audio path).
4. `src/config.js`, `src/llmNarrator.js`, `src/sseServer.js`, `src/index.js`, `public/tts.js`, `public/app.js` — current code surfaces.

## Your two components

- `tts-synth` (todo → review) — new `src/ttsSynth.js`.
- `tts-toggle` (done → review) — extend `public/tts.js` for the ElevenLabs audio path while preserving the SpeechSynth fallback verbatim.

Both claim under the same agent and ship in one decision file (mirrors Wave 1b's narrator-only pattern).

## Hard rules

- **Do NOT touch `src/index.js`.** That is the integration seam (Q15), claimed by Wave 3b. Your module is wired in by 3b, not by you. Make the surface easy for 3b to wire: see Q43/Q44.
- **Do NOT touch `public/app.js`, `public/index.html`.** Q45.
- **Do NOT add npm deps.** Q46. Use `globalThis.fetch` (Node 22 stable). No `node-fetch`, no `axios`.
- **Soft fallback.** Absence of `ELEVENLABS_API_KEY` = audio path entirely disabled; `npm start` still boots; `/audio` route NOT mounted; `audioUrl` never emitted. Q38.
- **Fail-fast does NOT apply** to the ElevenLabs key. Only `ANTHROPIC_API_KEY` is fail-fast (Q11).

## Surface for `src/ttsSynth.js`

Factory `createTtsSynth({ logger, config, env })`. Return object:

- `mount(app)` — registers `GET /audio/:id`. No-op when disabled.
- `register(narration)` — returns the `audioUrl` string when the audio path should be attached, otherwise `null`. Side-effect: indexes the narration by id (bounded LRU per `config.tts.elevenlabs.cacheSize`), reserves char budget against the daily cap.
- `isEnabled()` — boolean. True when `ELEVENLABS_API_KEY` AND `ELEVENLABS_VOICE_ID` are both set.

The integrator's wire pattern (Q44):

```js
ttsSynth.mount(app);            // BEFORE sseServer.mount(app)
// ...
const audioUrl = ttsSynth.register(narration);
if (audioUrl) narration.audioUrl = audioUrl;
sseServer.broadcast(narration);
```

`register` is the single decision point. It bakes in: enabled check, per-narration size guard (Q37), daily char cap (Q36).

## Cache + budget

- One `Map<id, { text, buffer? }>`. Bump on access, evict oldest when `size > cacheSize` (default 20). Q35.
- `dailyCharsUsed` counter. Increment by `narration.text.length` on every `register` that returns non-null. Reset only on process restart. Q36.
- Threshold logs at 25/50/75/100% — `[tts] day-char total=X cap=Y (Z%)` at `info`. Log each threshold once.
- `/audio/:id` flow: look up entry; if absent → 404; if `buffer` cached → serve `audio/mpeg`; if no buffer → synthesize, cache, serve. On synth error → 502 + warn log. Q39.

## ElevenLabs call

`POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` (non-streaming). Q33.

```
Headers:
  xi-api-key: <ELEVENLABS_API_KEY>
  Accept: audio/mpeg
  Content-Type: application/json
Body:
  {
    "text": narration.text,
    "model_id": config.tts.elevenlabs.modelId,
    "voice_settings": {
      "stability": 0.45,
      "similarity_boost": 0.75,
      "style": 0.30,
      "use_speaker_boost": true
    }
  }
```

Read response as `Buffer.from(await res.arrayBuffer())`. Log `[tts] synth ok id=... chars=... ms=... (cache size=...)` at debug. Errors logged once at warn: `[tts] synth error id=... status=... msg=...`.

## Frontend extension (`public/tts.js`)

Q40. The exported speak path takes `(textOrNarration)` and:

- If passed an object with a string `audioUrl`, play via `new Audio(url)`. `onended` → drain queue. `onerror` → fall back to `SpeechSynthesisUtterance(narration.text)` for THAT line only.
- Else fall back to current SpeechSynth path. **Preserve the existing SpeechSynth code verbatim** — it is the fallback, not deleted.
- Existing bounded-depth-1 queue (Q5) still applies. Pending replaces pending; no `cancel`/interrupt.

Caller in `public/app.js` currently calls `window.Marginalia.tts.speak(narration.text)`. Wave 3b will (probably) change that to pass the whole narration. **Make your `speak` accept both `string` and `narration` object** so the old call site still works without an app.js edit — preserves Q45.

## Config additions

Extend `src/config.js`:

```js
tts: {
  elevenlabs: {
    modelId: process.env.ELEVENLABS_MODEL_ID || 'eleven_turbo_v2_5',
    voiceSettings: { stability: 0.45, similarity_boost: 0.75, style: 0.30, use_speaker_boost: true },
    cacheSize: 20,
    maxChars: 300,
    dailyCharCap: Number(process.env.ELEVENLABS_DAILY_CHAR_CAP) || 30000,
    apiBase: 'https://api.elevenlabs.io',
    requestTimeoutMs: 8000,
  },
},
```

(No magic numbers — Q26 still binding.)

## Env additions

Append to `.env.example` (Q47):

```
# Optional: ElevenLabs TTS. Absent disables the audio path entirely (browser SpeechSynth still works).
ELEVENLABS_API_KEY=
# Required when API key is set. User-provisioned custom voice.
ELEVENLABS_VOICE_ID=
# Optional. Default eleven_turbo_v2_5.
ELEVENLABS_MODEL_ID=
# Optional. Daily character cap kill-switch. Default 30000 (Starter tier).
ELEVENLABS_DAILY_CHAR_CAP=
```

## Verification

- `npm test` → still green. Smoke unchanged (Q49).
- `npm start` without ElevenLabs key → no `/audio` route, no `audioUrl` ever attached, MVP behaviour intact.
- Live test (with key + voice id) is the integrator's verification post-3b, not yours.

## Hand-off

Write `hub/decisions/0008-<ISO>-wave-3a-builder.md`. Flip `tts-synth` and `tts-toggle` rows to `state: "review"`. Release your claim file. Regenerate HUB.

Then write an inbox note to `wave-3b-integrator` covering anything they need to know to wire safely.
