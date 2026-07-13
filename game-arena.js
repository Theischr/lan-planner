// ⚠️ Opdatér denne URL efter du har deployet game-server/ som en separat Cloudflare Worker.
// Formatet er typisk: wss://<worker-navn>.<din-subdomæne>.workers.dev/room
const ARENA_SERVER_URL = 'wss://lan-arena-game.YOUR-SUBDOMAIN.workers.dev/room';

const PICKUP_LABELS = {
  shotgun: { emoji: '🔫', color: '#F4A93A' },
  smg: { emoji: '🔥', color: '#F1596B' },
  speed: { emoji: '⚡', color: '#F4A93A' },
  invis: { emoji: '👻', color: '#B98CF0' },
  shield: { emoji: '🛡️', color: '#4CC9F0' },
};

let arenaSocket = null;
let arenaState = { players: [], bullets: [], pickups: [], obstacles: [], scores: {}, roundActive: false, targetKills: 10, arena: { w: 800, h: 500 } };
let arenaKeys = {};
let arenaAngle = 0;
let arenaInputInterval = null;
let arenaListenersBound = false;

let arenaBloodParticles = []; // { x, y, vx, vy, born, life }
let arenaBloodSplatters = []; // { x, y, r, born, life }
let arenaTrails = {}; // name -> [{x,y,t}]
let arenaAvatarImages = {}; // name -> HTMLImageElement (cached, keyed by data URL to detect changes)

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
    arenaEl('arena-hud').classList.remove('hidden');
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
      renderArenaHud();
      updateArenaTrails();
    } else if (msg.type === 'game_over') {
      arenaEl('arena-status').textContent = `${msg.winner} vandt runden! 🏆`;
      recordArenaWin(msg.winner);
    } else if (msg.type === 'round_started') {
      arenaEl('arena-status').textContent = 'Runde startet — kæmp!';
      arenaBloodParticles = [];
      arenaBloodSplatters = [];
      arenaTrails = {};
    } else if (msg.type === 'kill') {
      arenaEl('arena-status').textContent = `${msg.killer} nakkede ${msg.victim}`;
      if (typeof msg.x === 'number' && typeof msg.y === 'number') {
        spawnBloodEffect(msg.x, msg.y);
      }
    } else if (msg.type === 'shield_block') {
      arenaEl('arena-status').textContent = `${msg.victim}s skjold absorberede et hit 🛡️`;
    } else if (msg.type === 'pickup') {
      arenaEl('arena-status').textContent = `${msg.player} samlede ${pickupName(msg.kind)}`;
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

function pickupName(kind) {
  const names = { shotgun: 'en shotgun', smg: 'et maskingevær', speed: 'speed boost', invis: 'usynlighed', shield: 'et skjold' };
  return names[kind] || kind;
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
    if (e.key === 'Control' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
      arenaDash();
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

function arenaDash() {
  if (arenaSocket && arenaSocket.readyState === WebSocket.OPEN) {
    arenaSocket.send(JSON.stringify({ type: 'dash' }));
  }
}

function arenaStartRound() {
  if (!arenaSocket || arenaSocket.readyState !== WebSocket.OPEN) return;
  const target = parseInt(arenaEl('arena-target-kills').value, 10) || 10;
  arenaSocket.send(JSON.stringify({ type: 'start_round', targetKills: target }));
}

/* ---------- Effects ---------- */

function spawnBloodEffect(x, y) {
  for (let i = 0; i < 14; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    arenaBloodParticles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      born: performance.now(),
      life: 400 + Math.random() * 300,
    });
  }
  arenaBloodSplatters.push({
    x, y,
    r: 10 + Math.random() * 8,
    born: performance.now(),
    life: 9000,
  });
}

function updateArenaTrails() {
  (arenaState.players || []).forEach((p) => {
    if (!p.speedBoost && !p.dashing) return;
    if (!arenaTrails[p.name]) arenaTrails[p.name] = [];
    arenaTrails[p.name].push({ x: p.x, y: p.y, t: performance.now() });
    if (arenaTrails[p.name].length > 10) arenaTrails[p.name].shift();
  });
}

/* ---------- Rendering ---------- */

function getArenaAvatarImage(name, url) {
  const cached = arenaAvatarImages[name];
  if (cached && cached.src === url) return cached;
  const img = new Image();
  img.src = url;
  arenaAvatarImages[name] = img;
  return img;
}

function renderArenaFrame() {
  const canvas = arenaEl('arena-canvas');
  if (canvas && canvas.isConnected && arenaSocket) {
    const ctx = canvas.getContext('2d');
    const now = performance.now();

    ctx.fillStyle = '#0B0F14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1E2A38';
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // Blood splatters (persistent, fading marks on the ground)
    arenaBloodSplatters = arenaBloodSplatters.filter((s) => now - s.born < s.life);
    arenaBloodSplatters.forEach((s) => {
      const age = (now - s.born) / s.life;
      ctx.globalAlpha = Math.max(0, 0.5 * (1 - age));
      ctx.fillStyle = '#8a1f2c';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Obstacles
    (arenaState.obstacles || []).forEach((o) => {
      ctx.fillStyle = '#1E2A38';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = '#3D4A58';
      ctx.strokeRect(o.x, o.y, o.w, o.h);
    });

    // Pickups
    (arenaState.pickups || []).forEach((p) => {
      if (!p) return;
      const info = PICKUP_LABELS[p.kind] || { emoji: '❓', color: '#7C8A9A' };
      ctx.globalAlpha = 0.15 + Math.abs(Math.sin(now / 300)) * 0.1;
      ctx.fillStyle = info.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.emoji, p.x, p.y);
    });

    // Movement trails (speed boost / dash)
    Object.entries(arenaTrails).forEach(([name, trail]) => {
      const player = (arenaState.players || []).find((p) => p.name === name);
      if (!player) return;
      trail.forEach((pt, i) => {
        const age = (now - pt.t) / 400;
        if (age > 1) return;
        ctx.globalAlpha = Math.max(0, 0.25 * (1 - age));
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    });

    // Blood particles (flying on kill)
    arenaBloodParticles = arenaBloodParticles.filter((b) => now - b.born < b.life);
    arenaBloodParticles.forEach((b) => {
      const age = (now - b.born) / b.life;
      const x = b.x + b.vx * age * 20;
      const y = b.y + b.vy * age * 20;
      ctx.globalAlpha = Math.max(0, 1 - age);
      ctx.fillStyle = '#F1596B';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Bullets
    (arenaState.bullets || []).forEach((b) => {
      ctx.fillStyle = '#F4A93A';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Players
    (arenaState.players || []).forEach((p) => {
      const isMe = p.name === myName;
      const hiddenFromOthers = p.invisible && !isMe;
      ctx.globalAlpha = !p.alive ? 0.2 : hiddenFromOthers ? 0.12 : (p.invisible ? 0.45 : 1);

      ctx.fillStyle = p.color;
      const avatarUrl = (typeof data !== 'undefined' && data.avatars) ? data.avatars[p.name] : null;
      const avatarImg = avatarUrl ? getArenaAvatarImage(p.name, avatarUrl) : null;

      if (avatarImg && avatarImg.complete && avatarImg.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarImg, p.x - 14, p.y - 14, 28, 28);
        ctx.restore();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      if (p.shield > 0) {
        ctx.strokeStyle = '#4CC9F0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 19, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (p.invulnerable && p.alive) {
        ctx.strokeStyle = '#F4A93A';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20);
      ctx.stroke();

      ctx.globalAlpha = !p.alive ? 0.3 : 1;
      ctx.fillStyle = '#E6EDF3';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(p.name + (p.weapon !== 'pistol' ? ` (${p.weapon})` : ''), p.x, p.y - 24);
      ctx.globalAlpha = 1;
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

function renderArenaHud() {
  const hud = arenaEl('arena-hud');
  if (!hud) return;
  const me = (arenaState.players || []).find((p) => p.name === myName);
  if (!me) {
    hud.innerHTML = '';
    return;
  }
  const weaponLabel = { pistol: '🔫 Pistol', shotgun: '💥 Shotgun', smg: '🔥 Maskingevær' }[me.weapon] || me.weapon;
  const shieldLabel = me.shield > 0 ? ` · 🛡️ x${me.shield}` : '';
  const speedLabel = me.speedBoost ? ' · ⚡ Speed' : '';
  const invisLabel = me.invisible ? ' · 👻 Usynlig' : '';
  const dashLabel = me.dashReady ? '⌨️ Dash klar (Ctrl)' : '⌨️ Dash på afkøling…';
  hud.innerHTML = `${weaponLabel}${shieldLabel}${speedLabel}${invisLabel} — ${dashLabel}`;
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
