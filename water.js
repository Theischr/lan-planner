/* ---------- Vand-påmindelse (lokal timer + delt tæller pr. dag) ---------- */

const WATER_PREFS_KEY = 'lan-water-prefs';
const WATER_LAST_KEY = 'lan-water-last'; // ms: sidst jeg drak ELLER sidst jeg blev mindet
let waterTimer = null;
let waterDue = false;

function waterPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(WATER_PREFS_KEY) || '{}');
    return { enabled: p.enabled !== false, minutes: Number(p.minutes) || 45, sound: p.sound !== false };
  } catch (e) {
    return { enabled: true, minutes: 45, sound: true };
  }
}
function saveWaterPrefs(p) {
  try { localStorage.setItem(WATER_PREFS_KEY, JSON.stringify(p)); } catch (e) {}
}
function waterLast() {
  try { return Number(localStorage.getItem(WATER_LAST_KEY)) || 0; } catch (e) { return 0; }
}
function setWaterLast(ms) {
  try { localStorage.setItem(WATER_LAST_KEY, String(ms)); } catch (e) {}
}
function waterToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function waterBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.14);
    });
  } catch (e) {}
}

function fireWaterReminder() {
  waterDue = true;
  setWaterLast(Date.now()); // næste påmindelse først efter et nyt interval
  const p = waterPrefs();
  if (p.sound) waterBeep();
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification('Tid til vand 💧', { body: 'Tag et glas vand — så holder du hele aftenen.' }); } catch (e) {}
  }
  renderWater();
}

function waterTick() {
  const p = waterPrefs();
  if (!p.enabled || !myName) { renderWater(); return; }
  if (!waterLast()) setWaterLast(Date.now());
  if (Date.now() - waterLast() >= p.minutes * 60000) fireWaterReminder();
  else renderWater();
}

async function drinkWater() {
  waterDue = false;
  setWaterLast(Date.now());
  if (!myName) return;
  const day = waterToday();
  const water = { ...(data.water || {}) };
  // behold kun de seneste 3 dage
  Object.keys(water).sort().slice(0, -2).forEach((k) => { if (k !== day) delete water[k]; });
  const today = { ...(water[day] || {}) };
  today[myName] = (today[myName] || 0) + 1;
  water[day] = today;
  renderWater();
  try { await saveData({ ...data, water }); } catch (e) {}
  renderWater();
}

function renderWater() {
  const bar = document.getElementById('water-bar');
  if (!bar) return;
  const p = waterPrefs();
  const counts = (data.water && data.water[waterToday()]) || {};
  const names = Array.from(new Set([...(data.people || []).map((x) => (typeof x === 'string' ? x : x.name)), ...Object.keys(counts)])).filter(Boolean);
  const score = names.map((n) => `${n} ${counts[n] || 0}`).join(' · ');
  document.getElementById('water-score').textContent = score ? `I dag: ${score}` : '';

  const status = document.getElementById('water-status');
  bar.classList.toggle('water-due', waterDue && p.enabled);
  bar.classList.toggle('water-off', !p.enabled);
  if (!p.enabled) {
    status.textContent = 'Vandpåmindelse er slået fra';
  } else if (waterDue) {
    status.textContent = '💧 Tid til et glas vand!';
  } else {
    const left = Math.max(0, p.minutes * 60000 - (Date.now() - (waterLast() || Date.now())));
    status.textContent = `💧 Næste vand om ${Math.ceil(left / 60000)} min`;
  }
  document.getElementById('water-enabled').checked = p.enabled;
  document.getElementById('water-sound').checked = p.sound;
  document.getElementById('water-minutes').value = String(p.minutes);
}

function initWater() {
  const bar = document.getElementById('water-bar');
  if (!bar || bar.dataset.ready) return;
  bar.dataset.ready = '1';
  document.getElementById('water-drink-btn').onclick = drinkWater;
  document.getElementById('water-settings-btn').onclick = () => {
    document.getElementById('water-settings').classList.toggle('hidden');
  };
  const update = () => {
    saveWaterPrefs({
      enabled: document.getElementById('water-enabled').checked,
      minutes: Number(document.getElementById('water-minutes').value) || 45,
      sound: document.getElementById('water-sound').checked,
    });
    setWaterLast(Date.now());
    waterDue = false;
    renderWater();
  };
  ['water-enabled', 'water-minutes', 'water-sound'].forEach((id) => {
    document.getElementById(id).addEventListener('change', update);
  });
  document.getElementById('water-notif-btn').onclick = () => {
    if ('Notification' in window) Notification.requestPermission();
  };
  waterTimer = setInterval(waterTick, 15000);
  waterTick();
}

document.addEventListener('DOMContentLoaded', initWater);
if (document.readyState !== 'loading') initWater();
