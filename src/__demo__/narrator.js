// Demo harness for src/llmNarrator.js.
//
// Usage:  ANTHROPIC_API_KEY=... node src/__demo__/narrator.js
// Or:     put the key in .env and run `node src/__demo__/narrator.js`.
//
// Sends four hand-crafted filtered events through narrate() and prints the
// resulting narration (or null) for each. Useful for prompt-tuning during the
// "step 2 of build order" loop.

import 'dotenv/config';
import { createNarrator } from '../llmNarrator.js';

const events = [
  {
    id: 'demo-1',
    type: 'edit',
    user: 'TideRider',
    title: 'Mangrove forest',
    comment: 'cited new survey of root systems',
    delta: 412,
    wiki: 'enwiki',
    ts: Date.now(),
  },
  {
    id: 'demo-2',
    type: 'edit',
    user: 'an anonymous editor',
    title: 'Dust storm',
    comment: '',
    delta: -87,
    wiki: 'enwiki',
    ts: Date.now(),
  },
  {
    id: 'demo-3',
    type: 'new',
    user: 'PeatGazer',
    title: 'Bog of Allen heronry',
    comment: 'creating article',
    delta: 1184,
    wiki: 'enwiki',
    ts: Date.now(),
  },
  {
    id: 'demo-4',
    type: 'edit',
    user: 'KitWatcher',
    title: 'Pine marten',
    comment: 'fixed wording around denning behaviour',
    delta: 26,
    wiki: 'enwiki',
    ts: Date.now(),
  },
];

const narrator = createNarrator({ logger: console });

for (const ev of events) {
  const t0 = Date.now();
  const narration = await narrator.narrate(ev);
  const dt = Date.now() - t0;
  console.log(`\n--- ${ev.id} (${ev.type}, ${dt}ms) ---`);
  console.log(narration ?? '(null — rejected or errored)');
}
