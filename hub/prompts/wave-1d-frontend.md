# Wave 1D — Frontend agent (frontend + tts-toggle)

Run AFTER Wave 0 is complete. Can run in parallel with Wave 1A, 1B, 1C. Develop against the Wave 1C demo harness (`node src/__demo__/server.js`) before the real pipeline lands.

This agent owns TWO components because they're both in `public/`.

---

You are claiming components **`frontend`** and **`tts-toggle`** in the Marginalia project.

## Step 1 — Read first

1. `hub/state/north-star.md`
2. `hub/state/components.json` — find `frontend` and `tts-toggle` rows.
3. `hub/decisions/0002-2026-05-12T10:29:54.000Z-scope-grill.md` — focus on **Q5, Q6, Q9, Q10, Q12, Q14, Q16, Q24, Q26**.
4. `hub/decisions/0003-*-scaffold.md` to see the `public/index.html` shell and `public/config.js` knobs already in place.
5. `hub/HUB.md`, `hub/README.md`, `CLAUDE.md`.
6. The actual `public/index.html` and `public/config.js`.

Invoke the `journal-hub` skill.

## Step 2 — Claim

Agent id: `frontend-builder`. Write `hub/claims/frontend-builder.md`:

```
component: frontend
also: tts-toggle
started: <ISO UTC now>
intent: build the 5-line fading-stack renderer (Q6), replay handler with stagger (Q12), hover-pause + click-to-copy (Q14), TTS toggle with bounded queue (Q5) and persisted voice priority (Q10).
```

Update both rows in `components.json`: `state: "in_progress"`, `owner: "frontend-builder"`, `updated`.

## Step 3 — Build

### File: `public/app.js` — owns `frontend`

**Goals**: connect to `/stream`, render incoming narrations into a fading stack, handle the replay-buffer dump with frontend stagger, support hover-pause, support click-to-copy.

**EventSource setup**

```js
const es = new EventSource('/stream');
```

- Listen for `event: narration` (live).
- Listen for `event: replay` (buffered backfill, Q12).
- Plain `message` handler logs and ignores (defensive).
- `error` handler: log to console only. EventSource auto-reconnects.

**Stack rendering (Q6)**

- `const stack = document.getElementById('stack');`
- Stack lives inside the existing `<main id="stack">` from the shell. Style it with Tailwind classes: full-width, flex-col, items-center, gap, padded, max-width container.
- Each line is a `<div class="line">` created via `document.createElement` with `textContent` ONLY (Q24). No `innerHTML`, ever.
- Visual: serif font (already loaded), large size (~2rem), max-width ~70ch, centered.
- Insertion: new line `prepend` to `stack`, starts with opacity 0 + CSS transition, transitions to opacity 1 over `MARGINALIA_CONFIG.fadeMs`.
- After `stackSize` lines exist, the oldest fades from opacity 0.4 → 0 over `fadeMs`, then `.remove()`.
- Apply opacity-ramp top→bottom: iterate the children after each change and assign opacity `1.0 → 0.4` linearly. CSS variable or inline style; not Tailwind (dynamic value).

**Replay stagger (Q12)**

- Maintain a queue `replayQueue: Narration[]`.
- On each `event: replay`, push into queue and start a timer (if not already running) that shifts one off every `MARGINALIA_CONFIG.replayStaggerMs` and inserts it normally.
- Once the queue empties, live narrations (`event: narration`) bypass the queue and insert immediately.
- If a live narration arrives WHILE the replay queue is still draining, push it onto the same queue (preserves visual order).

**Hover pause (Q14)**

- `stack.addEventListener('mouseenter', () => paused = true)`.
- `stack.addEventListener('mouseleave', () => { paused = false; drainPauseQueue(); })`.
- When `paused`, incoming narrations push onto `pauseQueue` instead of being inserted.
- On `mouseleave`, drain `pauseQueue` at `hoverDrainStaggerMs` intervals using the same insertion path as replay.
- TTS is NOT paused (Q14 — explicitly leave it alone).

