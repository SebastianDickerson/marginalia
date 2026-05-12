# Wave 2 — Integration agent

Run AFTER all four Wave 1 agents have set their component rows to `state: "review"` and deleted their claim files. Per Q27, this can be the same human as one of the Wave 1 agents (whoever finishes first), but a fresh `claude` session is cleanest.

---

You are the **integration** agent for the Marginalia project. You own `src/index.js` and are responsible for proving the whole thing runs end-to-end.

## Step 1 — Read first

1. `hub/state/north-star.md`
2. `hub/state/components.json` — confirm every row is `state: "review"`.
3. `hub/decisions/0002-2026-05-12T10:29:54.000Z-scope-grill.md` — focus on **Q8 (the strict-serial gate lives here), Q11, Q15, Q16, Q17, Q18, Q19, Q20, Q26**.
4. Every other `hub/decisions/000N-*-*.md` file written by the Wave 1 agents — they note edge cases and rate-limit-gate ownership.
5. `hub/HUB.md`, `hub/README.md`, `CLAUDE.md`.
6. Read all four built modules to understand their actual surfaces (they may have refined the API in their hand-off decisions).

Invoke the `journal-hub` skill.

## Step 2 — Claim

Agent id: `integration-builder`. Write `hub/claims/integration-builder.md`:

```
component: integration
started: <ISO UTC now>
intent: wire consumer → filter → narrator → server in src/index.js, enforce strict-serial LLM gate (Q8), implement SIGINT clean shutdown (Q20), pass smoke test (Q17), prove end-to-end happy path.
```

Note: `integration` is not a row in `components.json` — do not add it.

## Step 3 — Build

### File: `src/index.js`

Exports:

```js
export async function createApp({ startPipeline = true, env = process.env } = {}) { ... }
// returns an Express app with `.startPipeline()`, `.stopPipeline()`, `.closeClients()` attached as methods (or accessible via closure-captured handles)
```

Why a factory: the smoke test (Q17) calls `createApp({ startPipeline: false })` so it can hit `/stream` without firing up Wikipedia or Anthropic.

**Boot sequence:**

1. `dotenv/config` (top of file).
2. Fail-fast (Q11): if `!env.ANTHROPIC_API_KEY`, `console.error` + `process.exit(1)`. Skip the exit when running under test (`startPipeline === false`) — instead throw, so the smoke test can decide.
3. Build a tiny `logger` (Q18): `{ info, warn, error, debug }` mapping to `console.*`, with `debug` no-op unless `env.DEBUG === '1'`.
4. Log `config` once at info level (Q26).
5. Build modules:
   - `narrator = createNarrator({ logger })`
   - `server = createSseServer({ logger })`
   - `consumer` and `filter` constructed only if `startPipeline`.
6. Express app: `const app = express();` → `server.mount(app)`.
7. Define the pipeline glue:
   - `let inFlight = false;` and `let lastNarratedAt = 0;` live HERE (Q8).
   - `filter.handle` was already constructed with `onAccept` pointed at `runNarration`:
     ```js
     async function runNarration(filteredEvent) {
       const now = Date.now();
       if (inFlight) return;                                    // Q8
       if (now - lastNarratedAt < config.filter.tickMs) return; // Q2/Q8 belt-and-braces
       inFlight = true;
       try {
         const narration = await narrator.narrate(filteredEvent);
         if (narration) {
           lastNarratedAt = Date.now(); // only on success (Q8)
           server.broadcast(narration);
         }
       } finally {
         inFlight = false;
       }
     }
     ```
   - **IMPORTANT** — read the Wave 1A decision file. The filter may already be doing the time-gate. If so, this `runNarration` should only enforce `!inFlight` and let the filter handle the 4s gate. Reconcile and document in your decision file.
8. If `startPipeline`:
   - `consumer = createConsumer({ onEvent: filter.handle, logger });`
   - `consumer.start();`
9. Attach handles to the app for tests:
   - `app.locals.stopPipeline = () => consumer?.stop();`
   - `app.locals.closeAll = () => server.closeAll();`
10. Return `app`.

### Bottom of `src/index.js` — the runnable entrypoint

Outside the factory, when run via `node src/index.js`:

```js
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await createApp();
  const httpServer = app.listen(config.server.port, () => {
    console.info(`[http] listening on http://localhost:${config.server.port}`);
  });
  const shutdown = () => {
    console.info('[shutdown] SIGINT — closing');
    app.locals.stopPipeline?.();
    app.locals.closeAll?.();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
```

Do NOT add `uncaughtException` / `unhandledRejection` handlers (Q20 — let it crash).

## Step 4 — Verify

1. `npm install` (should be a no-op if scaffold ran).
2. `npm test` — smoke test passes (Q17).
3. `npm start`. Open `http://localhost:3000`. Within 30 seconds:
   - Calm sentences fade onto the page.
   - Toggle TTS → audible Attenborough-ish voice.
   - Hover stack → motion freezes.
   - Click a line → toast says "copied".
4. `Ctrl+C` → process exits cleanly within 3 seconds.
5. Force an error case: stop your network briefly. Confirm the process keeps running, `eventsource` reconnects, and narrations resume without restart.

If anything fails: do NOT silently patch the Wave-1 modules. File a question in `hub/questions/` or send an inbox message to the relevant builder (`hub/inbox/<ISO>-integration-builder-<target>.md`).

## Step 5 — Hand off

- For each component row in `components.json` (now that the system runs): `state: "done"`. Update timestamps. (You're the only agent who can confirm "done" because only integration proves it.)
- Write `hub/decisions/<NNNN>-<ISO>-integration-builder.md` summarizing the wiring, the gate-ownership decision (Q8), and confirmation of the scope's "Done when" criteria.
- Run `node hub/rebuild-hub.mjs`.
- Delete `hub/claims/integration-builder.md`.

Project is shippable to localhost. MVP done.
