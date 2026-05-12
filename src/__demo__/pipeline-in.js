import { createConsumer } from '../sseConsumer.js';
import { createFilter } from '../eventFilter.js';

let acceptCount = 0;
let startedAt = Date.now();

// Demo gates the rate limiter against its own "last narrated" timestamp.
// In prod the narrator owns this — see hub/decisions/.
let lastNarratedAt = 0;

const filter = createFilter({
  onAccept(ev) {
    acceptCount += 1;
    lastNarratedAt = Date.now();
    const mins = ((Date.now() - startedAt) / 60_000).toFixed(1);
    console.log(
      `[#${acceptCount} +${mins}m] ${ev.type} :: ${ev.title} :: Δ${ev.delta} :: ${ev.user}` +
        (ev.comment ? `\n            ⤷ ${ev.comment}` : '')
    );
  },
  getLastNarratedAt: () => lastNarratedAt,
});

const consumer = createConsumer({
  onEvent: (raw) => filter.handle(raw),
});

consumer.start();
console.log('[pipeline-in demo] subscribing… set DEBUG=1 to see reject buckets. Ctrl-C to quit.');