**Click-to-copy (Q14)**

- Each line has `cursor-pointer` Tailwind class.
- Click handler: `navigator.clipboard.writeText(line.textContent)`.
- Show `<div id="toast">` with text "copied" for `MARGINALIA_CONFIG.toastMs`. Use a CSS transition for fade.

**TTS bridge**

- After successfully inserting a narration into the stack, call `window.Marginalia.tts?.speak?.(narration.text)`. This decouples the frontend from the TTS module — `tts.js` defines `window.Marginalia.tts` if loaded.

### File: `public/tts.js` — owns `tts-toggle`

**Goals**: toggle button, bounded-depth-1 speech queue (Q5), default OFF persisted in `localStorage` (Q10), voice priority resolution with `voiceschanged` fallback (Q10).

**State**

- `let enabled = localStorage.getItem('marginalia.tts') === 'on';`
- `let resolvedVoice = null;`
- `let speaking = false;`
- `let pendingText = null;`

**Voice resolution (Q10)**

```js
function resolveVoice() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  for (const name of MARGINALIA_CONFIG.tts.voicePriority) {
    const v = voices.find(v => v.name === name);
    if (v) return v;
  }
  return voices.find(v => /en[-_]GB/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang)) || voices[0];
}
```

- On script load: try `resolveVoice()`. If `null` (Chrome async load), `speechSynthesis.addEventListener('voiceschanged', () => { resolvedVoice = resolveVoice(); })`.

**Toggle button**

- `const btn = document.getElementById('tts-toggle');`
- Reflect state in label: `narrate aloud` vs `silence`. Reflect via `aria-pressed`.
- On click: flip `enabled`, persist to `localStorage.setItem('marginalia.tts', enabled ? 'on' : 'off')`. If turning off, call `speechSynthesis.cancel()`. If turning on and `!resolvedVoice`, call `resolveVoice()` (browsers populate voices after a user gesture in some cases).

**`speak(text)` (Q5 bounded queue)**

```js
window.Marginalia = window.Marginalia || {};
window.Marginalia.tts = {
  speak(text) {
    if (!enabled || !text) return;
    if (speaking) {
      pendingText = text; // replace any earlier pending
      return;
    }
    utter(text);
  },
};

function utter(text) {
  speaking = true;
  const u = new SpeechSynthesisUtterance(text);
  if (resolvedVoice) u.voice = resolvedVoice;
  u.rate = MARGINALIA_CONFIG.tts.rate;
  u.pitch = MARGINALIA_CONFIG.tts.pitch;
  u.onend = u.onerror = () => {
    speaking = false;
    if (pendingText) {
      const next = pendingText;
      pendingText = null;
      utter(next);
    }
  };
  speechSynthesis.speak(u);
}
```

- When toggle flips to off mid-sentence: `speechSynthesis.cancel()` plus clear `pendingText` and `speaking = false`.

### Manual test plan

While Wave 1C demo server runs (`node src/__demo__/server.js`):
- Open `http://localhost:3000`. Confirm five fake lines appear, fading.
- Hover stack → fading stops, new lines queue. Leave → queue drains at 400ms.
- Click a line → toast says "copied"; verify clipboard.
- Toggle TTS → fake narrations spoken at slow rate. Toggle off mid-utterance → speech stops.
- Reload page → TTS toggle state matches `localStorage`.

## Step 4 — Constraints

- Do NOT touch anything under `src/`.
- Do NOT use `innerHTML` anywhere (Q24).
- Do NOT add a bundler or build step. Plain `<script>` tags, browser-native modules at most.
- Do NOT add new dependencies (no npm). Tailwind is CDN only (already in shell).
- Do NOT use `alert/confirm/prompt` — those break the page.

## Step 5 — Hand off

- Update both rows in `components.json`: `state: "review"`, refresh `updated`.
- Write `hub/decisions/<NNNN>-<ISO>-frontend-builder.md` summarizing what was built and any deviations.
- Run `node hub/rebuild-hub.mjs`.
- Delete your claim file.
