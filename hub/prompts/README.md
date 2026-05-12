# Kickoff prompts

Paste-and-go prompts for each agent in the Marginalia build. See `hub/decisions/0002-2026-05-12T10:29:54.000Z-scope-grill.md` for the 27 design decisions these prompts enforce.

## Order

1. **Wave 0 — scaffold** (`wave-0-scaffold.md`). Run alone, to completion. Creates `package.json`, `.env.example`, `.gitignore`, `src/config.js`, `public/config.js`, `public/index.html` shell, `test/smoke.test.js`.
2. **Wave 1 — four parallel terminals** (after Wave 0):
   - A — `wave-1a-pipeline-in.md` (sse-consumer + event-filter)
   - B — `wave-1b-llm-narrator.md` (llm-narrator)
   - C — `wave-1c-sse-server.md` (sse-server)
   - D — `wave-1d-frontend.md` (frontend + tts-toggle)
3. **Wave 2 — integration** (`wave-2-integration.md`). After all Wave 1 rows in `components.json` are `state: "review"` and claims are deleted.

## How to use one

```bash
cd ~/Documents/GitHub/marginalia
claude
```

Then paste the file's content as your first message. Each prompt is self-contained — it tells the agent what to read, what to claim, what to build, what to NOT touch, and how to hand off.

## If a Wave-1 agent finishes way before the others

Per Q27 they're allowed to pick up the implicit "integration" claim early, but only once all four Wave-1 component sets are at `state: "review"`. Otherwise the integrator will have to redo work as later modules land.
