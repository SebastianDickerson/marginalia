# Project notes

## Multi-agent coordination

This project uses the journal-hub skill for multi-agent coordination.
Before editing files or spawning subagents, consult that skill and follow
its claim/decision/inbox conventions.

## Build waves

Implementation runs in numbered waves. Kick off each wave in a fresh
`claude` session via the project slash command `/wave <id>`, which inlines
the matching prompt from `hub/prompts/wave-<id>.md`. Run order:

- `/wave 0` — scaffold (single agent, runs alone first).
- `/wave 1a` / `/wave 1b` / `/wave 1c` / `/wave 1d` — Wave 1 components,
  runnable in parallel terminals.
- `/wave 2` — integration (single agent, after all Wave 1 rows hit
  `state: "review"`).

Each wave agent claims its component(s) per journal-hub, writes a
hand-off decision, and releases its claim. Coordinator sessions watch
`hub/questions/` and `hub/inbox/` and answer in-place.
