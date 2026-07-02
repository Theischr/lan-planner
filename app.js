const API_URL = '/api/data';
const NAME_KEY = 'lan-planner-my-name';
const CODE_KEY = 'lan-planner-access-code';
const SEEN_DRINKS_KEY = 'lan-planner-seen-drinks';

const VOTE_TYPES = {
  ja: { label: 'Ja', color: 'var(--green)', activeClass: 'active-ja' },
  maybe: { label: 'Måske', color: 'var(--amber)', activeClass: 'active-maybe' },
  nej: { label: 'Nej', color: 'var(--red)', activeClass: 'active-nej' },
};

const DEFAULT_CHECKLIST = [
  { id: 'pc', label: 'PC' },
  { id: 'skaerm', label: 'Skærm' },
  { id: 'mus', label: 'Mus' },
  { id: 'tastatur', label: 'Tastatur' },
  { id: 'musemaatte', label: 'Musemåtte' },
  { id: 'kabler', label: 'Kabler (strøm + skærm)' },
];

function emptyData() {
  return {
    people: [],
    dates: [],
    agreedDateId: null,
    drinks: [],
    games: [],
    meals: { snacks: [], lunch: [], dinner: [] },
    points: [],
    checklistItems: DEFAULT_CHECKLIST.slice(),
    checklistChecked: {},
  };
}

let data = emptyData();
let myName = localStorage.getItem(NAME_KEY) || null;
let countdownInterval = null;
let activeTab = 'calendar';

const $ = (id) => document.getElementById(id);

function accessCode() {
  return localStorage.getItem(CODE_KEY) || '';
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function apiFetch(options = {}) {
  const res = await fetch(API_URL, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'X-Access-Code': accessCode(),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem(CODE_KEY);
    showGate(true);
    throw new Error('unauthorized');
  }
  return res;
}

function normalizeData(raw) {
  const base = emptyData();
  const next = { ...base, ...raw };
  next.meals = { ...base.meals, ...(raw.meals || {}) };
  if (!next.checklistItems || next.checklistItems.length === 0) next.checklistItems = base.checklistItems;
  if (!next.checklistChecked) next.checklistChecked = {};
  if (!next.drinks) next.drinks = [];
  if (!next.games) next.games = [];
  if (!next.points) next.points = [];
  return next;
}

async function loadData() {
  try {
    const res = await apiFetch();
    if (!res.ok) throw new Error('load failed');
    const raw = await res.json();
    data = normalizeData(raw);
    showError(null);
  } catch (e) {
    if (e.message !== 'unauthorized') showError('Kunne ikke indlæse data. Tjek din forbindelse.');
    throw e;
  }
}

async function saveData(next) {
  data = next;
  setStatus('gemmer…', 'led-amber');
  try {
    const res = await apiFetch({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (!res.ok) throw new Error('save failed');
    setStatus('tilsluttet', 'led-green');
    showError(null);
  } catch (e) {
    if (e.message !== 'unauthorized') showError('Kunne ikke gemme ændringen. Prøv igen.');
    setStatus('fejl', 'led-amber');
  }
  render();
}

function setStatus(text, ledClass) {
  $('status-text').textContent = text;
  $('status-led').className = 'led ' + ledClass;
}

function showError(msg) {
  const box = $('error-box');
  if (!msg) {
    box.classList.add('hidden');
    box.textContent = '';
  } else {
    box.classList.remove('hidden');
    box.textContent = msg;
  }
}

function showGate(show) {
  $('gate').classList.toggle('hidden', !show);
  $('app').classList.toggle('hidden', show);
}

function scoreDate(d) {
  const votes = Object.values(d.votes || {});
  const ja = votes.filter((v) => v === 'ja').length;
  const nej = votes.filter((v) => v === 'nej').length;
  return ja * 2 - nej;
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
}

/* ---------- Tabs ---------- */

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach((p) => {
        p.classList.toggle('hidden', p.id !== `tab-${activeTab}`);
      });
    });
  });
}

/* ---------- Master render ---------- */

