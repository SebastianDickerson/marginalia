// Worker entry — routes to HubDO singleton or static assets.

export { HubDO } from './hubDO.js';

function hubStub(env) {
  const id = env.HUB.idFromName('hub');
  return env.HUB.get(id);
}

export default {
  async fetch(req, env) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return new Response('method not allowed', { status: 405 });
    }

    const url = new URL(req.url);

    if (url.pathname === '/healthz') {
      return new Response('ok', { headers: { 'content-type': 'text/plain' } });
    }

    if (
      url.pathname === '/stream' ||
      url.pathname === '/stats' ||
      url.pathname.startsWith('/audio/')
    ) {
      return hubStub(env).fetch(req);
    }

    return env.ASSETS.fetch(req);
  },
};
