# Wave 3b — TTS integration (wire ElevenLabs synth into src/index.js)

You are the **Wave 3b integrator**. You own `src/index.js` for this wave and nothing else. Decision `0007` Q44 says this seam is yours.

You may run in parallel with Wave 3a — the surface contract in `0007` Q43 is binding for both of you. You cannot flip rows to `done` (or even reach final live verification) until 3a is at `state: "review"`. See "Parallel vs sequential" below.

---

## Step 1 — Read first

1. `hub/HUB.md` — regenerate via `node hub/rebuild-hub.mjs` before reading.
2. `hub/state/north-star.md`, `hub/state/components.json`.
3. `hub/decisions/0007-2026-05-12T11:34:24.000Z-scope-expansion-elevenlabs.md` — binding Q-set Q28–Q50. Pay closest attention to **Q31, Q32, Q34, Q36, Q38, Q39, Q43, Q44**.
4. `hub/decisions/0002-2026-05-12T10:29:54.000Z-scope-grill.md` — Q11 fail-fast applies only to `ANTHROPIC_API_KEY`. Q15, Q16, Q17, Q19, Q20, Q26 still authoritative.
5. `hub/decisions/0006-2026-05-12T10:59:31.000Z-integration-builder.md` — current shape of `src/index.js`. Your edits extend this; you do not rewrite it.
6. **If `hub/decisions/0008-*-wave-3a-*.md` exists**, read it before writing any wiring. Wave 3a's hand-off decision may record deviations from Q43's surface. Reconcile those in your own decision file (`0009-*`).
7. `src/index.js`, `src/config.js`, `src/sseServer.js`, `src/llmNarrator.js` — current code. You must understand the existing pipeline before extending it.

Invoke the `journal-hub` skill.

## Step 2 — Claim

Agent id: `wave-3b-integrator`. Write `hub/claims/wave-3b-integrator.md`:

```
component: tts-integration
started: <ISO UTC now>
intent: wire ttsSynth into src/index.js per 0007 Q44. Mount /audio route before sseServer catch-all. Attach audioUrl to broadcast when register returns non-null. No other behavioural changes.
```

Note: `tts-integration` is not a row in `components.json` — do not add one. The work proves itself through end-to-end verification of the existing rows.

## Step 3 — Build

### File: `src/index.js` (extend only — do NOT rewrite)

Diff shape, against the current file:

1. **Import.** Add `import { createTtsSynth } from './ttsSynth.js';` alongside the other module imports.

2. **Construct.** After `const server = createSseServer({ logger });`, before the `inFlight`/`lastNarratedAt` declarations:

    ```js
    const ttsSynth = createTtsSynth({ logger, config, env });
    ```

    Always construct it. The factory itself decides whether to be enabled (Q38). Construction must not throw on missing keys.

3. **Mount BEFORE the SSE server.** In the Express setup block, change:

    ```js
    const app = express();
    server.mount(app);
    ```

    to:

    ```js
    const app = express();
    ttsSynth.mount(app);   // Q44 — must precede server.mount so the catch-all 404 stays last
    server.mount(app);
    ```

    If `ttsSynth` is disabled, `mount` is a no-op (Q43 contract). Do not branch on `isEnabled()` here; the synth owns that.

4. **Wire `register` + `audioUrl` into `runNarration`.** Inside the existing `try` block of `runNarration`, after `await narrator.narrate(filteredEvent)` resolves and `narration` is truthy, before `server.broadcast(narration)`:

    ```js
    const audioUrl = ttsSynth.register(narration);
    if (audioUrl) narration.audioUrl = audioUrl;
    server.broadcast(narration);
    ```

    `register` is idempotent enough to call exactly once per successful narration (Q35 owns the LRU; Q36 owns the budget; Q37 owns the per-narration size guard). Do not call it on falsy narrations.

5. **No new shutdown work.** `ttsSynth` has no `stop()`; the in-memory LRU + char counter need no flush (Q35: restart resets). Do not add anything to `app.locals.stopPipeline` or `closeAll`.

6. **No other edits.** Do not touch the runnable-entrypoint block at the bottom, signal handlers, fail-fast key check, or logger construction. The Q11 key check stays gated on `ANTHROPIC_API_KEY` only — never extend it to ElevenLabs (Q38).

### Files you must NOT touch

- `src/ttsSynth.js` — Wave 3a's territory.
- `public/tts.js` — Wave 3a's territory.
- `public/app.js`, `public/index.html` — Q45 still binding.
- `src/config.js` — Wave 3a extends it for `config.tts.elevenlabs.*`. Do not duplicate.
- `.env.example` — Wave 3a appends ElevenLabs vars. Do not duplicate.
- Wave-1 component modules (`sseConsumer`, `eventFilter`, `llmNarrator`, `sseServer`) — these are done; touching them silently is a contract violation per the Wave-2 prompt's spirit.

## Step 4 — Parallel vs sequential

You may have started in parallel with Wave 3a. Handle the two scenarios:

**Scenario A — `src/ttsSynth.js` exists already (3a finished first).**

Read `hub/decisions/0008-*-wave-3a-*.md` to confirm the actual surface. If it deviates from Q43 (e.g. `register` renamed, or returns a different shape, or `mount` returns a router that has to be attached differently), update your wiring accordingly and document the reconciliation in your hand-off decision. Proceed to Step 5 verification.

**Scenario B — `src/ttsSynth.js` does NOT exist yet (3a still building).**

