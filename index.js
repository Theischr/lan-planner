import webpush from 'web-push';

// Runs every few minutes (see wrangler.toml). For every approved date,
// vigtig dato and itinerary booking, works out the exact moment it should
// be reminded (a fixed number of minutes before a timed event, or a fixed
// morning hour for date-only events), and sends ONE push per event the
// moment that reminder falls due — not a daily bundle.
//
// A small KV-backed "already notified" table stops the same event from
// being reminded twice across cron runs. Recurring (yearly) fixed dates
// are keyed with the year, so they fire again next year.

const TIME_ZONE = 'Europe/Copenhagen';

function envInt(env, name, fallback) {
  const v = parseInt(env[name], 10);
  return Number.isFinite(v) ? v : fallback;
}

function copenhagenDateString(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date); // YYYY-MM-DD
}

// Converts a Europe/Copenhagen wall-clock date+time into the correct UTC
// epoch milliseconds, DST-aware. Uses a two-pass fixed-point approach so it
// stays correct exactly at the two DST transition points each year (a
// naive single-pass version can be off by an hour for an hour or two,
// twice a year).
function offsetAtInstant(instantMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(instantMs)).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  const asIfUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  return asIfUtc - instantMs;
}
function zonedTimeToUtcMs(dateStr, timeStr) {
  const guessMs = new Date(`${dateStr}T${timeStr}:00Z`).getTime();
  let resultMs = guessMs - offsetAtInstant(guessMs);
  resultMs = guessMs - offsetAtInstant(resultMs); // second pass fixes DST-boundary edge cases
  return resultMs;
}

async function getJSON(env, key, fallback) {
  const raw = await env.HUSRAADET_KV.get(key);
  return raw ? JSON.parse(raw) : fallback;
}

function dateLabel(dateStr) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('da-DK', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: TIME_ZONE
  });
}

// Builds the list of candidate reminders across all three sources, each
// with a stable notify-key and the exact UTC moment it should fire.
function collectCandidates(env, dates, fixedDates, itinerary, todayStr) {
  const reminderMin = envInt(env, 'REMINDER_MINUTES', 60);
  const allDayHour = envInt(env, 'ALL_DAY_HOUR', 8);
  const todayYear = todayStr.slice(0, 4);
  const out = [];

  function pushCandidate(key, kind, title, note, occurrenceDate, time) {
    const momentMs = time
      ? zonedTimeToUtcMs(occurrenceDate, time) - reminderMin * 60000
      : zonedTimeToUtcMs(occurrenceDate, String(allDayHour).padStart(2, '0') + ':00');
    out.push({ key, kind, title, note, occurrenceDate, time, momentMs });
  }

  for (const d of dates) {
    if (d.status !== 'approved' || !d.date) continue;
    pushCandidate('date-' + d.id, 'Aftale', d.title, d.note, d.date, d.time || null);
  }

  for (const f of fixedDates) {
    if (!f.date) continue;
    if (f.recurring) {
      const [, mo, da] = f.date.split('-');
      const occurrenceDate = `${todayYear}-${mo}-${da}`;
      pushCandidate('fixed-' + f.id + '-' + todayYear, 'Vigtig dato', f.title, f.note, occurrenceDate, f.time || null);
    } else {
      pushCandidate('fixed-' + f.id, 'Vigtig dato', f.title, f.note, f.date, f.time || null);
    }
  }

  for (const it of itinerary) {
    if (!it.date) continue;
    pushCandidate('itin-' + it.id, 'Ferie', it.title, it.address || it.note, it.date, it.time || null);
  }

  return out;
}

async function sendPayloadToSubs(env, subs, deadEndpoints, payload) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  await Promise.all(subs.map(async (s) => {
    if (deadEndpoints.has(s.endpoint)) return;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload));
    } catch (err) {
      const code = err && err.statusCode;
      if (code === 404 || code === 410) {
        deadEndpoints.add(s.endpoint);
      } else {
        console.error('push failed for', s.endpoint, code, err && err.body);
      }
    }
  }));
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },
  async fetch(request, env) {
    const result = await run(env);
    return new Response('Kørt. ' + result.sent + ' påmindelse(r) sendt, ' + result.dead + ' døde abonnementer fjernet.');
  }
};

async function run(env) {
  const nowMs = Date.now();
  const todayStr = copenhagenDateString(new Date(nowMs));
  const graceMs = 24 * 60 * 60 * 1000; // don't fire reminders more than a day overdue (first run / downtime safety)
  const pruneMs = 3 * 24 * 60 * 60 * 1000; // garbage-collect notified-flags 3 days after they fired

  const [dates, fixedDates, itinerary, subs, notifiedRaw] = await Promise.all([
    getJSON(env, 'date-requests-list', []),
    getJSON(env, 'fixed-dates-list', []),
    getJSON(env, 'itinerary-list', []),
    getJSON(env, 'push-subscriptions', []),
    getJSON(env, 'notified-events', {})
  ]);

  // Prune old entries so this map doesn't grow forever.
  const notified = {};
  for (const [key, firedAtMs] of Object.entries(notifiedRaw)) {
    if (nowMs - firedAtMs < pruneMs) notified[key] = firedAtMs;
  }

  if (!subs.length) {
    await env.HUSRAADET_KV.put('notified-events', JSON.stringify(notified));
    return { sent: 0, dead: 0 };
  }

  const candidates = collectCandidates(env, dates, fixedDates, itinerary, todayStr);
  const due = candidates.filter(c =>
    !notified[c.key] &&
    c.momentMs <= nowMs &&
    (nowMs - c.momentMs) < graceMs
  );

  const deadEndpoints = new Set();
  for (const c of due) {
    const payload = {
      title: c.kind + ': ' + c.title,
      body: dateLabel(c.occurrenceDate) + (c.time ? ' kl. ' + c.time : '') + (c.note ? ' — ' + c.note : ''),
      url: '/'
    };
    await sendPayloadToSubs(env, subs, deadEndpoints, payload);
    notified[c.key] = nowMs;
  }

  const remainingSubs = subs.filter(s => !deadEndpoints.has(s.endpoint));
  await Promise.all([
    env.HUSRAADET_KV.put('notified-events', JSON.stringify(notified)),
    remainingSubs.length !== subs.length
      ? env.HUSRAADET_KV.put('push-subscriptions', JSON.stringify(remainingSubs))
      : Promise.resolve()
  ]);

  return { sent: due.length, dead: deadEndpoints.size };
}
