import gsap from 'gsap';
import { films } from './sections.js';

/**
 * 3D Film Strip Carousel — Infinite Loop
 *
 * Uses clone frames on both sides so the strip wraps seamlessly.
 * Layout: [clone N-2][clone N-1] [real 0]..[real N-1] [clone 0][clone 1]
 * After snapping to a clone, silently teleport rotation to the real frame.
 */

const TILT_X = 10; // gentle tilt — keep front frame content visible
const PAD = 5; // many clone frames for deep spiral visibility
const N = films.length;
let carouselActive = false;

export function setCarouselActive(active) {
  carouselActive = active;
}

function getArcParams() {
  const fw = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--frame-width'));
  const angle = 22;  // tighter spacing = more frames visible in the arc
  const minRadius = (fw + 16) / (2 * Math.sin(angle / 2 * Math.PI / 180));
  return { angle, radius: Math.max(minRadius, 550) };
}

let ANGLE_PER_FRAME, ARC_RADIUS;

let currentIndex = 0;
let targetRotation = 0;
let currentRotation = 0;
let isDragging = false;
let dragStartX = 0;
let dragRotStart = 0;
let velocity = 0;
let lastDragX = 0;
let lastDragTime = 0;
let onChangeCallback = null;
let cylinderEl = null;
let clickBlocked = false;
let activeVideoElements = []; // track all video elements per film index

export function initCarousel(filmScene) {
  const viewport = document.getElementById('carousel-viewport');
  cylinderEl = document.getElementById('carousel-cylinder');

  const params = getArcParams();
  ANGLE_PER_FRAME = params.angle;
  ARC_RADIUS = params.radius;

  buildFrames();
  buildDots();

  // Start at real frame 0 (cylinder position = PAD)
  targetRotation = -PAD * ANGLE_PER_FRAME;
  currentRotation = targetRotation;
  applyCylinderTransform(currentRotation);
  updateInfo(0);
  updateDots(0);

  onChangeCallback = (index) => {
    const film = films[index];
    filmScene.setTargetEffects(film.effects, film.tint, hexToRgb(film.bgColor));
    updateInfo(index);
    updateDots(index);
    playFilmVideo(index);
  };
  onChangeCallback(0);

  // --- Interactions ---
  viewport.addEventListener('mousedown', onDragStart);
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);
  viewport.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onDragEnd);
  viewport.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  document.getElementById('nav-prev').addEventListener('click', () => goTo(currentIndex - 1));
  document.getElementById('nav-next').addEventListener('click', () => goTo(currentIndex + 1));

  requestAnimationFrame(tick);
}

function buildFrames() {
  // Total: PAD clones (from end) + N real + PAD clones (from start)
  const totalFrames = PAD + N + PAD;

  for (let j = 0; j < totalFrames; j++) {
    // Map cylinder position to film index (with wrapping)
    const filmIndex = ((j - PAD) % N + N) % N;
    const film = films[filmIndex];

    const segment = document.createElement('div');
    segment.className = 'film-segment';

    const angle = j * ANGLE_PER_FRAME;
    segment.style.transform = `rotateY(${angle}deg) translateZ(${ARC_RADIUS}px)`;

    const video = document.createElement('video');
    video.src = Array.isArray(film.video)
      ? film.video[Math.floor(Math.random() * film.video.length)]
      : film.video;
    video.loop = true;
    video.muted = true; // start muted for autoplay policy
    video.playsInline = true;
    video.preload = 'metadata';
    video.className = 'seg-video';
    video.disableRemotePlayback = true;
    video.setAttribute('controlslist', 'noplaybackrate nodownload nofullscreen');
    video.setAttribute('disablepictureinpicture', '');

    // Track video elements by film index for play/pause control
    if (!activeVideoElements[filmIndex]) activeVideoElements[filmIndex] = [];
    activeVideoElements[filmIndex].push(video);

    segment.innerHTML = `
      <div class="seg-sprocket">${sprocketRow()}</div>
      <div class="seg-frame">
        <div class="seg-poster"></div>
      </div>
      <div class="seg-sprocket">${sprocketRow()}</div>
    `;
    segment.querySelector('.seg-poster').appendChild(video);

    // Click navigates to this film (use the real index)
    const clickIndex = filmIndex;
    segment.addEventListener('click', () => {
      if (!clickBlocked) goTo(clickIndex);
    });

    cylinderEl.appendChild(segment);
  }
}

