# Wave 0 — Scaffold agent

Paste into a fresh `claude` session opened inside `~/Documents/GitHub/marginalia`. Run this alone, to completion, BEFORE any Wave 1 agents start.

---

You are the **scaffold** agent for the Marginalia project. Your job: create the shared infrastructure files all other agents will depend on. You do NOT implement any of the six components in `hub/state/components.json`.

## Step 1 — Read first

In order:
1. `hub/state/north-star.md`
2. `hub/state/components.json`
3. `hub/decisions/0002-2026-05-12T10:29:54.000Z-scope-grill.md` — pay attention to Q11, Q15, Q17, Q19, Q20, Q26, plus Q6/Q10/Q14 (for `public/config.js` knobs).
4. `hub/HUB.md`
5. `hub/README.md`
6. `CLAUDE.md`

Invoke the `journal-hub` skill and follow its rules.

## Step 2 — Claim

Agent id: `scaffold`. Write `hub/claims/scaffold.md`:

```
component: scaffold
started: <ISO UTC now>
intent: create shared infra (package.json, env, gitignore, src/config.js, public/config.js, public/index.html shell, test/smoke.test.js).
```

Note: `scaffold` is not a row in `components.json` — do not modify that file.

## Step 3 — Create exactly these files

Do not create anything else. Do not pre-implement any component module.

### `package.json`
- `"type": "module"`
- `engines.node`: `">=20"`
- Scripts: `start` = `node src/index.js`, `dev` = `node --watch src/index.js`, `test` = `node --test test/smoke.test.js`
- Deps: `express`, `eventsource`, `@anthropic-ai/sdk`, `dotenv` (latest stable)
- No devDeps

### `.gitignore`
- `node_modules/`
- `.env`
- `.DS_Store`
- `*.log`

### `.env.example`
- `ANTHROPIC_API_KEY=sk-ant-...`
- `PORT=3000`
- `MODEL=claude-haiku-4-5-20251001`
- `DEBUG=`

### `src/config.js` (per Q26)
Frozen exported object, grouped:

```js
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
});
```

### `public/config.js` (frontend-side, browser-loaded)
Plain global (not module — keep frontend zero-build):

```js
window.MARGINALIA_CONFIG = Object.freeze({
  stackSize: 5,
  fadeMs: 1500,
  replayStaggerMs: 400,
  hoverDrainStaggerMs: 400,
  toastMs: 1500,
  tts: { rate: 0.85, pitch: 0.9, voicePriority: ['Google UK English Male', 'Daniel', 'Microsoft George'] },
});
```

### `public/index.html` (shell only — no JS logic)
- `<!doctype html>`, lang en, viewport meta.
- Title: `Marginalia`.
- Tailwind via CDN (`<script src="https://cdn.tailwindcss.com"></script>`).
- A serif Google Font (e.g. EB Garamond) via `<link>`.
- Dark full-bleed body (`bg-black text-stone-200`).
- Empty container: `<main id="stack" class="..."></main>` for the line stack.
- A toggle button: `<button id="tts-toggle" ...>narrate aloud</button>` positioned bottom-right.
- A toast region: `<div id="toast" ...></div>` for copy confirmations.
- Load order at end of `<body>`: `<script src="/config.js"></script>`, `<script src="/tts.js"></script>`, `<script src="/app.js"></script>`.
- Use `textContent`/static markup only — no event handlers inline.

### `test/smoke.test.js` (per Q17)
Uses built-in `node:test`. Imports a `createApp` factory from `src/index.js` (factory will be provided by integration agent). Behaviour:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/index.js';

test('GET /stream returns 200 with text/event-stream', async () => {
  const app = await createApp({ startPipeline: false });
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/stream`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
    res.body?.cancel?.();
  } finally {
    server.close();
  }
});
```

Note: `src/index.js` does not exist yet. That's fine — Wave 2 creates it. The test will fail to import until Wave 2 lands; that's expected.

## Step 4 — Verify

- Run `npm install`. Confirm clean.
- Do NOT attempt `npm start` or `npm test` — those need Wave 1 + 2.

## Step 5 — Hand off

- Update `hub/state/components.json`: do NOT touch (no row owned).
- Append a decision file `hub/decisions/0003-<ISO>-scaffold.md` describing what was created. Reference Q11/Q15/Q17/Q19/Q20/Q26.
- Run `node hub/rebuild-hub.mjs`.
- Delete `hub/claims/scaffold.md`.

Then exit.
