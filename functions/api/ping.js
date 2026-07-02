function checkAuth(env, request) {
  const provided = request.headers.get('X-Access-Code') || '';
  if (!env.ACCESS_CODE) return true;
  return provided === env.ACCESS_CODE;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!checkAuth(env, request)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response('pong', {
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
  });
}