Write your wiring blind against Q43. Static imports won't error until runtime, so the edit lands cleanly. Then:

- Do NOT run `npm start` (it will crash on the missing module — wasted noise).
- You MAY run `npm test`. It also imports `src/index.js`, so it will fail until 3a lands. **Expected — do not panic-revert.** Document in your hand-off that final verification is gated on 3a landing.
- Poll `hub/state/components.json` and `hub/decisions/` for 3a's completion. When `tts-synth` flips to `state: "review"` AND `0008-*-wave-3a-*.md` exists, return to Step 4 Scenario A.
- Do not flip your rows / write your hand-off decision until verification (Step 5) has actually run green.

## Step 5 — Verify

Run only after `src/ttsSynth.js` exists (3a landed). The verification is end-to-end; you are the only agent who can confirm "done" for the new audio path, just as the Wave 2 integrator was the only agent who could confirm MVP done.

1. **`npm test`** — smoke still green. No `ELEVENLABS_API_KEY` in test env → audio path disabled → smoke assertion unchanged (Q49).

2. **`npm start` without ElevenLabs key.** With only `ANTHROPIC_API_KEY` set:
    - Log line `[config]` shows `tts.elevenlabs.*` knobs present.
    - No `[tts] …` log lines fire at boot.
    - Hit `http://localhost:3000`, watch a narration land. Confirm via devtools network tab that NO `/audio/...` request fires (frontend should detect missing `audioUrl` and use SpeechSynth).
    - `GET /audio/anything` should return `404` (route disabled OR registered as no-op — both acceptable per Q43).

3. **`npm start` with full env** — `ANTHROPIC_API_KEY` + `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`:
    - First narration arrives within ~10s. Frontend with TTS toggled on plays MP3.
    - Network tab shows `GET /audio/<id>` returning `200 audio/mpeg`.
    - Server log shows `[tts] synth ok id=… chars=… ms=…` (debug, requires `DEBUG=1`).
    - Replay buffer audio: open a second browser tab. Last ≤5 narrations replay; cached entries serve MP3, evicted ones fall back to SpeechSynth silently.

4. **Daily-cap kill-switch.** Stop, set `ELEVENLABS_DAILY_CHAR_CAP=200`, restart. After ~2 narrations the `audioUrl` stops being attached. Frontend falls back to SpeechSynth on subsequent lines without errors in console. Threshold log lines (`[tts] day-char total=… cap=… (Z%)`) fire at 25/50/75/100%.

5. **Synth-error fallback.** Stop, set `ELEVENLABS_VOICE_ID=invalid-voice-id-aaaa`, restart with full env otherwise. First narration's `/audio/:id` returns `502`. Frontend `audio.onerror` triggers SpeechSynth for that line. Server log shows `[tts] synth error …` once. No process crash. Subsequent narrations behave the same (no retry storm; one warn per call is fine).

6. **SIGINT clean shutdown still ≤3 s** (Q20). Audio path adds no flush requirement.

If any of 1–6 fail and the cause is in `src/ttsSynth.js` or `public/tts.js`, do NOT silently patch. Write `hub/inbox/<ISO>-wave-3b-integrator-wave-3a-builder.md` describing the failure and the spec clause that's violated. Leave your row flips on hold until 3a fixes it (they'll move their own rows back through `review`).

## Step 6 — Hand off

Once Step 5 is green AND `tts-synth` + `tts-toggle` are both at `state: "review"`:

- Write `hub/decisions/0009-<ISO>-wave-3b-integrator.md`. Cover:
  - Diff applied to `src/index.js` (specifically the four edits in Step 3).
  - Any reconciliation of 3a's surface against Q43 (cite line numbers in `0008-*`).
  - Verification results for Steps 5.1–5.6 — exact log excerpts where useful.
  - Confirmation that no files outside `src/index.js` were touched.
- Flip `tts-synth` row from `review` → `done` in `hub/state/components.json`.
- Flip `tts-toggle` row from `review` → `done`.
- The remaining five rows (`sse-consumer`, `event-filter`, `llm-narrator`, `sse-server`, `frontend`) stay `done` — you did not touch them.
- Run `node hub/rebuild-hub.mjs`.
- Delete `hub/claims/wave-3b-integrator.md`.

Project is shippable with ElevenLabs audio path. SpeechSynth remains the documented fallback.

## Hard "do not" list

- Do not write `src/ttsSynth.js` if it's missing. Wait for 3a. Sending the prompt to 3b does not authorise you to do 3a's work.
- Do not extend Q11 fail-fast to the ElevenLabs key. Q38 mandates soft-fallback.
- Do not add `uncaughtException` / `unhandledRejection` handlers (Q20).
- Do not add a global "TTS off" runtime toggle separate from the budget gate. Q36's budget gate is the only kill-switch for the server side. Frontend toggle is preserved as-is.
- Do not commit / push without the user asking.
- Do not flip rows to `done` without Step 5 actually run green.

## Pending input (does not block your authoring)

`ELEVENLABS_VOICE_ID` may not be in `.env` yet at your start time. The wiring work is env-driven and authoring proceeds without it. Only the live test in Step 5.3–5.5 needs the key + voice id. If they aren't present when you reach Step 5, stop after Step 5.2 (no-key MVP-intact verify), note the deferred verification in your decision file, and surface the request via `hub/questions/` so the user can supply the value before final sign-off.
