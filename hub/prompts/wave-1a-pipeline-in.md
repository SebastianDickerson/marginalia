# Wave 1A — Pipeline-in agent (sse-consumer + event-filter)

Run AFTER Wave 0 is complete. Paste into a fresh `claude` session inside `~/Documents/GitHub/marginalia`.

This agent owns TWO components because they're tightly coupled in data direction.

---

You are claiming components **`sse-consumer`** and **`event-filter`** in the Marginalia project.

## Step 1 — Read first

1. `hub/state/north-star.md`
2. `hub/state/components.json` — find `sse-consumer` and `event-filter` rows.
3. `hub/decisions/0002-2026-05-12T10:29:54.000Z-scope-grill.md` — focus on **Q2, Q4, Q13, Q16, Q18, Q21, Q23, Q26, Q27**.
4. `hub/decisions/0003-*-scaffold.md` (the scaffold's decision log — read `src/config.js` knobs).
5. `hub/HUB.md`, `hub/README.md`, `CLAUDE.md`.
6. The actual `src/config.js` to see what's available.

Invoke the `journal-hub` skill.

## Step 2 — Claim

Agent id: `pipeline-in-builder`. Two claim files (one per component) since two rows in `components.json` are yours:

- `hub/claims/pipeline-in-builder.md`:
  ```
  component: sse-consumer
  also: event-filter
  started: <ISO UTC now>
  intent: build upstream SSE subscriber and the filter/dedup/normalize/rate-limit pipeline per Q2/Q4/Q13/Q21/Q23.
  ```

Then update `components.json` rows for both `sse-consumer` and `event-filter`:
- `state: "in_progress"`
- `owner: "pipeline-in-builder"`
- `updated: <ISO UTC now>`

## Step 3 — Build

### File: `src/sseConsumer.js`

Subscribes to `https://stream.wikimedia.org/v2/stream/recentchange` using the `eventsource` npm package (Q4). Exports:

```js
export function createConsumer({ onEvent, logger }) { ... }
// returns { start(), stop() }
```

- `start()` opens the EventSource; on each `message` event, parse JSON, call `onEvent(raw)`.
- Let `eventsource` handle reconnect natively (Q4). Log `open`, `error` to `logger.info` / `logger.warn`.
- `stop()` closes the EventSource cleanly (used by SIGINT path, Q20).
- Do NOT filter inside this module. Raw events only.
- Do NOT use `process.on(...)`. Process-level handlers are the integrator's job (Q20).

### File: `src/eventFilter.js`

Combines: filter rules + input truncation/sanitization (Q21) + normalization (Q23) + title cooldown dedup (Q13) + drop-style rate limit (Q2). Exports:

```js
export function createFilter({ onAccept, logger }) { ... }
// returns { handle(rawEvent) }
```

Internally maintains `lastNarratedAt` and a `Map<title, lastSeenTs>` (LRU bounded to `config.filter.titleCooldownLruCap`).

`handle(rawEvent)`:
1. **Hard filter** (drop if any fail):
   - `rawEvent.wiki === config.filter.wiki` (`enwiki`)
   - `rawEvent.bot === false`
   - `config.filter.allowedTypes.includes(rawEvent.type)`
   - `Math.abs((rawEvent.length?.new ?? 0) - (rawEvent.length?.old ?? 0)) >= config.filter.minBytes` (skip for `type === 'new'` — see normalization below)
   - title does NOT start with any of `config.filter.titleBlockedPrefixes`
2. **Title cooldown** (Q13): if `lastSeen.get(title) + titleCooldownMs > now`, drop. On accept, set `lastSeen.set(title, now)` and prune LRU if `> cap`.
3. **Rate limit** (Q2): if `now - lastNarratedAt < config.filter.tickMs`, drop. Note: do NOT set `lastNarratedAt` here — the narrator sets it on successful narration (Q8). This module just *gates*. (Alternative: pass a shared `tick` accessor in via the integrator. Document your choice in your decision file.)
4. **Normalize** (Q23):
   - `title = title.replaceAll('_', ' ')`
   - `user`: if matches IPv4 (`/^\d+\.\d+\.\d+\.\d+$/`) or IPv6 (`/:.*:/`), or contains no letters → replace with `'an anonymous editor'`.
   - `comment`: trim. If empty/whitespace, leave empty string — the narrator will omit the sentence.
5. **Sanitize** (Q21):
   - Truncate `user` to `config.filter.inputMax.user`, `title` to `inputMax.title`, `comment` to `inputMax.comment`.
   - Strip control chars: `.replace(/[\x00-\x1F\x7F]/g, '')`.
6. **Compute delta**:
   - For `edit`: `delta = (length.new ?? 0) - (length.old ?? 0)` (signed).
   - For `new`: `delta = length.new ?? 0` (positive, narrator templates handle differently per Q22).
7. **Build filtered event** matching Q16 contract exactly:
   ```js
   {
     user, title, comment, delta,
     wiki: rawEvent.wiki,
     type: rawEvent.type,
     ts: new Date(rawEvent.meta.dt).getTime(),
     id: `${rawEvent.wiki}:${rawEvent.meta.id}`,
   }
   ```
8. Call `onAccept(filteredEvent)`.

Log at `debug` per Q18 when events are rejected (with reason bucket: `bot|nonEnwiki|type|delta|titlePrefix|cooldown|rateLimit`). Log dedup-hit-count once per 60s at `warn`.

### Demo harness (Q27): `src/__demo__/pipeline-in.js`

A standalone runner that wires `createConsumer` → `createFilter` and dumps accepted events to stdout. Should be runnable via `node src/__demo__/pipeline-in.js`. Useful for tuning filter rates ("step 1 of build order" in scope).

## Step 4 — Constraints

- Do NOT touch `src/index.js`, `src/llmNarrator.js`, `src/sseServer.js`, or anything under `public/`.
- Do NOT add new dependencies beyond what scaffold installed.
- Do NOT modify `src/config.js`. If a knob is missing, file a question in `hub/questions/` and wait.
- If filter rates feel wrong during demo testing, propose changes via decision file — don't silently tune.

## Step 5 — Hand off

- Update both component rows: `state: "review"`, refresh `updated`.
- Write `hub/decisions/<NNNN>-<ISO>-pipeline-in-builder.md` summarizing what was built and any open notes (especially the rate-limit-gate ownership question).
- Run `node hub/rebuild-hub.mjs`.
- Delete `hub/claims/pipeline-in-builder.md`.
