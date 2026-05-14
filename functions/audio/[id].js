export async function onRequestGet({ request, env, params }) {
  const backend = env.BACKEND_URL;
  if (!backend) {
    return new Response('BACKEND_URL not configured', { status: 500 });
  }

  const id = encodeURIComponent(params.id);
  const upstream = await fetch(`${backend.replace(/\/$/, '')}/audio/${id}`, {
    method: 'GET',
    signal: request.signal,
  });

  if (!upstream.ok) {
    return new Response(null, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
}
