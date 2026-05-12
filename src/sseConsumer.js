import { EventSource } from 'eventsource';

const UPSTREAM_URL = 'https://stream.wikimedia.org/v2/stream/recentchange';

export function createConsumer({ onEvent, logger = console } = {}) {
  if (typeof onEvent !== 'function') {
    throw new Error('createConsumer: onEvent is required');
  }
  let es = null;

  function start() {
    if (es) return;
    es = new EventSource(UPSTREAM_URL);

    es.addEventListener('open', () => {
      logger.info?.('[sseConsumer] upstream open');
    });

    es.addEventListener('error', (err) => {
      logger.warn?.('[sseConsumer] upstream error (eventsource will reconnect)', err?.message || '');
    });

    es.addEventListener('message', (msg) => {
      let raw;
      try {
        raw = JSON.parse(msg.data);
      } catch (e) {
        logger.warn?.('[sseConsumer] failed to parse message', e?.message || '');
        return;
      }
      try {
        onEvent(raw);
      } catch (e) {
        logger.warn?.('[sseConsumer] onEvent threw', e?.message || '');
      }
    });
  }

  function stop() {
    if (!es) return;
    es.close();
    es = null;
    logger.info?.('[sseConsumer] upstream closed');
  }

  return { start, stop };
}
