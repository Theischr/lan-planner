// ⚠️ Opdatér denne URL efter du har deployet game-server/ som en separat Cloudflare Worker.
// Formatet er typisk: wss://<worker-navn>.<din-subdomæne>.workers.dev/room
const ARENA_SERVER_URL = 'wss://lan-arena-game.YOUR-SUBDOMAIN.workers.dev/room';

let arenaSocket = null;
let arenaState = { players: [], bullets: [], scores: {}, roundActive: false, targetKills: 10, arena: { w: 800, h: 500 } };
let arenaKeys = {};
let arenaAngle = 0;
let arenaInputInterval = null;
let arenaListenersBound = false;

function arenaEl(id) {
  return document.getElementById(id);
}

function arenaJoin() {
  if (typeof myName === 'undefined' || !myName) {
    if (typeof showError === 'function') showError('Vælg dit navn først, øverst på siden.');
    return;
  }
  if (ARENA_SERVER_URL.includes('YOUR-SUBDOMAIN')) {
    if (typeof showError === 'function') {
      showError('Arena-serverens URL er ikke sat endnu — se README for deploy-vejledning.');
    }
    return;
  }

  const code = (typeof accessCode === 'function') ? accessCode() : '';
  const url = `${ARENA_SERVER_URL}?name=${encodeURIComponent(myName)}&code=${encodeURIComponent(code)}`;

  try {
    arenaSocket = new WebSocket(url);
  } catch (e) {
    if (typeof showError === 'function') showError('Kunne ikke oprette forbindelse til Arena-serveren.');
    return;
  }

  arenaSocket.onopen = () => {
    arenaEl('arena-connect').classList.add('hidden');
    arenaEl('arena-controls').classList.remove('hidden');
    arenaEl('arena-wrap').classList.remove('hidden');
    arenaEl('arena-status').textContent = 'Forbundet';
    bindArenaInputListeners();
    startArenaInputLoop();
    requestAnimationFrame(renderArenaFrame);
  };

  arenaSocket.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      return;
    }
    if (msg.type === 'state') {
      arenaState = msg;
      renderArenaScoreboard();
    } else if (msg.type === 'game_over') {
      arenaEl('arena-status').textContent = `${msg.winner} vandt runden! 🏆`;
      recordArenaWin(msg.winner);
    } else if (msg.type === 'round_started') {
      arenaEl('arena-status').textContent = 'Runde startet — kæmp!';
    } else if (msg.type === 'kill') {
      arenaEl('arena-status').textContent = `${msg.killer} nakkede ${msg.victim}`;
    }
  };

  arenaSocket.onclose = () => {
    arenaEl('arena-status').textContent = 'Forbindelse afbrudt';
    arenaEl('arena-connect').classList.remove('hidden');
    arenaEl('arena-controls').classList.add('hidden');
    if (arenaInputInterval) clearInterval(arenaInputInterval);
  };

  arenaSocket.onerror = () => {
    if (typeof showError === 'function') {
      showError('Kunne ikke forbinde til Arena-serveren. Er den deployet, og er URL\'en opdateret i game-arena.js?');
    }
  };
}

function bindArenaInputListeners() {
  if (arenaListenersBound) return;
  arenaListenersBound = true;

  const canvas = arenaEl('arena-canvas');

  window.addEventListener('keydown', (e) => {
    arenaKeys[e.key.toLowerCase()] = true;
    if (e.code === 'Space') {
      arenaShoot();
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    arenaKeys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    const me = arenaState.players.find((p) => p.name === myName);
    if (!me) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    arenaAngle = Math.atan2(my - me.y, mx - me.x);
  });
  canvas.addEventListener('click', arenaShoot);
}

function startArenaInputLoop() {
  if (arenaInputInterval) clearInterval(arenaInputInterval);
  arenaInputInterval = setInterval(() => {
    if (!arenaSocket || arenaSocket.readyState !== WebSocket.OPEN) return;
    arenaSocket.send(JSON.stringify({
      type: 'input',
      keys: {
        w: Boolean(arenaKeys['w'] || arenaKeys['arrowup']),
        a: Boolean(arenaKeys['a'] || arenaKeys['arrowleft']),
        s: Boolean(arenaKeys['s'] || arenaKeys['arrowdown']),
        d: Boolean(arenaKeys['d'] || arenaKeys['arrowright']),
      },
      angle: arenaAngle,
    }));
  }, 50);
}

function arenaShoot() {
  if (arenaSocket && arenaSocket.readyState === WebSocket.OPEN) {
    arenaSocket.send(JSON.stringify({ type: 'shoot' }));
  }
}

function arenaStartRound() {
  if (!arenaSocket || arenaSocket.readyState !== WebSocket.OPEN) return;
  const target = parseInt(arenaEl('arena-target-kills').value, 10) || 10;
  arenaSocket.send(JSON.stringify({ type: 'start_round', targetKills: target }));
}

function renderArenaFrame() {
  const canvas = arenaEl('arena-canvas');
  if (canvas && canvas.isConnected && arenaSocket) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0B0F14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1E2A38';
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    (arenaState.bullets || []).forEach((b) => {
      ctx.fillStyle = '#F4A93A';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    (arenaState.players || []).forEach((p) => {
      ctx.globalAlpha = p.alive ? 1 : 0.25;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.fillStyle = '#E6EDF3';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.name, p.x, p.y - 22);
    });
  }
  requestAnimationFrame(renderArenaFrame);
}

function renderArenaScoreboard() {
  const box = arenaEl('arena-scoreboard');
  if (!box) return;
  const entries = Object.entries(arenaState.scores || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    box.innerHTML = '<div class="empty">Ingen spillere endnu.</div>';
    return;
  }
  box.innerHTML = entries.map(([name, score], i) => `
    <div class="leaderboard-row">
      <span class="leaderboard-rank">#${i + 1}</span>
      <div style="flex:1; display:flex; justify-content:space-between;">
        <span class="leaderboard-name">${name}</span>
        <span class="leaderboard-score">${score} / ${arenaState.targetKills}</span>
      </div>
    </div>`).join('');
}

async function recordArenaWin(winner) {
  if (typeof data === 'undefined' || typeof saveData !== 'function') return;
  const entry = {
    id: (typeof uid === 'function') ? uid() : `${Date.now()}`,
    game: 'Arena 🎯',
    winner,
    points: 3,
    timestamp: Date.now(),
  };
  await saveData({ ...data, points: [...data.points, entry] });
}

function initArena() {
  const joinBtn = document.getElementById('arena-join-btn');
  const startBtn = document.getElementById('arena-start-btn');
  if (joinBtn) joinBtn.onclick = arenaJoin;
  if (startBtn) startBtn.onclick = arenaStartRound;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initArena);
} else {
  initArena();
}
