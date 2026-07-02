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

  const url = new URL(request.url);
  const requested = parseInt(url.searchParams.get('size') || '5000000', 10);
  const size = Math.max(100000, Math.min(requested || 5000000, 20000000)); // clamp 100KB - 20MB

  const chunkSize = 65536;
  const chunk = new Uint8Array(chunkSize);
  crypto.getRandomValues(chunk);

  const buf = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += chunkSize) {
    buf.set(chunk.subarray(0, Math.min(chunkSize, size - offset)), offset);
  }

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store',
    },
  });
}
