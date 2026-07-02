const SPOTIFY_CLIENT_ID = '5bc849ae64ac41888fb0bda78ab96887';
const SPOTIFY_REDIRECT_URI = 'https://lan-plan.pages.dev/spotify-callback';
const SPOTIFY_SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
const SPOTIFY_TOKEN_KEY = 'lan-planner-spotify-tokens';
const SPOTIFY_VERIFIER_KEY = 'lan-planner-spotify-verifier';

let spotifyPollInterval = null;
let spotifyDevicesCache = [];

function spotifyBase64UrlEncode(bytes) {
  let str = '';
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function spotifyRandomString(length) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return spotifyBase64UrlEncode(arr).slice(0, length);
}

async function spotifySha256(plain) {
  const data = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

async function spotifyLogin() {
  const verifier = spotifyRandomString(64);
  localStorage.setItem(SPOTIFY_VERIFIER_KEY, verifier);
  const challenge = spotifyBase64UrlEncode(await spotifySha256(verifier));
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function spotifyLogout() {
  localStorage.removeItem(SPOTIFY_TOKEN_KEY);
  stopSpotifyPolling();
  renderSpotifyTab();
}

function getSpotifyTokens() {
  try {
    return JSON.parse(localStorage.getItem(SPOTIFY_TOKEN_KEY) || 'null');
  } catch {
    return null;
  }
}

async function refreshSpotifyToken() {
  const tokens = getSpotifyTokens();
  if (!tokens || !tokens.refresh_token) return null;
  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    localStorage.removeItem(SPOTIFY_TOKEN_KEY);
    return null;
  }
  const tokenData = await res.json();
  const next = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + tokenData.expires_in * 1000,
  };
  localStorage.setItem(SPOTIFY_TOKEN_KEY, JSON.stringify(next));
  return next;
}

async function getValidSpotifyToken() {
  let tokens = getSpotifyTokens();
  if (!tokens) return null;
  if (Date.now() > tokens.expires_at - 30000) {
    tokens = await refreshSpotifyToken();
  }
  return tokens ? tokens.access_token : null;
}

