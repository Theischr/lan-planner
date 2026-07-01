const API_URL = '/api/data';
const NAME_KEY = 'lan-planner-my-name';
const CODE_KEY = 'lan-planner-access-code';

const VOTE_TYPES = {
  ja: { label: 'Ja', color: 'var(--green)', activeClass: 'active-ja' },
  maybe: { label: 'Måske', color: 'var(--amber)', activeClass: 'active-maybe' },
  nej: { label: 'Nej', color: 'var(--red)', activeClass: 'active-nej' },
};

let data = { people: [], dates: [], agreedDateId: null };
let myName = localStorage.getItem(NAME_KEY) || null;
let countdownInterval = null;

const $ = (id) => document.getElementById(id);

function accessCode() {
  return localStorage.getItem(CODE_KEY) || '';
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

async function loadData() {
  try {
    const res = await apiFetch();
    if (!res.ok) throw new Error('load failed');
    data = await res.json();
    if (!data.people) data.people = [];
    if (!data.dates) data.dates = [];
    if (data.agreedDateId === undefined) data.agreedDateId = null;
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
  const entry = { id: `${input.value}-${Date.now()}`, date: input.value, location: '', time: '', votes: {} };
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

function switchName() {
  localStorage.removeItem(NAME_KEY);
  myName = null;
  render();
}

async function init() {
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
  }, 20000);
}

init();
