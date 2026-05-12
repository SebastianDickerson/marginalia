import 'dotenv/config';
import express from 'express';
import { config } from './config.js';
import { createConsumer } from './sseConsumer.js';
import { createFilter } from './eventFilter.js';
import { createNarrator } from './llmNarrator.js';
import { createSseServer } from './sseServer.js';

function makeLogger(env) {
  const debugOn = env.DEBUG === '1';
  return {
    info: (...a) => console.info(...a),
    warn: (...a) => console.warn(...a),
    error: (...a) => console.error(...a),
    debug: debugOn ? (...a) => console.log(...a) : () => {},
  };
}

export async function createApp({ startPipeline = true, env = process.env } = {}) {
  if (startPipeline && !env.ANTHROPIC_API_KEY) {
    console.error('[fatal] ANTHROPIC_API_KEY is not set (see .env.example)');
    process.exit(1);
  }

  const logger = makeLogger(env);
  logger.info('[config]', JSON.stringify(config));

  const narrator = startPipeline ? createNarrator({ logger }) : null;
  const server = createSseServer({ logger });

  let inFlight = false;
  let lastNarratedAt = 0;

  async function runNarration(filteredEvent) {
    if (inFlight) return;
    const now = Date.now();
    if (now - lastNarratedAt < config.filter.tickMs) return;
    inFlight = true;
    try {
      const narration = await narrator.narrate(filteredEvent);
      if (narration) {
        lastNarratedAt = Date.now();
        server.broadcast(narration);
      }
    } finally {
      inFlight = false;
    }
  }

  const app = express();
  server.mount(app);

  let consumer = null;
  let filter = null;

  if (startPipeline) {
    filter = createFilter({
      onAccept: runNarration,
      getLastNarratedAt: () => lastNarratedAt,
      logger,
    });
    consumer = createConsumer({ onEvent: filter.handle, logger });
    consumer.start();
  }

  app.locals.stopPipeline = () => {
    consumer?.stop();
    filter?.stop();
  };
  app.locals.closeAll = () => server.closeAll();

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await createApp();
  const httpServer = app.listen(config.server.port, () => {
    console.info(`[http] listening on http://localhost:${config.server.port}`);
  });
  const shutdown = () => {
    console.info('[shutdown] signal received — closing');
    app.locals.stopPipeline?.();
    app.locals.closeAll?.();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
