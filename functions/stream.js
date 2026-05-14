export async function onRequestGet({ request, env }) {
  const backend = env.BACKEND_URL;
  if (!backend) {
    return new Response('BACKEND_URL not configured', { status: 500 });
  }

  const upstream = await fetch(`${backend.replace(/\/$/, '')}/stream`, {
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    signal: request.signal,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
