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
    drinkMenu: [],
    games: [],
    meals: { snacks: [], lunch: [], dinner: [] },
    points: [],
    checklistItems: DEFAULT_CHECKLIST.slice(),
    checklistChecked: {},
    sounds: [],
    speedResults: [],
    shoppingExtra: [],
    shoppingChecked: {},
    aimScores: [],
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
  if (!next.drinkMenu) next.drinkMenu = [];
  next.drinkMenu = next.drinkMenu.map((d) => ({ ...d, ingredients: d.ingredients || [] }));
  if (!next.games) next.games = [];
  next.games = next.games.map((g) => ({ ...g, votes: g.votes || {}, category: g.category || 'unsorted' }));
  if (!next.points) next.points = [];
  if (!next.sounds) next.sounds = [];
  if (!next.speedResults) next.speedResults = [];
  if (!next.shoppingExtra) next.shoppingExtra = [];
  if (!next.shoppingChecked) next.shoppingChecked = {};
  if (!next.aimScores) next.aimScores = [];
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
  const groupBtns = document.querySelectorAll('.group-btn');
  const tabBtns = document.querySelectorAll('.tab-btn');

  function activateTab(btn) {
    activeTab = btn.dataset.tab;
    tabBtns.forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-panel').forEach((p) => {
      p.classList.toggle('hidden', p.id !== `tab-${activeTab}`);
    });
  }

  function showGroup(group) {
    groupBtns.forEach((b) => b.classList.toggle('active', b.dataset.group === group));
    tabBtns.forEach((b) => {
      b.classList.toggle('group-hidden', b.dataset.group !== group);
    });
    const firstBtn = Array.from(tabBtns).find((b) => b.dataset.group === group);
    if (firstBtn) activateTab(firstBtn);
  }

  groupBtns.forEach((btn) => {
    btn.addEventListener('click', () => showGroup(btn.dataset.group));
  });
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn));
  });

  showGroup('planning');
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
  renderDrinkMenu();
  renderGames();
  renderMeals();
  renderShoppingList();
  renderPoints();
  renderChecklist();
  renderSounds();
  renderSpeedResults();
  if (typeof renderAimLeaderboard === 'function') renderAimLeaderboard();
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
  const clearBtn = $('drinks-clear-done-btn');
  const hasDone = data.drinks.some((d) => d.done);
  if (clearBtn) clearBtn.classList.toggle('hidden', !hasDone);

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

    const actions = document.createElement('div');
    actions.className = 'drink-actions';

    const btn = document.createElement('button');
    btn.className = 'done-btn' + (d.done ? ' is-done' : '');
    btn.textContent = d.done ? '✓ Lavet' : 'Marker lavet';
    btn.onclick = () => toggleDrinkDone(d.id);
    actions.appendChild(btn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'drink-remove';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Fjern bestilling';
    removeBtn.onclick = () => removeDrink(d.id);
    actions.appendChild(removeBtn);

    card.appendChild(actions);

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

async function removeDrink(id) {
  await saveData({ ...data, drinks: data.drinks.filter((d) => d.id !== id) });
}

async function clearDoneDrinks() {
  await saveData({ ...data, drinks: data.drinks.filter((d) => !d.done) });
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

/* ---------- Drink menu + wheel ---------- */

function renderDrinkMenu() {
  const grid = $('drink-menu-list');
  if (!grid) return;
  grid.innerHTML = '';

  if (data.drinkMenu.length === 0) {
    grid.innerHTML = '<div class="empty">Ingen drinks på menuen endnu. Tilføj den første ovenfor.</div>';
    return;
  }

  data.drinkMenu.forEach((d) => {
    const card = document.createElement('div');
    card.className = 'game-card drink-menu-card';
    card.dataset.drinkId = d.id;

    const remove = document.createElement('button');
    remove.className = 'game-remove';
    remove.textContent = '✕';
    remove.onclick = () => removeDrinkMenuItem(d.id);
    card.appendChild(remove);

    if (d.imageUrl) {
      const img = document.createElement('img');
      img.className = 'game-icon';
      img.src = d.imageUrl;
      img.alt = d.name;
      img.onerror = () => { img.replaceWith(fallbackDrinkIcon()); };
      card.appendChild(img);
    } else {
      card.appendChild(fallbackDrinkIcon());
    }

    const name = document.createElement('div');
    name.className = 'game-name';
    name.textContent = d.name;
    card.appendChild(name);

    if (d.description) {
      const desc = document.createElement('div');
      desc.className = 'game-meta';
      desc.textContent = d.description;
      card.appendChild(desc);
    }

    const ingRow = document.createElement('div');
    ingRow.className = 'drink-ingredients-row';
    if (d.ingredients && d.ingredients.length) {
      const ingText = document.createElement('div');
      ingText.className = 'drink-ingredients-text';
      ingText.textContent = d.ingredients.join(', ');
      ingRow.appendChild(ingText);
    } else {
      const ingText = document.createElement('div');
      ingText.className = 'drink-ingredients-text muted';
      ingText.textContent = 'Ingen ingredienser registreret';
      ingRow.appendChild(ingText);
    }
    const editBtn = document.createElement('button');
    editBtn.className = 'link-btn';
    editBtn.textContent = '✎ Rediger';
    editBtn.onclick = () => editDrinkIngredients(d.id);
    ingRow.appendChild(editBtn);
    card.appendChild(ingRow);

    const orderBtn = document.createElement('button');
    orderBtn.className = 'done-btn';
    orderBtn.style.marginTop = '8px';
    orderBtn.style.width = '100%';
    orderBtn.textContent = 'Bestil';
    orderBtn.onclick = () => orderDrinkFromMenu(d);
    card.appendChild(orderBtn);

    grid.appendChild(card);
  });
}

function fallbackDrinkIcon() {
  const div = document.createElement('div');
  div.className = 'game-icon-fallback';
  div.textContent = '🍹';
  return div;
}

async function addDrinkMenuItem() {
  const nameInput = $('menu-drink-name');
  const descInput = $('menu-drink-desc');
  const imageInput = $('menu-drink-image');
  const name = nameInput.value.trim();
  if (!name || !myName) return;
  const recipe = (typeof lookupDrinkRecipe === 'function') ? lookupDrinkRecipe(name) : null;
  const entry = {
    id: uid(),
    name,
    description: descInput.value.trim(),
    imageUrl: imageInput.value.trim(),
    addedBy: myName,
    ingredients: recipe || [],
  };
  await saveData({ ...data, drinkMenu: [...data.drinkMenu, entry] });
  nameInput.value = '';
  descInput.value = '';
  imageInput.value = '';
  if (recipe) {
    showError(null);
  }
}

async function editDrinkIngredients(id) {
  const drink = data.drinkMenu.find((d) => d.id === id);
  if (!drink) return;
  const current = (drink.ingredients || []).join(', ');
  const input = window.prompt('Ingredienser til ' + drink.name + ' (kommasepareret):', current);
  if (input === null) return;
  const ingredients = input.split(',').map((s) => s.trim()).filter(Boolean);
  await saveData({
    ...data,
    drinkMenu: data.drinkMenu.map((d) => (d.id === id ? { ...d, ingredients } : d)),
  });
}

async function removeDrinkMenuItem(id) {
  await saveData({ ...data, drinkMenu: data.drinkMenu.filter((d) => d.id !== id) });
}

async function orderDrinkFromMenu(menuItem) {
  if (!myName) return;
  const entry = { id: uid(), item: menuItem.name, person: myName, timestamp: Date.now(), done: false };
  markDrinkSeen(entry.id);
  await saveData({ ...data, drinks: [...data.drinks, entry] });
}

let wheelSpinning = false;

function spinWheel() {
  if (wheelSpinning) return;
  const cards = Array.from(document.querySelectorAll('#drink-menu-list .drink-menu-card'));
  if (cards.length === 0) {
    showError('Tilføj mindst én drink til menuen før I snurrer hjulet.');
    return;
  }
  wheelSpinning = true;
  const winnerIndex = Math.floor(Math.random() * cards.length);
  const resultBox = $('wheel-result');
  resultBox.classList.add('hidden');

  let step = 0;
  const totalSteps = 18 + winnerIndex; // ensures it lands on winnerIndex after full loops
  let delay = 80;

  function tick() {
    cards.forEach((c) => c.classList.remove('wheel-highlight'));
    const idx = step % cards.length;
    cards[idx].classList.add('wheel-highlight');
    step++;
    delay += 12; // decelerate

    if (step < totalSteps) {
      setTimeout(tick, delay);
    } else {
      const winner = data.drinkMenu[winnerIndex];
      wheelSpinning = false;
      resultBox.textContent = `🎉 Hjulet valgte: ${winner.name}!`;
      resultBox.classList.remove('hidden');
      orderDrinkFromMenu(winner);
      setTimeout(() => cards.forEach((c) => c.classList.remove('wheel-highlight')), 1500);
    }
  }
  tick();
}

/* ---------- Games ---------- */

const GAME_CATEGORIES = ['unsorted', 'free', 'paid'];

function renderGames() {
  const containers = {
    unsorted: $('games-list-unsorted'),
    free: $('games-list-free'),
    paid: $('games-list-paid'),
  };

  Object.values(containers).forEach((el) => { if (el) el.innerHTML = ''; });

  if (data.games.length === 0) {
    if (containers.unsorted) containers.unsorted.innerHTML = '<div class="empty">Ingen spilforslag endnu.</div>';
    return;
  }

  const withCounts = data.games.map((g) => ({ g, count: Object.keys(g.votes || {}).length }));
  const maxCount = Math.max(0, ...withCounts.map((x) => x.count));

  GAME_CATEGORIES.forEach((cat) => {
    const container = containers[cat];
    if (!container) return;
    const items = withCounts
      .filter((x) => (x.g.category || 'unsorted') === cat)
      .sort((a, b) => b.count - a.count);

    if (cat === 'unsorted') {
      const columnEl = container.closest('.game-column');
      if (columnEl) columnEl.classList.toggle('hidden', items.length === 0);
    }

    if (items.length === 0) {
      container.innerHTML = '<div class="empty game-column-empty">Træk spil herhen</div>';
      return;
    }
    items.forEach(({ g, count }) => {
      const isTop = count > 0 && count === maxCount;
      container.appendChild(buildGameCard(g, count, isTop));
    });
  });
}

function buildGameCard(g, count, isTop) {
  const card = document.createElement('div');
  card.className = 'game-card' + (isTop ? ' game-card-top' : '');
  card.dataset.gameId = g.id;

  const handle = document.createElement('div');
  handle.className = 'game-drag-handle';
  handle.textContent = '⠿';
  handle.title = 'Træk for at flytte';
  handle.addEventListener('pointerdown', (e) => startGameDrag(e, g.id));
  card.appendChild(handle);

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

  if (isTop) {
    const tag = document.createElement('div');
    tag.className = 'date-tag best';
    tag.textContent = 'Mest stemt';
    card.appendChild(tag);
  }

  const meta = document.createElement('div');
  meta.className = 'game-meta';
  meta.textContent = `tilføjet af ${g.addedBy}`;
  card.appendChild(meta);

  const myVoted = Boolean((g.votes || {})[myName]);
  const voteBtn = document.createElement('button');
  voteBtn.className = 'game-vote-btn' + (myVoted ? ' voted' : '');
  voteBtn.textContent = `${myVoted ? '★' : '☆'} ${count}`;
  voteBtn.onclick = () => toggleGameVote(g.id);
  card.appendChild(voteBtn);

  const ledPanel = document.createElement('div');
  ledPanel.className = 'led-panel game-led-panel';
  data.people.forEach((p) => {
    const voted = Boolean((g.votes || {})[p]);
    const item = document.createElement('div');
    item.className = 'led-item';
    item.title = `${p}: ${voted ? 'Stemt' : 'Ikke stemt'}`;
    item.innerHTML = `<span class="led" style="background:${voted ? 'var(--green)' : 'var(--border)'}"></span><span class="led-label">${p}</span>`;
    ledPanel.appendChild(item);
  });
  card.appendChild(ledPanel);

  return card;
}

/* ---------- Games drag-and-drop (pointer events: works with mouse + touch) ---------- */

let gameDragState = null;

function startGameDrag(e, gameId) {
  e.preventDefault();
  const card = e.currentTarget.closest('.game-card');
  if (!card) return;
  const rect = card.getBoundingClientRect();

  const ghost = card.cloneNode(true);
  ghost.classList.add('game-drag-ghost');
  ghost.style.width = `${rect.width}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  document.body.appendChild(ghost);
  card.classList.add('dragging-source');

  gameDragState = {
    gameId,
    ghost,
    sourceCard: card,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
  };

  window.addEventListener('pointermove', onGameDragMove);
  window.addEventListener('pointerup', onGameDragEnd);
}

function onGameDragMove(e) {
  if (!gameDragState) return;
  gameDragState.ghost.style.left = `${e.clientX - gameDragState.offsetX}px`;
  gameDragState.ghost.style.top = `${e.clientY - gameDragState.offsetY}px`;

  document.querySelectorAll('.game-column').forEach((col) => col.classList.remove('drag-over'));
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const col = under ? under.closest('.game-column') : null;
  if (col) col.classList.add('drag-over');
}

async function onGameDragEnd(e) {
  if (!gameDragState) return;
  const { gameId, ghost, sourceCard } = gameDragState;

  window.removeEventListener('pointermove', onGameDragMove);
  window.removeEventListener('pointerup', onGameDragEnd);

  const under = document.elementFromPoint(e.clientX, e.clientY);
  const col = under ? under.closest('.game-column') : null;

  ghost.remove();
  if (sourceCard) sourceCard.classList.remove('dragging-source');
  document.querySelectorAll('.game-column').forEach((c) => c.classList.remove('drag-over'));
  gameDragState = null;

  if (col) {
    await setGameCategory(gameId, col.dataset.category);
  }
}

async function setGameCategory(gameId, category) {
  const next = {
    ...data,
    games: data.games.map((g) => (g.id === gameId ? { ...g, category } : g)),
  };
  await saveData(next);
}

async function toggleGameVote(gameId) {
  if (!myName) return;
  const next = {
    ...data,
    games: data.games.map((g) => {
      if (g.id !== gameId) return g;
      const votes = { ...(g.votes || {}) };
      if (votes[myName]) {
        delete votes[myName];
      } else {
        votes[myName] = true;
      }
      return { ...g, votes };
    }),
  };
  await saveData(next);
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
  const entry = { id: uid(), name, iconUrl: iconInput.value.trim(), addedBy: myName, votes: {}, category: 'unsorted' };
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
      const card = document.createElement('div');
      card.className = 'meal-card';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'game-remove';
      removeBtn.textContent = '✕';
      removeBtn.onclick = () => removeMealItem(meal, item.id);
      card.appendChild(removeBtn);

      if (item.imageUrl) {
        const img = document.createElement('img');
        img.className = 'meal-card-image';
        img.src = item.imageUrl;
        img.alt = item.name;
        img.onerror = () => { img.replaceWith(mealFallbackThumb()); };
        card.appendChild(img);
      } else {
        card.appendChild(mealFallbackThumb());
      }

      const body = document.createElement('div');
      body.className = 'meal-card-body';
      const name = document.createElement('div');
      name.className = 'meal-card-name';
      name.textContent = item.name;
      body.appendChild(name);
      const by = document.createElement('div');
      by.className = 'meal-card-by';
      by.textContent = `tilføjet af ${item.addedBy}`;
      body.appendChild(by);
      card.appendChild(body);

      container.appendChild(card);
    });
  });
}

function mealFallbackThumb() {
  const div = document.createElement('div');
  div.className = 'meal-card-image meal-card-image-fallback';
  div.textContent = '🍽️';
  return div;
}

async function addMealItem(meal) {
  try {
    const input = document.querySelector(`.meal-input[data-meal="${meal}"]`);
    const imageInput = document.querySelector(`.meal-image-input[data-meal="${meal}"]`);
    if (!input) {
      showError(`Kunne ikke finde inputfeltet for ${meal}. Prøv at genindlæse siden.`);
      return;
    }
    const name = input.value.trim();
    if (!name || !myName) return;
    const entry = { id: uid(), name, addedBy: myName, imageUrl: imageInput ? imageInput.value.trim() : '' };
    const nextMeals = { ...data.meals, [meal]: [...(data.meals[meal] || []), entry] };
    await saveData({ ...data, meals: nextMeals });
    input.value = '';
    if (imageInput) imageInput.value = '';
  } catch (err) {
    console.error('addMealItem failed', err);
    showError('Der gik noget galt da du tilføjede punktet. Prøv igen.');
  }
}

async function removeMealItem(meal, id) {
  const nextMeals = { ...data.meals, [meal]: (data.meals[meal] || []).filter((i) => i.id !== id) };
  await saveData({ ...data, meals: nextMeals });
}

/* ---------- Shopping list (derived from Mad + Drinks) ---------- */

const MEAL_LABELS = { snacks: 'Snacks', lunch: 'Frokost', dinner: 'Aftensmad' };

function buildShoppingSections() {
  const sections = [];
  ['snacks', 'lunch', 'dinner'].forEach((meal) => {
    const items = (data.meals[meal] || []).map((i) => ({ key: `meal:${meal}:${i.id}`, name: i.name, imageUrl: i.imageUrl }));
    if (items.length) sections.push({ title: MEAL_LABELS[meal], items });
  });
  const drinkItems = [];
  data.drinkMenu.forEach((d) => {
    if (d.ingredients && d.ingredients.length) {
      d.ingredients.forEach((ing, idx) => {
        drinkItems.push({ key: `drinkmenu:${d.id}:ing:${idx}`, name: `${ing} (til ${d.name})`, imageUrl: '' });
      });
    } else {
      drinkItems.push({ key: `drinkmenu:${d.id}`, name: d.name, imageUrl: d.imageUrl });
    }
  });
  if (drinkItems.length) sections.push({ title: 'Drinks', items: drinkItems });
  const extraItems = data.shoppingExtra.map((e) => ({ key: `extra:${e.id}`, name: e.name, imageUrl: '' }));
  if (extraItems.length) sections.push({ title: 'Andre indkøb', items: extraItems, removable: true });
  return sections;
}

function renderShoppingList() {
  const box = $('shopping-list-sections');
  if (!box) return;
  box.innerHTML = '';

  const sections = buildShoppingSections();
  if (sections.length === 0) {
    box.innerHTML = '<div class="empty">Tilføj noget under Mad eller Drinks, så dukker det op her.</div>';
    return;
  }

  sections.forEach((section) => {
    const card = document.createElement('section');
    card.className = 'card';

    const h = document.createElement('h3');
    h.className = 'h3';
    h.textContent = section.title;
    card.appendChild(h);

    const list = document.createElement('div');
    list.className = 'checklist';

    section.items.forEach((item) => {
      const isChecked = Boolean(data.shoppingChecked[item.key]);
      const row = document.createElement('div');
      row.className = 'checklist-row' + (isChecked ? ' checked' : '');
      row.onclick = (e) => {
        if (e.target.closest('.checklist-remove')) return;
        toggleShoppingItem(item.key);
      };

      const box2 = document.createElement('div');
      box2.className = 'checklist-checkbox';
      box2.textContent = isChecked ? '✓' : '';
      row.appendChild(box2);

      if (item.imageUrl) {
        const img = document.createElement('img');
        img.className = 'shopping-item-thumb';
        img.src = item.imageUrl;
        img.alt = item.name;
        img.onerror = () => img.remove();
        row.appendChild(img);
      }

      const label = document.createElement('span');
      label.className = 'checklist-label' + (isChecked ? ' checked-text' : '');
      label.textContent = item.name;
      row.appendChild(label);

      if (section.removable) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'checklist-remove';
        removeBtn.textContent = '✕';
        removeBtn.onclick = () => removeShoppingExtra(item.key.replace('extra:', ''));
        row.appendChild(removeBtn);
      }

      list.appendChild(row);
    });

    card.appendChild(list);
    box.appendChild(card);
  });
}

async function toggleShoppingItem(key) {
  const next = { ...data.shoppingChecked, [key]: !data.shoppingChecked[key] };
  await saveData({ ...data, shoppingChecked: next });
}

async function uncheckAllShopping() {
  await saveData({ ...data, shoppingChecked: {} });
}

async function addShoppingExtra() {
  const input = $('shopping-extra-input');
  const name = input.value.trim();
  if (!name || !myName) return;
  const entry = { id: uid(), name, addedBy: myName };
  await saveData({ ...data, shoppingExtra: [...data.shoppingExtra, entry] });
  input.value = '';
}

async function removeShoppingExtra(id) {
  const nextChecked = { ...data.shoppingChecked };
  delete nextChecked[`extra:${id}`];
  await saveData({
    ...data,
    shoppingExtra: data.shoppingExtra.filter((e) => e.id !== id),
    shoppingChecked: nextChecked,
  });
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

/* ---------- Soundboard ---------- */

const MAX_SOUND_BYTES = 350 * 1024; // ~350KB, keeps the shared blob manageable

function renderSounds() {
  const grid = $('sound-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (data.sounds.length === 0) {
    grid.innerHTML = '<div class="empty">Ingen lyde endnu. Tilføj jeres egne ovenfor (link eller kort upload).</div>';
    return;
  }

  data.sounds.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'sound-card';

    const remove = document.createElement('button');
    remove.className = 'game-remove';
    remove.textContent = '✕';
    remove.onclick = (e) => {
      e.stopPropagation();
      removeSound(s.id);
    };
    card.appendChild(remove);

    const playBtn = document.createElement('button');
    playBtn.className = 'sound-play-btn';
    playBtn.innerHTML = `<span class="sound-icon">🔊</span><span class="sound-label">${escapeHtml(s.label)}</span>`;
    playBtn.onclick = () => playSound(s.url);
    card.appendChild(playBtn);

    grid.appendChild(card);
  });
}

function playSound(url) {
  try {
    const audio = new Audio(url);
    audio.play().catch((e) => showError('Kunne ikke afspille lyden: ' + e.message));
  } catch (e) {
    showError('Kunne ikke afspille lyden.');
  }
}

async function addSound() {
  const labelInput = $('sound-label-input');
  const urlInput = $('sound-url-input');
  const fileInput = $('sound-file-input');
  const label = labelInput.value.trim();
  if (!label || !myName) return;

  const file = fileInput.files && fileInput.files[0];
  let url = urlInput.value.trim();

  if (file) {
    if (file.size > MAX_SOUND_BYTES) {
      showError(`Filen er for stor (${Math.round(file.size / 1024)} KB). Hold jer under ${Math.round(MAX_SOUND_BYTES / 1024)} KB.`);
      return;
    }
    try {
      url = await fileToDataUrl(file);
    } catch (e) {
      showError('Kunne ikke læse filen.');
      return;
    }
  }

  if (!url) {
    showError('Indsæt enten et link eller upload en fil.');
    return;
  }

  const entry = { id: uid(), label, url, addedBy: myName };
  await saveData({ ...data, sounds: [...data.sounds, entry] });
  labelInput.value = '';
  urlInput.value = '';
  fileInput.value = '';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function removeSound(id) {
  await saveData({ ...data, sounds: data.sounds.filter((s) => s.id !== id) });
}

/* ---------- Speed test ---------- */

async function pingOnce() {
  const start = performance.now();
  const res = await fetch('/api/ping', { headers: { 'X-Access-Code': accessCode() }, cache: 'no-store' });
  if (!res.ok) throw new Error('ping failed');
  await res.text();
  return performance.now() - start;
}

async function downloadTestOnce(sizeBytes) {
  const start = performance.now();
  const res = await fetch(`/api/speedtest?size=${sizeBytes}`, {
    headers: { 'X-Access-Code': accessCode() },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('speedtest failed');
  const buf = await res.arrayBuffer();
  const seconds = (performance.now() - start) / 1000;
  const mbps = (buf.byteLength * 8) / seconds / 1e6;
  return mbps;
}

async function runSpeedTest() {
  const statusEl = $('speedtest-status');
  const btn = $('speedtest-run-btn');
  if (!myName) return;
  btn.disabled = true;

  try {
    statusEl.textContent = 'Måler ping…';
    const pings = [];
    for (let i = 0; i < 4; i++) {
      pings.push(await pingOnce());
    }
    const pingMs = Math.min(...pings);

    statusEl.textContent = 'Måler downloadhastighed…';
    const mbps1 = await downloadTestOnce(4000000);
    const mbps2 = await downloadTestOnce(8000000);
    const downloadMbps = Math.max(mbps1, mbps2);

    const entry = {
      id: uid(),
      person: myName,
      downloadMbps: Math.round(downloadMbps * 10) / 10,
      pingMs: Math.round(pingMs),
      timestamp: Date.now(),
    };
    await saveData({ ...data, speedResults: [...data.speedResults, entry] });
    statusEl.textContent = `Færdig: ${entry.downloadMbps} Mbps, ${entry.pingMs} ms ping.`;
  } catch (e) {
    statusEl.textContent = 'Testen fejlede: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

function renderSpeedResults() {
  const box = $('speedtest-leaderboard');
  if (!box) return;
  box.innerHTML = '';

  const bestByPerson = {};
  data.speedResults.forEach((r) => {
    if (!bestByPerson[r.person] || r.downloadMbps > bestByPerson[r.person].downloadMbps) {
      bestByPerson[r.person] = r;
    }
  });

  const ranked = Object.values(bestByPerson).sort((a, b) => b.downloadMbps - a.downloadMbps);
  if (ranked.length === 0) {
    box.innerHTML = '<div class="empty">Ingen tests kørt endnu.</div>';
    return;
  }
  const maxMbps = Math.max(1, ...ranked.map((r) => r.downloadMbps));

  ranked.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `
      <span class="leaderboard-rank">#${i + 1}</span>
      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between;">
          <span class="leaderboard-name">${escapeHtml(r.person)}</span>
          <span class="leaderboard-score">${r.downloadMbps} Mbps · ${r.pingMs} ms</span>
        </div>
        <div class="leaderboard-bar-track"><div class="leaderboard-bar-fill" style="width:${(r.downloadMbps / maxMbps) * 100}%"></div></div>
      </div>`;
    box.appendChild(row);
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
  $('drinks-clear-done-btn').onclick = clearDoneDrinks;

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

  $('menu-drink-add-btn').onclick = addDrinkMenuItem;
  $('spin-wheel-btn').onclick = spinWheel;

  $('sound-add-btn').onclick = addSound;

  $('speedtest-run-btn').onclick = runSpeedTest;

  $('shopping-uncheck-all-btn').onclick = uncheckAllShopping;
  $('shopping-extra-add-btn').onclick = addShoppingExtra;
  $('shopping-extra-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addShoppingExtra();
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