function sprocketRow() {
  let h = '';
  for (let i = 0; i < 10; i++) h += '<span class="sp-hole"></span>';
  return h;
}

function buildDots() {
  const c = document.getElementById('dot-indicators');
  films.forEach((_, i) => {
    const d = document.createElement('div');
    d.className = 'dot' + (i === 0 ? ' active' : '');
    d.addEventListener('click', () => goTo(i));
    c.appendChild(d);
  });
}

function applyCylinderTransform(rotY) {
  cylinderEl.style.transform = `rotateX(${TILT_X}deg) rotateY(${rotY}deg)`;
}

function updateInfo(index) {
  const film = films[index];
  const title = document.getElementById('film-info-title');
  const meta = document.getElementById('film-info-meta');

  gsap.to(title, {
    opacity: 0, y: -15, duration: 0.2, ease: 'power2.in',
    onComplete: () => {
      title.textContent = film.name;
      title.style.color = film.color;
      gsap.fromTo(title, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
    }
  });
  gsap.to(meta, {
    opacity: 0, duration: 0.15,
    onComplete: () => {
      meta.textContent = `${film.year}  ·  ${film.tagline}`;
      gsap.to(meta, { opacity: 0.5, duration: 0.3 });
    }
  });
}

function updateDots(index) {
  document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === index));
}

/**
 * Video playback control — play active film's videos, pause all others.
 * Unmutes after first user interaction (click/touch/key).
 */
let videoUnmuted = false;

function playFilmVideo(index) {
  // Pause all videos
  for (let i = 0; i < N; i++) {
    if (!activeVideoElements[i]) continue;
    for (const v of activeVideoElements[i]) {
      v.pause();
      v.currentTime = 0;
    }
  }
  // Play active film's videos (both real and clone frames)
  if (!activeVideoElements[index]) return;
  for (const v of activeVideoElements[index]) {
    v.muted = !videoUnmuted;
    v.play().catch(() => {}); // ignore if blocked by browser
  }
}

function setMuteState(muted) {
  videoUnmuted = !muted;
  if (!activeVideoElements[currentIndex]) return;
  for (const v of activeVideoElements[currentIndex]) {
    v.muted = muted;
  }
  updateMuteIcon();
}

function updateMuteIcon() {
  const iconMuted = document.getElementById('icon-muted');
  const iconUnmuted = document.getElementById('icon-unmuted');
  if (!iconMuted || !iconUnmuted) return;
  iconMuted.style.display = videoUnmuted ? 'none' : 'block';
  iconUnmuted.style.display = videoUnmuted ? 'block' : 'none';
}

// Mute button click
const muteBtn = document.getElementById('mute-btn');
if (muteBtn) {
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setMuteState(videoUnmuted);
  });
}

/**
 * Navigate to a film by index — supports wrapping.
 * index can be -1 (wrap to last) or N (wrap to first), etc.
 */
function goTo(index) {
  // Wrap the logical index
  const wrapped = ((index % N) + N) % N;

  // Determine direction: find the cylinder position that's closest to current rotation
  // Current cylinder position for currentIndex: PAD + currentIndex
  // We want to move by the delta between index and currentIndex (not wrapped — to preserve direction)
  const delta = index - currentIndex;

  // Update the target rotation by the delta (not by absolute position)
  // This ensures we rotate in the correct direction, even across the wrap boundary
  targetRotation -= delta * ANGLE_PER_FRAME;
  velocity = 0;
  currentIndex = wrapped;

  if (onChangeCallback) onChangeCallback(wrapped);

  // Schedule a teleport check after animation settles
  scheduleNormalize();
}

/**
 * After animation, normalize rotation so we stay within the "real" range.
 * This prevents the cylinder from drifting too far.
 */
let normalizeTimer = null;
function scheduleNormalize() {
  clearTimeout(normalizeTimer);
  normalizeTimer = setTimeout(() => {
    // The canonical rotation for currentIndex
    const canonical = -(currentIndex + PAD) * ANGLE_PER_FRAME;
    const diff = targetRotation - canonical;
    // If diff is a multiple of the full cycle, we've drifted
    const fullCycle = N * ANGLE_PER_FRAME;
    if (Math.abs(diff) >= fullCycle - 0.1) {
      // Teleport: instantly reset both rotations
      targetRotation = canonical;
      currentRotation = canonical;
    }
  }, 500);
}

