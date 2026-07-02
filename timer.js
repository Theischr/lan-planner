/* ---------- Stopwatch ---------- */

let stopwatchStart = null;
let stopwatchElapsed = 0;
let stopwatchInterval = null;
let stopwatchLaps = [];

function formatStopwatch(ms) {
  const totalTenths = Math.floor(ms / 100);
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

function stopwatchTick() {
  const display = document.getElementById('stopwatch-display');
  if (display) display.textContent = formatStopwatch(Date.now() - stopwatchStart + stopwatchElapsed);
}

function toggleStopwatch() {
  const btn = document.getElementById('stopwatch-startpause');
  if (stopwatchInterval) {
    clearInterval(stopwatchInterval);
    stopwatchInterval = null;
    stopwatchElapsed += Date.now() - stopwatchStart;
    btn.textContent = 'Fortsæt';
  } else {
    stopwatchStart = Date.now();
    stopwatchInterval = setInterval(stopwatchTick, 100);
    btn.textContent = 'Pause';
  }
}

function resetStopwatch() {
  clearInterval(stopwatchInterval);
  stopwatchInterval = null;
  stopwatchStart = null;
  stopwatchElapsed = 0;
  stopwatchLaps = [];
  const display = document.getElementById('stopwatch-display');
  if (display) display.textContent = '00:00.0';
  const btn = document.getElementById('stopwatch-startpause');
  if (btn) btn.textContent = 'Start';
  renderLaps();
}

function addLap() {
  const current = stopwatchInterval ? Date.now() - stopwatchStart + stopwatchElapsed : stopwatchElapsed;
  stopwatchLaps.unshift(current);
  renderLaps();
}

function renderLaps() {
  const box = document.getElementById('stopwatch-laps');
  if (!box) return;
  box.innerHTML = stopwatchLaps
    .map((t, i) => `<div class="lap-row"><span>Lap ${stopwatchLaps.length - i}</span><span>${formatStopwatch(t)}</span></div>`)
    .join('');
}

/* ---------- Countdown / alarm ---------- */

let countdownInterval2 = null;
let countdownEndAt = null;
let alarmAudioCtx = null;

function beep() {
  try {
    if (!alarmAudioCtx) alarmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = alarmAudioCtx;
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.5);
      osc.stop(ctx.currentTime + i * 0.5 + 0.3);
    }
  } catch (e) {
    console.warn('Kunne ikke afspille alarmlyd', e);
  }
}

function startCountdown() {
  const minutesInput = document.getElementById('countdown-minutes-input');
  const minutes = parseFloat(minutesInput.value) || 0;
  if (minutes <= 0) return;
  countdownEndAt = Date.now() + minutes * 60000;

  document.getElementById('countdown-start-btn').classList.add('hidden');
  document.getElementById('countdown-stop-btn').classList.remove('hidden');

  countdownTick();
  countdownInterval2 = setInterval(countdownTick, 250);
}

function countdownTick() {
  const display = document.getElementById('countdown-display');
  const diff = countdownEndAt - Date.now();
  if (diff <= 0) {
    display.textContent = "Tiden er gået! ⏰";
    stopCountdown();
    beep();
    return;
  }
  const totalSeconds = Math.ceil(diff / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function stopCountdown() {
  clearInterval(countdownInterval2);
  countdownInterval2 = null;
  document.getElementById('countdown-start-btn').classList.remove('hidden');
  document.getElementById('countdown-stop-btn').classList.add('hidden');
}

/* ---------- Init ---------- */

function initTimer() {
  const sw = document.getElementById('stopwatch-startpause');
  const lap = document.getElementById('stopwatch-lap');
  const reset = document.getElementById('stopwatch-reset');
  const cdStart = document.getElementById('countdown-start-btn');
  const cdStop = document.getElementById('countdown-stop-btn');

  if (sw) sw.onclick = toggleStopwatch;
  if (lap) lap.onclick = addLap;
  if (reset) reset.onclick = resetStopwatch;
  if (cdStart) cdStart.onclick = startCountdown;
  if (cdStop) cdStop.onclick = stopCountdown;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTimer);
} else {
  initTimer();
}
