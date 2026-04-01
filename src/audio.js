/**
 * Audio effects using Web Audio API (no external files needed).
 * - CRT power-on hum
 * - Film projector clicking
 * - Section transition woosh
 */

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * CRT boot hum — low-frequency buzz that fades out.
 */
export function playCRTHum() {
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Base hum (60Hz mains hum)
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(60, now);
  osc.frequency.linearRampToValueAtTime(120, now + 0.3);
  osc.frequency.linearRampToValueAtTime(60, now + 0.8);

  // Harmonic overtone
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(120, now);

  // Gain envelope
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.1);
  gain.gain.setValueAtTime(0.08, now + 1.5);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);

  // Filter (muffled sound)
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(200, now);
  filter.frequency.linearRampToValueAtTime(400, now + 0.5);
  filter.frequency.linearRampToValueAtTime(150, now + 3.0);

  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc2.start(now);
  osc.stop(now + 3.0);
  osc2.stop(now + 3.0);
}

/**
 * Film projector click — short percussive tick.
 */
export function playProjectorClick() {
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Short noise burst
  const bufferSize = ctx.sampleRate * 0.03;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 800;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  source.start(now);
}

/**
 * Section transition woosh — filtered noise sweep.
 */
export function playTransitionWoosh() {
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Noise buffer
  const duration = 0.4;
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // Sweeping bandpass filter
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(200, now);
  filter.frequency.exponentialRampToValueAtTime(2000, now + 0.15);
  filter.frequency.exponentialRampToValueAtTime(100, now + duration);
  filter.Q.value = 2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.06, now + 0.05);
  gain.gain.linearRampToValueAtTime(0.04, now + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  source.start(now);
}

/**
 * Ambient projector loop — continuous gentle clicking.
 * Returns a stop function.
 */
export function startProjectorLoop() {
  let running = true;
  let timeoutId;

  function tick() {
    if (!running) return;
    playProjectorClick();
    // Slightly irregular timing for realism
    const interval = 180 + Math.random() * 40;
    timeoutId = setTimeout(tick, interval);
  }

  // Start after a short delay
  timeoutId = setTimeout(tick, 500);

  return {
    stop() {
      running = false;
      clearTimeout(timeoutId);
    }
  };
}

/**
 * Resume audio context on first user interaction (browser autoplay policy).
 */
export function enableAudioOnInteraction() {
  const resume = () => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    window.removeEventListener('click', resume);
    window.removeEventListener('wheel', resume);
    window.removeEventListener('keydown', resume);
  };
  window.addEventListener('click', resume, { once: true });
  window.addEventListener('wheel', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });
}
