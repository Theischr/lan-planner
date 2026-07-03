const AIM_GAME_DURATION = 20000; // ms
const AIM_TARGET_SIZE = 44; // px
const AIM_TARGET_LIFETIME = 900; // ms before a missed target disappears

let aimRunning = false;
let aimHits = 0;
let aimMisses = 0;
let aimReactionTimes = [];
let aimSpawnedAt = 0;
let aimDespawnTimeout = null;
let aimCountdownInterval = null;
let aimEndAt = 0;
let aimCurrentTargetEl = null;

function aimEl(id) {
  return document.getElementById(id);
}

function startAimGame() {
  if (aimRunning) return;
  aimRunning = true;
  aimHits = 0;
  aimMisses = 0;
  aimReactionTimes = [];
  aimEndAt = Date.now() + AIM_GAME_DURATION;

  const arena = aimEl('aim-arena');
  const startBtn = aimEl('aim-start-btn');
  const stats = aimEl('aim-stats');
  if (!arena || !startBtn) return;

  arena.classList.remove('hidden');
  arena.innerHTML = '';
  startBtn.disabled = true;
  startBtn.textContent = 'Kører…';
  stats.textContent = '';

  spawnAimTarget();
  aimCountdownInterval = setInterval(aimCountdownTick, 200);
}

function aimCountdownTick() {
  const stats = aimEl('aim-stats');
  const secondsLeft = Math.max(0, Math.ceil((aimEndAt - Date.now()) / 1000));
  stats.textContent = `${secondsLeft}s tilbage · ${aimHits} ramt`;
  if (Date.now() >= aimEndAt) {
    endAimGame();
  }
}

function spawnAimTarget() {
  if (!aimRunning) return;
  const arena = aimEl('aim-arena');
  if (!arena) return;

  const rect = arena.getBoundingClientRect();
  const maxX = Math.max(0, rect.width - AIM_TARGET_SIZE);
  const maxY = Math.max(0, rect.height - AIM_TARGET_SIZE);
  const x = Math.random() * maxX;
  const y = Math.random() * maxY;

  const target = document.createElement('button');
  target.className = 'aim-target';
  target.style.left = `${x}px`;
  target.style.top = `${y}px`;
  target.style.width = `${AIM_TARGET_SIZE}px`;
  target.style.height = `${AIM_TARGET_SIZE}px`;

  aimSpawnedAt = performance.now();
  aimCurrentTargetEl = target;

  target.onclick = () => hitAimTarget(target);
  arena.appendChild(target);

  aimDespawnTimeout = setTimeout(() => {
    if (target.isConnected) {
      aimMisses++;
      target.remove();
      if (aimRunning) spawnAimTarget();
    }
  }, AIM_TARGET_LIFETIME);
}

function hitAimTarget(target) {
  if (!aimRunning) return;
  clearTimeout(aimDespawnTimeout);
  const reaction = performance.now() - aimSpawnedAt;
  aimHits++;
  aimReactionTimes.push(reaction);
  target.remove();
  if (aimRunning) spawnAimTarget();
}

async function endAimGame() {
  aimRunning = false;
  clearInterval(aimCountdownInterval);
  clearTimeout(aimDespawnTimeout);

  const arena = aimEl('aim-arena');
  const startBtn = aimEl('aim-start-btn');
  const stats = aimEl('aim-stats');
  if (arena) {
    arena.innerHTML = '';
    arena.classList.add('hidden');
  }
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = 'Prøv igen';
  }

  const totalSpawned = aimHits + aimMisses;
  const accuracy = totalSpawned > 0 ? Math.round((aimHits / totalSpawned) * 100) : 0;
  const avgReaction = aimReactionTimes.length
    ? Math.round(aimReactionTimes.reduce((a, b) => a + b, 0) / aimReactionTimes.length)
    : 0;

  if (stats) stats.textContent = `Færdig! ${aimHits} ramt · ${accuracy}% præcision · ${avgReaction} ms gennemsnit`;

  if (typeof myName !== 'undefined' && myName && typeof data !== 'undefined' && typeof saveData === 'function') {
    const entry = {
      id: (typeof uid === 'function') ? uid() : `${Date.now()}`,
      person: myName,
      score: aimHits,
      accuracy,
      avgReaction,
      timestamp: Date.now(),
    };
    const nextScores = [...(data.aimScores || []), entry];
    await saveData({ ...data, aimScores: nextScores });
  }
}

function renderAimLeaderboard() {
  const box = aimEl('aim-leaderboard');
  if (!box || typeof data === 'undefined') return;
  box.innerHTML = '';

  const scores = data.aimScores || [];
  const bestByPerson = {};
  scores.forEach((s) => {
    if (!bestByPerson[s.person] || s.score > bestByPerson[s.person].score) {
      bestByPerson[s.person] = s;
    }
  });

  const ranked = Object.values(bestByPerson).sort((a, b) => b.score - a.score);
  if (ranked.length === 0) {
    box.innerHTML = '<div class="empty">Ingen runder spillet endnu.</div>';
    return;
  }
  const maxScore = Math.max(1, ...ranked.map((r) => r.score));

  ranked.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `
      <span class="leaderboard-rank">#${i + 1}</span>
      <div style="flex:1;">
        <div style="display:flex; justify-content:space-between;">
          <span class="leaderboard-name">${escapeHtml(r.person)}</span>
          <span class="leaderboard-score">${r.score} ramt · ${r.accuracy}% · ${r.avgReaction} ms</span>
        </div>
        <div class="leaderboard-bar-track"><div class="leaderboard-bar-fill" style="width:${(r.score / maxScore) * 100}%"></div></div>
      </div>`;
    box.appendChild(row);
  });
}

function initAimTrainer() {
  const startBtn = document.getElementById('aim-start-btn');
  if (startBtn) startBtn.onclick = startAimGame;
  renderAimLeaderboard();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAimTrainer);
} else {
  initAimTrainer();
}
