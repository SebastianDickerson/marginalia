import { defaultConfig } from './config.js';

const IPV4_RE = /^\d+\.\d+\.\d+\.\d+$/;
const IPV6_RE = /:.*:/;
const HAS_LETTER_RE = /[A-Za-z]/;
const CTRL_CHARS_RE = /[\x00-\x1F\x7F]/g;

function looksAnonymous(user) {
  if (!user || typeof user !== 'string') return true;
  if (IPV4_RE.test(user)) return true;
  if (IPV6_RE.test(user)) return true;
  if (!HAS_LETTER_RE.test(user)) return true;
  return false;
}

function truncate(str, max) {
  if (typeof str !== 'string') return '';
  return str.length > max ? str.slice(0, max) : str;
}

function stripCtrl(str) {
  return str.replace(CTRL_CHARS_RE, '');
}

export function createFilter({
  onAccept,
  getLastNarratedAt = () => 0,
  logger = console,
  debug = false,
  config = defaultConfig,
} = {}) {
  if (typeof onAccept !== 'function') {
    throw new Error('createFilter: onAccept is required');
  }

  const lastSeen = new Map();
  let dedupHits = 0;
  let dedupReportTimer = null;

  function startDedupReporter() {
    if (dedupReportTimer) return;
    dedupReportTimer = setInterval(() => {
      if (dedupHits > 0) {
        logger.warn?.(`[eventFilter] dedup hits in last 60s: ${dedupHits}`);
        dedupHits = 0;
      }
    }, 60_000);
    // No .unref(): Workers setInterval returns a number with no .unref method.
    // The DO tears the timer down via stop() on shutdown.
  }

  function reject(bucket, ev) {
    if (debug) {
      const title = ev?.title || '?';
      logger.warn?.(`[eventFilter] reject ${bucket} :: ${title}`);
    }
  }

  function touchLru(title, now) {
    if (lastSeen.has(title)) lastSeen.delete(title);
    lastSeen.set(title, now);
    while (lastSeen.size > config.filter.titleCooldownLruCap) {
      const oldestKey = lastSeen.keys().next().value;
      lastSeen.delete(oldestKey);
    }
  }

  function handle(rawEvent) {
    startDedupReporter();
    if (!rawEvent || typeof rawEvent !== 'object') return;

    // 1. Hard filter
    if (rawEvent.wiki !== config.filter.wiki) return reject('nonEnwiki', rawEvent);
    if (rawEvent.bot !== false) return reject('bot', rawEvent);
    if (!config.filter.allowedTypes.includes(rawEvent.type)) return reject('type', rawEvent);

    const newLen = rawEvent.length?.new ?? 0;
    const oldLen = rawEvent.length?.old ?? 0;
    const diff = Math.abs(newLen - oldLen);
    if (rawEvent.type === 'edit' && diff < config.filter.minBytes) {
      return reject('delta', rawEvent);
    }

    const rawTitle = typeof rawEvent.title === 'string' ? rawEvent.title : '';
    if (config.filter.titleBlockedPrefixes.some((p) => rawTitle.startsWith(p))) {
      return reject('titlePrefix', rawEvent);
    }

    // 2. Title cooldown — mark on cooldown-pass.
    const now = Date.now();
    const normalizedTitle = rawTitle.replaceAll('_', ' ');
    const cooldownUntil = (lastSeen.get(normalizedTitle) ?? 0) + config.filter.titleCooldownMs;
    if (cooldownUntil > now) {
      dedupHits += 1;
      return reject('cooldown', { ...rawEvent, title: normalizedTitle });
    }
    touchLru(normalizedTitle, now);

    // 3. Rate-limit gate (narrator owns lastNarratedAt).
    const lastNarratedAt = Number(getLastNarratedAt()) || 0;
    if (now - lastNarratedAt < config.filter.tickMs) {
      return reject('rateLimit', { ...rawEvent, title: normalizedTitle });
    }

    // 4-5. Normalize + sanitize
    const rawUser = typeof rawEvent.user === 'string' ? rawEvent.user : '';
    const user = looksAnonymous(rawUser)
      ? 'an anonymous editor'
      : stripCtrl(truncate(rawUser, config.filter.inputMax.user));
    const title = stripCtrl(truncate(normalizedTitle, config.filter.inputMax.title));
    const rawComment = typeof rawEvent.comment === 'string' ? rawEvent.comment.trim() : '';
    const comment = stripCtrl(truncate(rawComment, config.filter.inputMax.comment));

    // 6. Delta
    const delta = rawEvent.type === 'edit' ? newLen - oldLen : newLen;

    // 7. Build filtered event
    const ts = rawEvent.meta?.dt ? new Date(rawEvent.meta.dt).getTime() : now;
    const id = `${rawEvent.wiki}:${rawEvent.meta?.id ?? `${ts}-${title}`}`;
    const filtered = { user, title, comment, delta, wiki: rawEvent.wiki, type: rawEvent.type, ts, id };

    if (debug) {
      logger.info?.(`[eventFilter] accept :: ${title} (Δ${delta}, ${rawEvent.type})`);
    }

    try {
      onAccept(filtered);
    } catch (e) {
      logger.warn?.('[eventFilter] onAccept threw', e?.message || '');
    }
  }

  function stop() {
    if (dedupReportTimer) {
      clearInterval(dedupReportTimer);
      dedupReportTimer = null;
    }
  }

  return { handle, stop };
}
