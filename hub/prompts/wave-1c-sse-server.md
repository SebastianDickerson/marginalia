# Wave 1C — SSE server agent (sse-server)

Run AFTER Wave 0 is complete. Can run in parallel with Wave 1A, 1B, 1D.

---

You are claiming component **`sse-server`** in the Marginalia project.

## Step 1 — Read first

1. `hub/state/north-star.md`
2. `hub/state/components.json` — find `sse-server` row.
3. `hub/decisions/0002-2026-05-12T10:29:54.000Z-scope-grill.md` — focus on **Q1, Q9, Q12, Q16, Q18, Q19, Q20, Q26**.
4. `hub/decisions/0003-*-scaffold.md`.
5. `hub/HUB.md`, `hub/README.md`, `CLAUDE.md`.
6. `src/config.js` for `config.server.*`.

Invoke the `journal-hub` skill.

## Step 2 — Claim

Agent id: `sse-server-builder`. Write `hub/claims/sse-server-builder.md`:

```
component: sse-server
started: <ISO UTC now>
intent: build the Express SSE server with shared broadcast (Q1), replay buffer (Q9), named replay events (Q12), heartbeat (Q16), dead-client eviction (Q20), and static serving for /public.
```

Update `components.json`: `state: "in_progress"`, `owner: "sse-server-builder"`, `updated`.

## Step 3 — Build

### File: `src/sseServer.js`

Exports:

```js
export function createSseServer({ logger }) { ... }
// returns { mount(app), broadcast(narration), getClientCount() }
```

- `mount(app)` attaches `GET /stream` and `express.static('public')` to the provided Express app. Also serves a 404 on everything else.
- `broadcast(narration)` is called by the integrator each time the narrator successfully produces a narration. The server:
  1. Pushes the narration onto an internal FIFO `replayBuffer` (cap `config.server.replayBufferSize`, shift oldest).
  2. Writes `event: narration\ndata: ${JSON.stringify(narration)}\n\n` to every connected client. If `res.write` throws or returns falsy and the socket is dead, evict (also handled by `req.on('close')`).
- `getClientCount()` returns the number of currently-connected clients (used by integrator for logging).

### `/stream` handler details

1. Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
2. Flush headers immediately (`res.flushHeaders?.()`).
3. Add `res` to a `Set<res> clients`.
4. **Replay buffer flush (Q9, Q12)**: iterate `replayBuffer` in FIFO order, write each as `event: replay\ndata: ${json}\n\n`. Do NOT stagger — the frontend handles 400ms pacing (Q12).
5. Send an initial `: connected\n\n` comment line.
6. Schedule `setInterval(() => res.write(': heartbeat\n\n'), config.server.heartbeatMs)`. Save the interval id on the `res` for cleanup.
7. `req.on('close', () => { clients.delete(res); clearInterval(res.__heartbeatId); logger.info(...) })`.

### Logging (Q18)

- `info` on client connect: `[sse] client connected (total=${clients.size})`.
- `info` on disconnect.
- `info` on every broadcast: `[sse] broadcast → ${clients.size} client(s)`.
- `warn` on `res.write` throw with eviction.

### Demo harness: `src/__demo__/server.js`

Runnable via `node src/__demo__/server.js`. Wires Express + this server, plus a `setInterval` that calls `broadcast` every 4 seconds with a fake narration:

```js
{ id: 'fake:' + Date.now(), text: 'A small editor stirs.', title: 'Demo', ts: Date.now() }
```

Listens on `config.server.port`. Lets the frontend agent (Wave 1D) develop against a real stream without waiting for the real pipeline.

## Step 4 — Constraints

- Do NOT touch `src/index.js`, the consumer/filter/narrator, or `public/`.
- Do NOT add deps.
- Do NOT add CORS — frontend is same-origin.
- Do NOT bind to a specific port if `port` is `0` in tests (`app.listen(0)` is used by Q17 smoke test — your `mount` should not call `listen` itself; that's the integrator's job).
- Process-level handlers (SIGINT, etc.) are the integrator's responsibility (Q20). Your module just needs to expose a `closeAll()` so the integrator can iterate `clients` and `res.end()` on shutdown — add that to the returned API.

Updated returned API:

```js
{ mount(app), broadcast(narration), getClientCount(), closeAll() }
```

## Step 5 — Hand off

- Update `components.json`: `state: "review"`, refresh `updated`.
- Write `hub/decisions/<NNNN>-<ISO>-sse-server-builder.md` noting any deviations or observed behaviour.
- Run `node hub/rebuild-hub.mjs`.
- Delete your claim file.