function render() {
  const hasName = Boolean(myName);
  $('name-section').classList.toggle('hidden', hasName);
  $('main-section').classList.toggle('hidden', !hasName);

  if (!hasName) {
    renderNameChips();
    return;
  }

  $('who-am-i-name').textContent = myName;
  renderCountdown();
  renderDates();
  renderDrinks();
  renderGames();
  renderMeals();
  renderPoints();
  renderChecklist();
  checkNewDrinks();
}

function renderNameChips() {
  const box = $('name-chips');
  box.innerHTML = '';
  data.people.forEach((p) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = p;
    btn.onclick = () => chooseName(p);
    box.appendChild(btn);
  });
}

async function chooseName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return;
  localStorage.setItem(NAME_KEY, trimmed);
  myName = trimmed;
  if (!data.people.includes(trimmed)) {
    await saveData({ ...data, people: [...data.people, trimmed] });
  } else {
    render();
  }
}

function switchName() {
  localStorage.removeItem(NAME_KEY);
  myName = null;
  render();
}

/* ---------- Countdown + Calendar (unchanged core) ---------- */

function renderCountdown() {
  const banner = $('countdown-banner');
  const agreed = data.dates.find((d) => d.id === data.agreedDateId);
  if (!agreed) {
    banner.classList.add('hidden');
    if (countdownInterval) clearInterval(countdownInterval);
    return;
  }
  banner.classList.remove('hidden');
  $('countdown-date').textContent = formatDate(agreed.date);
  $('countdown-location').textContent = agreed.location ? `Hos ${agreed.location}` : 'Lokation ikke valgt endnu';

  if (countdownInterval) clearInterval(countdownInterval);
  const tick = () => {
    const target = new Date(`${agreed.date}T${agreed.time || '00:00'}:00`);
    const diff = target.getTime() - Date.now();
    const el = $('countdown-timer');
    if (diff <= 0) {
      el.textContent = 'LAN-tiden er startet! 🎮';
      clearInterval(countdownInterval);
      return;
    }
    const s = Math.floor(diff / 1000);
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    el.textContent = `${days}d ${String(hours).padStart(2, '0')}t ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  };
  tick();
  countdownInterval = setInterval(tick, 1000);

  $('unagree-btn').onclick = () => saveData({ ...data, agreedDateId: null });
}

function renderDates() {
  const list = $('dates-list');
  list.innerHTML = '';

  if (data.dates.length === 0) {
    list.innerHTML = '<div class="empty">Ingen datoer endnu. Foreslå den første ovenfor.</div>';
    return;
  }

  const sorted = [...data.dates].sort((a, b) => a.date.localeCompare(b.date));
  const bestScore = Math.max(...sorted.map(scoreDate));
  const bestId = sorted.length > 1 ? sorted.reduce((a, b) => (scoreDate(b) > scoreDate(a) ? b : a)).id : null;

  sorted.forEach((d) => {
    const isBest = d.id === bestId && bestScore > -Infinity;
    const isAgreed = d.id === data.agreedDateId;

    const card = document.createElement('div');
    card.className = 'date-card' + (isAgreed ? ' agreed' : isBest ? ' best' : '');

    const header = document.createElement('div');
    header.className = 'date-card-header';
    const titleWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'date-title';
    title.textContent = formatDate(d.date);
    titleWrap.appendChild(title);
    if (isAgreed) {
      const tag = document.createElement('div');
      tag.className = 'date-tag agreed';
      tag.textContent = 'Aftalt dato';
      titleWrap.appendChild(tag);
    } else if (isBest) {
      const tag = document.createElement('div');
      tag.className = 'date-tag best';
      tag.textContent = 'Bedste match lige nu';
      titleWrap.appendChild(tag);
    }
    header.appendChild(titleWrap);

    const trash = document.createElement('button');
    trash.className = 'trash-btn';
    trash.title = 'Fjern dato';
    trash.textContent = '✕';
    trash.onclick = () => removeDate(d.id);
    header.appendChild(trash);
    card.appendChild(header);

    const locRow = document.createElement('div');
    locRow.className = 'location-row';
    const select = document.createElement('select');
    select.className = 'select';
    select.innerHTML = '<option value="">Lokation ikke valgt</option>' +
      data.people.map((p) => `<option value="${p}" ${d.location === p ? 'selected' : ''}>Hos ${p}</option>`).join('');
    select.onchange = () => setLocation(d.id, select.value);
    locRow.appendChild(select);

    const timeInput = document.createElement('input');
    timeInput.className = 'time-input';
    timeInput.type = 'time';
    timeInput.value = d.time || '';
    timeInput.title = 'Starttid (bruges til nedtælling)';
    timeInput.onchange = () => setTime(d.id, timeInput.value);
    locRow.appendChild(timeInput);
    card.appendChild(locRow);

    const voteRow = document.createElement('div');
    voteRow.className = 'vote-buttons';
    Object.entries(VOTE_TYPES).forEach(([key, v]) => {
      const btn = document.createElement('button');
      const mine = d.votes && d.votes[myName] === key;
      btn.className = 'vote-btn' + (mine ? ' ' + v.activeClass : '');
      btn.textContent = v.label;
      btn.onclick = () => vote(d.id, key);
      voteRow.appendChild(btn);
    });
    card.appendChild(voteRow);

    const ledPanel = document.createElement('div');
    ledPanel.className = 'led-panel';
    data.people.forEach((p) => {
      const choice = d.votes ? d.votes[p] : null;
      const color = choice ? VOTE_TYPES[choice].color : 'var(--border)';
      const item = document.createElement('div');
      item.className = 'led-item';
      item.title = `${p}: ${choice ? VOTE_TYPES[choice].label : 'Ikke stemt'}`;
      item.innerHTML = `<span class="led" style="background:${color}"></span><span class="led-label">${p}</span>`;
      ledPanel.appendChild(item);
    });
    card.appendChild(ledPanel);

    const agreeRow = document.createElement('div');
    agreeRow.className = 'agree-row';
    const agreeBtn = document.createElement('button');
    agreeBtn.className = 'agree-btn' + (isAgreed ? ' is-agreed' : '');
    agreeBtn.textContent = isAgreed ? '✓ Aftalt dato' : 'Marker som aftalt';
    agreeBtn.onclick = () => saveData({ ...data, agreedDateId: isAgreed ? null : d.id });
    agreeRow.appendChild(agreeBtn);
    card.appendChild(agreeRow);

    list.appendChild(card);
  });
}

async function addPerson() {
  const input = $('new-person-input');
  const trimmed = input.value.trim();
  if (!trimmed || data.people.includes(trimmed)) return;
  await saveData({ ...data, people: [...data.people, trimmed] });
  input.value = '';
}

async function addDate() {
  const input = $('new-date-input');
  if (!input.value) return;
  if (data.dates.some((d) => d.date === input.value)) return;
  const entry = { id: uid(), date: input.value, location: '', time: '', votes: {} };
  await saveData({ ...data, dates: [...data.dates, entry] });
  input.value = '';
}

async function removeDate(id) {
  const next = { ...data, dates: data.dates.filter((d) => d.id !== id) };
  if (data.agreedDateId === id) next.agreedDateId = null;
  await saveData(next);
}

async function vote(id, choice) {
  if (!myName) return;
  const next = {
    ...data,
    dates: data.dates.map((d) => (d.id === id ? { ...d, votes: { ...d.votes, [myName]: choice } } : d)),
  };
  await saveData(next);
}

async function setLocation(id, person) {
  const next = { ...data, dates: data.dates.map((d) => (d.id === id ? { ...d, location: person } : d)) };
  await saveData(next);
}

async function setTime(id, time) {
  const next = { ...data, dates: data.dates.map((d) => (d.id === id ? { ...d, time } : d)) };
  await saveData(next);
}

/* ---------- Drinks ---------- */

function renderDrinks() {
  const list = $('drinks-list');
  list.innerHTML = '';

  const hasPermissionAsked = 'Notification' in window && Notification.permission === 'default';
  $('notif-hint').classList.toggle('hidden', !hasPermissionAsked);

  const sorted = [...data.drinks].sort((a, b) => b.timestamp - a.timestamp);
  if (sorted.length === 0) {
    list.innerHTML = '<div class="empty">Ingen bestillinger endnu.</div>';
    return;
  }

  sorted.forEach((d) => {
    const card = document.createElement('div');
    card.className = 'drink-card' + (d.done ? ' done' : '');

    const info = document.createElement('div');
    info.className = 'drink-info';
    info.innerHTML = `<span class="drink-item-name">${escapeHtml(d.item)}</span><span class="drink-meta">${escapeHtml(d.person)} · ${formatTime(d.timestamp)}</span>`;
    card.appendChild(info);

    const btn = document.createElement('button');
    btn.className = 'done-btn' + (d.done ? ' is-done' : '');
    btn.textContent = d.done ? '✓ Lavet' : 'Marker lavet';
    btn.onclick = () => toggleDrinkDone(d.id);
    card.appendChild(btn);

    list.appendChild(card);
  });
}

async function orderDrink() {
  const input = $('drink-item-input');
  const item = input.value.trim();
  if (!item || !myName) return;
  const entry = { id: uid(), item, person: myName, timestamp: Date.now(), done: false };
  markDrinkSeen(entry.id);
  await saveData({ ...data, drinks: [...data.drinks, entry] });
  input.value = '';
}

async function toggleDrinkDone(id) {
  const next = { ...data, drinks: data.drinks.map((d) => (d.id === id ? { ...d, done: !d.done } : d)) };
  await saveData(next);
}

function getSeenDrinkIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_DRINKS_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function markDrinkSeen(id) {
  const seen = getSeenDrinkIds();
  seen.add(id);
  localStorage.setItem(SEEN_DRINKS_KEY, JSON.stringify([...seen]));
}

function checkNewDrinks() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const seen = getSeenDrinkIds();
  const unseen = data.drinks.filter((d) => !seen.has(d.id) && d.person !== myName);
  unseen.forEach((d) => {
    new Notification('Ny drink-bestilling 🍺', {
      body: `${d.person} bestilte: ${d.item}`,
    });
    markDrinkSeen(d.id);
  });
  // Mark all currently-known drinks as seen so we never re-notify on reload
  data.drinks.forEach((d) => markDrinkSeen(d.id));
}

function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  Notification.requestPermission().then(() => renderDrinks());
}

/* ---------- Games ---------- */

function renderGames() {
  const grid = $('games-list');
  grid.innerHTML = '';

  if (data.games.length === 0) {
    grid.innerHTML = '<div class="empty">Ingen spilforslag endnu.</div>';
    return;
  }

  data.games.forEach((g) => {
    const card = document.createElement('div');
    card.className = 'game-card';

    const remove = document.createElement('button');
    remove.className = 'game-remove';
    remove.textContent = '✕';
    remove.onclick = () => removeGame(g.id);
    card.appendChild(remove);

    if (g.iconUrl) {
      const img = document.createElement('img');
      img.className = 'game-icon';
      img.src = g.iconUrl;
      img.alt = g.name;
      img.onerror = () => { img.replaceWith(fallbackIcon()); };
      card.appendChild(img);
    } else {
      card.appendChild(fallbackIcon());
    }

    const name = document.createElement('div');
    name.className = 'game-name';
    name.textContent = g.name;
    card.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'game-meta';
    meta.textContent = `tilføjet af ${g.addedBy}`;
    card.appendChild(meta);

    grid.appendChild(card);
  });
}

function fallbackIcon() {
  const div = document.createElement('div');
  div.className = 'game-icon-fallback';
  div.textContent = '🎮';
  return div;
}

async function addGame() {
  const nameInput = $('game-name-input');
  const iconInput = $('game-icon-input');
  const name = nameInput.value.trim();
  if (!name || !myName) return;
  const entry = { id: uid(), name, iconUrl: iconInput.value.trim(), addedBy: myName };
  await saveData({ ...data, games: [...data.games, entry] });
  nameInput.value = '';
  iconInput.value = '';
}

async function removeGame(id) {
  await saveData({ ...data, games: data.games.filter((g) => g.id !== id) });
}

/* ---------- Meals ---------- */

function renderMeals() {
  ['snacks', 'lunch', 'dinner'].forEach((meal) => {
    const container = $(`meal-list-${meal}`);
    container.innerHTML = '';
    const items = data.meals[meal] || [];
    if (items.length === 0) {
      container.innerHTML = '<div class="empty" style="padding:14px 0;">Intet tilføjet endnu.</div>';
      return;
    }
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'meal-item';
      row.innerHTML = `<span class="meal-item-name">${escapeHtml(item.name)}</span><span class="meal-item-by">${escapeHtml(item.addedBy)}</span>`;
      const removeBtn = document.createElement('button');
      removeBtn.className = 'meal-remove';
      removeBtn.textContent = '✕';
      removeBtn.onclick = () => removeMealItem(meal, item.id);
      row.appendChild(removeBtn);
      container.appendChild(row);
    });
  });
}

async function addMealItem(meal) {
  try {
    const input = document.querySelector(`.meal-input[data-meal="${meal}"]`);
    if (!input) {
      showError(`Kunne ikke finde inputfeltet for ${meal}. Prøv at genindlæse siden.`);
      return;
    }
    const name = input.value.trim();
    if (!name || !myName) return;
    const entry = { id: uid(), name, addedBy: myName };
    const nextMeals = { ...data.meals, [meal]: [...(data.meals[meal] || []), entry] };
    await saveData({ ...data, meals: nextMeals });
    input.value = '';
  } catch (err) {
    console.error('addMealItem failed', err);
    showError('Der gik noget galt da du tilføjede punktet. Prøv igen.');
  }
}

async function removeMealItem(meal, id) {
  const nextMeals = { ...data.meals, [meal]: (data.meals[meal] || []).filter((i) => i.id !== id) };
  await saveData({ ...data, meals: nextMeals });
}

/* ---------- Points ---------- */

function renderPoints() {
  const winnerSelect = $('point-winner-select');
  const currentVal = winnerSelect.value;
  winnerSelect.innerHTML = data.people.map((p) => `<option value="${p}">${p}</option>`).join('');
  if (data.people.includes(currentVal)) winnerSelect.value = currentVal;

  const totals = {};
  data.people.forEach((p) => (totals[p] = 0));
  data.points.forEach((entry) => {
    totals[entry.winner] = (totals[entry.winner] || 0) + entry.points;
  });
  const maxScore = Math.max(1, ...Object.values(totals));

  const board = $('leaderboard');
  board.innerHTML = '';
  const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  ranked.forEach(([name, score], i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `
      <span class="leaderboard-rank">#${i + 1}</span>
      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between;">
          <span class="leaderboard-name">${escapeHtml(name)}</span>
          <span class="leaderboard-score">${score}</span>
        </div>
        <div class="leaderboard-bar-track"><div class="leaderboard-bar-fill" style="width:${(score / maxScore) * 100}%"></div></div>
      </div>`;
    board.appendChild(row);
  });

  const log = $('points-log');
  log.innerHTML = '';
  const sortedLog = [...data.points].sort((a, b) => b.timestamp - a.timestamp).slice(0, 25);
  sortedLog.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'point-log-row';
    const info = document.createElement('span');
    info.innerHTML = `${escapeHtml(entry.winner)} vandt <strong style="color:var(--text)">${escapeHtml(entry.game)}</strong> (+${entry.points})`;
    row.appendChild(info);

    const right = document.createElement('span');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '8px';
    const time = document.createElement('span');
    time.textContent = formatTime(entry.timestamp);
    right.appendChild(time);
    const removeBtn = document.createElement('button');
    removeBtn.className = 'point-remove';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Fjern denne registrering';
    removeBtn.onclick = () => removePointEntry(entry.id);
    right.appendChild(removeBtn);
    row.appendChild(right);

    log.appendChild(row);
  });
}

async function removePointEntry(id) {
  await saveData({ ...data, points: data.points.filter((p) => p.id !== id) });
}

async function addPointEntry() {
  const gameInput = $('point-game-input');
  const winnerSelect = $('point-winner-select');
  const amountInput = $('point-amount-input');
  const game = gameInput.value.trim();
  const winner = winnerSelect.value;
  const points = parseInt(amountInput.value, 10) || 1;
  if (!game || !winner) return;
  const entry = { id: uid(), game, winner, points, timestamp: Date.now() };
  await saveData({ ...data, points: [...data.points, entry] });
  gameInput.value = '';
  amountInput.value = '1';
}

/* ---------- Checklist ---------- */

function renderChecklist() {
  const box = $('checklist-items');
  box.innerHTML = '';
  const myChecked = data.checklistChecked[myName] || {};

  data.checklistItems.forEach((item) => {
    const isChecked = Boolean(myChecked[item.id]);
    const row = document.createElement('div');
    row.className = 'checklist-row' + (isChecked ? ' checked' : '');
    row.onclick = (e) => {
      if (e.target.closest('.checklist-remove')) return;
      toggleChecklistItem(item.id);
    };

    const box2 = document.createElement('div');
    box2.className = 'checklist-checkbox';
    box2.textContent = isChecked ? '✓' : '';
    row.appendChild(box2);

    const label = document.createElement('span');
    label.className = 'checklist-label' + (isChecked ? ' checked-text' : '');
    label.textContent = item.label;
    row.appendChild(label);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'checklist-remove';
    removeBtn.textContent = '✕';
    removeBtn.onclick = () => removeChecklistItem(item.id);
    row.appendChild(removeBtn);

    box.appendChild(row);
  });
}

async function toggleChecklistItem(itemId) {
  const myChecked = { ...(data.checklistChecked[myName] || {}) };
  myChecked[itemId] = !myChecked[itemId];
  const next = { ...data, checklistChecked: { ...data.checklistChecked, [myName]: myChecked } };
  await saveData(next);
}

async function addChecklistItem() {
  const input = $('checklist-new-input');
  const label = input.value.trim();
  if (!label) return;
  const entry = { id: uid(), label };
  await saveData({ ...data, checklistItems: [...data.checklistItems, entry] });
  input.value = '';
}

async function removeChecklistItem(itemId) {
  const nextChecked = {};
  Object.entries(data.checklistChecked).forEach(([person, items]) => {
    const copy = { ...items };
    delete copy[itemId];
    nextChecked[person] = copy;
  });
  await saveData({
    ...data,
    checklistItems: data.checklistItems.filter((i) => i.id !== itemId),
    checklistChecked: nextChecked,
  });
}

/* ---------- Utils ---------- */

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- Init ---------- */

async function init() {
  initTabs();

  const savedCode = localStorage.getItem(CODE_KEY);
  showGate(!savedCode);

  $('gate-submit').onclick = async () => {
    const code = $('gate-input').value;
    localStorage.setItem(CODE_KEY, code);
    try {
      await loadData();
      showGate(false);
      render();
      startPolling();
    } catch (e) {
      $('gate-error').classList.remove('hidden');
    }
  };
  $('gate-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('gate-submit').click();
  });

  $('name-submit').onclick = () => chooseName($('name-input').value);
  $('name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') chooseName($('name-input').value);
  });
  $('switch-name-btn').onclick = switchName;
  $('add-person-btn').onclick = addPerson;
  $('new-person-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addPerson();
  });
  $('add-date-btn').onclick = addDate;
  $('refresh-btn').onclick = async () => {
    try {
      await loadData();
      render();
    } catch (e) {}
  };

  $('drink-order-btn').onclick = orderDrink;
  $('drink-item-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') orderDrink();
  });
  $('enable-notif-btn').onclick = requestNotificationPermission;

  $('game-add-btn').onclick = addGame;
  $('game-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addGame();
  });

  const foodTab = $('tab-food');
  foodTab.addEventListener('click', (e) => {
    const btn = e.target.closest('.meal-add-btn');
    if (btn) addMealItem(btn.dataset.meal);
  });
  foodTab.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('meal-input')) {
      addMealItem(e.target.dataset.meal);
    }
  });

  $('point-add-btn').onclick = addPointEntry;

  $('checklist-add-btn').onclick = addChecklistItem;
  $('checklist-new-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addChecklistItem();
  });

  if (savedCode) {
    try {
      await loadData();
      render();
      startPolling();
    } catch (e) {
      showGate(true);
    }
  }
}

function startPolling() {
  setInterval(async () => {
    try {
      await loadData();
      render();
    } catch (e) {}
  }, 15000);
}

init();
