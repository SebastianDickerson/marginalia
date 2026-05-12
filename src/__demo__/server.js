import express from 'express';
import { config } from '../config.js';
import { createSseServer } from '../sseServer.js';

const app = express();
const sse = createSseServer({ logger: console });
sse.mount(app);

const sampleLines = [
  'A small editor stirs.',
  'The cursor hovers above a forgotten footnote.',
  'In the dim margins, a citation drifts past.',
  'An anonymous hand smooths a dangling clause.',
  'Somewhere, a redirect blinks twice and is gone.',
];

let i = 0;
const interval = setInterval(() => {
  const text = sampleLines[i % sampleLines.length];
  i += 1;
  const fake = {
    id: 'fake:' + Date.now(),
    text,
    title: 'Demo',
    ts: Date.now(),
  };
  sse.broadcast(fake);
}, 4000);

const server = app.listen(config.server.port, () => {
  console.info(`[demo] listening on http://localhost:${config.server.port}`);
});

function shutdown(signal) {
  console.info(`[demo] ${signal} — shutting down`);
  clearInterval(interval);
  sse.closeAll();
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
