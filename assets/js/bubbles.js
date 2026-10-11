// ---------- Audio (always on, unlocked on first gesture) ----------
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

window.addEventListener('load', initAudio);
['pointerdown','touchstart','mousedown','keydown','scroll','mousemove']
  .forEach(ev => window.addEventListener(ev, () => initAudio(),
    { once: true, passive: true }));

function playPop(sizeRatio) {
  const ctx = initAudio();
  if (!ctx || ctx.state !== 'running') return;
  const baseFreq = 900 - sizeRatio * 500;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 2.2,
                                             ctx.currentTime + 0.06);
  filter.type = 'bandpass';
  filter.frequency.value = baseFreq * 1.5;
  filter.Q.value = 8;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.20, ctx.currentTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.22);
}

// ---------- Bubbles ----------
const tints = [
  'rgba(255,180,220,0.55)','rgba(180,220,255,0.55)',
  'rgba(200,255,220,0.55)','rgba(255,240,180,0.55)',
  'rgba(230,190,255,0.55)','rgba(180,255,240,0.55)'
];

const MAX_BUBBLES = 14;
let activeCount = 0;

function spawnBubble() {
  const layer = document.getElementById('bubbleLayer');
  if (!layer) return;
  if (activeCount >= MAX_BUBBLES) return;

  const b = document.createElement('div');
  b.className = 'bubble';

  const size = 30 + Math.random() * 80;
  const duration = 7 + Math.random() * 5;
  const driftX = (Math.random() - 0.5) * 80;

  b.style.width = size + 'px';
  b.style.height = size + 'px';
  b.style.left = (Math.random() * 100) + 'vw';
  b.style.setProperty('--drift-x', driftX + 'px');
  b.style.setProperty('--tint',
    tints[Math.floor(Math.random() * tints.length)]);
  b.style.animationDuration = duration + 's';

  activeCount++;

  const popAt = (0.70 + Math.random() * 0.2) * duration * 1000;
  const popTimer = setTimeout(() => {
    if (!b.parentNode) return;
    b.classList.add('pop');
    playPop(size / 110);
    setTimeout(() => b.remove(), 450);
  }, popAt);

  layer.appendChild(b);

  const removeTimer = setTimeout(() => {
    clearTimeout(popTimer);
    b.remove();
  }, duration * 1000 + 500);

  const obs = new MutationObserver(() => {
    if (!b.parentNode) {
      activeCount = Math.max(0, activeCount - 1);
      clearTimeout(removeTimer);
      obs.disconnect();
    }
  });
  obs.observe(layer, { childList: true });
}

// --- Bubble throttling + visibility control ---
let bubbleIntervalId = null;

function startBubbles() {
  if (bubbleIntervalId) return;
  bubbleIntervalId = setInterval(spawnBubble, 900);  // slower spawn
  for (let i = 0; i < 3; i++) setTimeout(spawnBubble, i * 250);
}

function stopBubbles() {
  if (bubbleIntervalId) {
    clearInterval(bubbleIntervalId);
    bubbleIntervalId = null;
  }
  // Clear existing bubbles to free GPU
  const layer = document.getElementById('bubbleLayer');
  if (layer) layer.innerHTML = '';
}

// Expose globally so other code can pause bubbles
window.Bubbles = { start: startBubbles, stop: stopBubbles };

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('bubbleLayer')) {
    const l = document.createElement('div');
    l.id = 'bubbleLayer';
    document.body.prepend(l);
  }
  // Only start bubbles if the user prefers motion
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReduced) {
    startBubbles();
  }

  // Pause bubbles when tab is hidden (huge battery + CPU saver)
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopBubbles();
    else if (!prefersReduced) startBubbles();
  });
});