async function spotifyApi(path, options = {}) {
  const token = await getValidSpotifyToken();
  if (!token) throw new Error('not_connected');
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (res.status === 401) {
    localStorage.removeItem(SPOTIFY_TOKEN_KEY);
    throw new Error('unauthorized');
  }
  if (res.status === 204 || res.status === 202) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || `spotify_error_${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function isSpotifyConnected() {
  return Boolean(getSpotifyTokens());
}

/* ---------- Rendering ---------- */

function spotifyEl(id) {
  return document.getElementById(id);
}

async function renderSpotifyTab() {
  const connectedView = spotifyEl('spotify-connected');
  const loginView = spotifyEl('spotify-login');
  if (!connectedView || !loginView) return;

  if (!isSpotifyConnected()) {
    loginView.classList.remove('hidden');
    connectedView.classList.add('hidden');
    return;
  }

  loginView.classList.add('hidden');
  connectedView.classList.remove('hidden');

  try {
    const [playback, devicesResp] = await Promise.all([
      spotifyApi('/me/player').catch((e) => {
        if (e.message === 'not_connected' || e.message === 'unauthorized') throw e;
        return null; // no active playback -> Spotify returns empty body
      }),
      spotifyApi('/me/player/devices'),
    ]);
    spotifyDevicesCache = (devicesResp && devicesResp.devices) || [];
    renderSpotifyNowPlaying(playback);
    renderSpotifyDevices(playback);
  } catch (e) {
    if (e.message === 'not_connected' || e.message === 'unauthorized') {
      renderSpotifyTab();
      return;
    }
    spotifyEl('spotify-now-playing').innerHTML = `<div class="empty">Kunne ikke hente afspilningsstatus (${escapeHtml(e.message)}).</div>`;
  }
}

function renderSpotifyNowPlaying(playback) {
  const box = spotifyEl('spotify-now-playing');
  if (!playback || !playback.item) {
    box.innerHTML = '<div class="empty">Intet spiller lige nu. Vælg en enhed nedenfor og tryk play i Spotify-appen, eller start fra en aktiv enhed.</div>';
    spotifyEl('spotify-controls').classList.add('hidden');
    return;
  }
  spotifyEl('spotify-controls').classList.remove('hidden');
  const track = playback.item;
  const artists = track.artists.map((a) => a.name).join(', ');
  const art = track.album && track.album.images && track.album.images[0] ? track.album.images[0].url : '';

  box.innerHTML = `
    <div class="spotify-track">
      ${art ? `<img class="spotify-art" src="${art}" alt="${escapeHtml(track.name)}" />` : '<div class="spotify-art spotify-art-fallback">🎵</div>'}
      <div class="spotify-track-info">
        <div class="spotify-track-name">${escapeHtml(track.name)}</div>
        <div class="spotify-track-artist">${escapeHtml(artists)}</div>
        <div class="spotify-track-device">${playback.device ? '📍 ' + escapeHtml(playback.device.name) : ''}</div>
      </div>
    </div>`;

  const playPauseBtn = spotifyEl('spotify-playpause');
  playPauseBtn.textContent = playback.is_playing ? '⏸' : '▶';
  const volumeSlider = spotifyEl('spotify-volume');
  if (playback.device && typeof playback.device.volume_percent === 'number' && document.activeElement !== volumeSlider) {
    volumeSlider.value = playback.device.volume_percent;
  }
}

function renderSpotifyDevices(playback) {
  const box = spotifyEl('spotify-devices');
  if (spotifyDevicesCache.length === 0) {
    box.innerHTML = '<div class="empty">Ingen Spotify Connect-enheder fundet. Åbn Spotify-appen på jeres Google-højtaler (eller cast til den) så den dukker op her.</div>';
    return;
  }
  box.innerHTML = '';
  spotifyDevicesCache.forEach((dev) => {
    const row = document.createElement('button');
    row.className = 'spotify-device-row' + (dev.is_active ? ' active' : '');
    row.innerHTML = `<span>${dev.is_active ? '🔊' : '📱'} ${escapeHtml(dev.name)}</span><span class="muted small">${escapeHtml(dev.type)}</span>`;
    row.onclick = () => transferSpotifyPlayback(dev.id);
    box.appendChild(row);
  });
}

/* ---------- Actions ---------- */

async function spotifyTogglePlayPause() {
  try {
    const playback = await spotifyApi('/me/player');
    if (playback && playback.is_playing) {
      await spotifyApi('/me/player/pause', { method: 'PUT' });
    } else {
      await spotifyApi('/me/player/play', { method: 'PUT' });
    }
  } catch (e) {
    showError('Kunne ikke styre afspilning: ' + e.message);
  }
  renderSpotifyTab();
}

async function spotifyNext() {
  try {
    await spotifyApi('/me/player/next', { method: 'POST' });
  } catch (e) {
    showError('Kunne ikke skifte nummer: ' + e.message);
  }
  setTimeout(renderSpotifyTab, 500);
}

async function spotifyPrevious() {
  try {
    await spotifyApi('/me/player/previous', { method: 'POST' });
  } catch (e) {
    showError('Kunne ikke skifte nummer: ' + e.message);
  }
  setTimeout(renderSpotifyTab, 500);
}

async function spotifySetVolume(percent) {
  try {
    await spotifyApi(`/me/player/volume?volume_percent=${Math.round(percent)}`, { method: 'PUT' });
  } catch (e) {
    // Volume control unsupported on some devices (e.g. some casts) - fail quietly
    console.warn('volume change failed', e.message);
  }
}

async function transferSpotifyPlayback(deviceId) {
  try {
    await spotifyApi('/me/player', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_ids: [deviceId], play: true }),
    });
  } catch (e) {
    showError('Kunne ikke skifte til den enhed: ' + e.message);
  }
  setTimeout(renderSpotifyTab, 500);
}

/* ---------- Polling ---------- */

function startSpotifyPolling() {
  if (spotifyPollInterval) clearInterval(spotifyPollInterval);
  spotifyPollInterval = setInterval(() => {
    if (isSpotifyConnected()) renderSpotifyTab();
  }, 8000);
}

function stopSpotifyPolling() {
  if (spotifyPollInterval) clearInterval(spotifyPollInterval);
}

/* ---------- Init ---------- */

function initSpotify() {
  const loginBtn = document.getElementById('spotify-login-btn');
  const logoutBtn = document.getElementById('spotify-logout-btn');
  const playPauseBtn = document.getElementById('spotify-playpause');
  const nextBtn = document.getElementById('spotify-next');
  const prevBtn = document.getElementById('spotify-previous');
  const volumeSlider = document.getElementById('spotify-volume');

  if (loginBtn) loginBtn.onclick = spotifyLogin;
  if (logoutBtn) logoutBtn.onclick = spotifyLogout;
  if (playPauseBtn) playPauseBtn.onclick = spotifyTogglePlayPause;
  if (nextBtn) nextBtn.onclick = spotifyNext;
  if (prevBtn) prevBtn.onclick = spotifyPrevious;
  if (volumeSlider) {
    let debounce;
    volumeSlider.addEventListener('input', (e) => {
      clearTimeout(debounce);
      const val = e.target.value;
      debounce = setTimeout(() => spotifySetVolume(val), 300);
    });
  }

  renderSpotifyTab();
  if (isSpotifyConnected()) startSpotifyPolling();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSpotify);
} else {
  initSpotify();
}