// --- Drag ---
function onDragStart(e) {
  isDragging = true; clickBlocked = false;
  dragStartX = e.clientX; dragRotStart = targetRotation;
  lastDragX = e.clientX; lastDragTime = Date.now(); velocity = 0;
}
function onTouchStart(e) {
  isDragging = true; clickBlocked = false;
  const x = e.touches[0].clientX;
  dragStartX = x; dragRotStart = targetRotation;
  lastDragX = x; lastDragTime = Date.now(); velocity = 0;
}
function onDragMove(e) {
  if (!isDragging) return;
  const x = e.clientX;
  if (Math.abs(x - dragStartX) > 5) clickBlocked = true;
  const sensitivity = 0.08;
  targetRotation = dragRotStart + (x - dragStartX) * sensitivity;
  trackVel(x);
}
function onTouchMove(e) {
  if (!isDragging) return;
  e.preventDefault();
  const x = e.touches[0].clientX;
  if (Math.abs(x - dragStartX) > 5) clickBlocked = true;
  const sensitivity = 0.08;
  targetRotation = dragRotStart + (x - dragStartX) * sensitivity;
  trackVel(x);
}
function trackVel(x) {
  const now = Date.now();
  const dt = now - lastDragTime;
  if (dt > 0) velocity = (x - lastDragX) * 0.08 / dt * 16;
  lastDragX = x; lastDragTime = now;
}
function onDragEnd() {
  if (!isDragging) return;
  isDragging = false;
  targetRotation += velocity * 3;
  snap();
}

function snap() {
  // Find nearest cylinder position
  let cylinderIdx = Math.round(-targetRotation / ANGLE_PER_FRAME);
  // Map to film index with wrapping
  let filmIdx = ((cylinderIdx - PAD) % N + N) % N;

  // Snap to this position on the cylinder
  targetRotation = -cylinderIdx * ANGLE_PER_FRAME;

  if (filmIdx !== currentIndex) {
    currentIndex = filmIdx;
    if (onChangeCallback) onChangeCallback(filmIdx);
  }

  // Normalize to stay within clone range
  scheduleNormalize();
}

function onWheel(e) {
  if (!carouselActive) return; // let page scroll through
  e.preventDefault();
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(d) > 2) {
    targetRotation -= d * 0.04;
    clearTimeout(onWheel._t);
    onWheel._t = setTimeout(snap, 250);
  }
}
function onKey(e) {
  if (e.key === 'ArrowLeft') goTo(currentIndex - 1);
  if (e.key === 'ArrowRight') goTo(currentIndex + 1);
}

// --- Render ---
function tick() {
  const lerp = isDragging ? 0.35 : 0.08;
  currentRotation += (targetRotation - currentRotation) * lerp;

  // Only apply X tilt on cylinder — Y rotation is per-frame for spiral control
  cylinderEl.style.transform = `rotateX(${TILT_X}deg)`;

  // Per-frame spiral transforms
  const frames = cylinderEl.children;
  for (let i = 0; i < frames.length; i++) {
    const baseAngle = i * ANGLE_PER_FRAME;
    const worldAngle = baseAngle + currentRotation;

    // Normalize to [-180, 180] to get distance from front-facing
    let rel = worldAngle % 360;
    if (rel > 180) rel -= 360;
    if (rel < -180) rel += 360;

    const t = Math.abs(rel) / 180; // 0 = front, 1 = back

    // Film reel spiral: front frame is closest, frames curl away and up
    const spiralRadius = ARC_RADIUS * (1 - t * 0.6);  // linear collapse for smooth recede
    const spiralY = t * t * 250;                   // quadratic rise — steep at edges
    const frameScale = Math.max(0.2, 1 - t * 0.7); // shrink to 30% at back
    const frameOpacity = Math.max(0.02, Math.pow(1 - t, 2)); // quadratic fade

    // Tilt back for receding frames
    const tiltBack = t * 20;

    frames[i].style.transform =
      `rotateY(${worldAngle}deg) translateZ(${spiralRadius}px) translateY(${-spiralY}px) rotateX(${tiltBack}deg) scale(${frameScale})`;
    frames[i].style.opacity = frameOpacity;
  }

  requestAnimationFrame(tick);
}

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? [parseInt(r[1],16)/255, parseInt(r[2],16)/255, parseInt(r[3],16)/255] : [0,0,0];
}
