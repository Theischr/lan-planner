const KV_KEY = 'lan-planner-data';
const DEFAULT_DATA = JSON.stringify({ people: [], dates: [], agreedDateId: null });

function checkAuth(env, request) {
  const provided = request.headers.get('X-Access-Code') || '';
  if (!env.ACCESS_CODE) return true; // no code configured = open access
  return provided === env.ACCESS_CODE;
}

function unauthorized() {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!checkAuth(env, request)) return unauthorized();

  const value = await env.DATA_KV.get(KV_KEY);
  return new Response(value || DEFAULT_DATA, {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!checkAuth(env, request)) return unauthorized();

  const body = await request.text();
  try {
    JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await env.DATA_KV.put(KV_KEY, body);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
