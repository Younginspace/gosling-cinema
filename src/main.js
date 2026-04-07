import './style.css';
import Lenis from 'lenis';
import gsap from 'gsap';
import { initBootScreen } from './boot-screen.js';
import { FilmScene } from './scene.js';
import { initCarousel, setCarouselActive } from './carousel.js';
import { initMouseTracker } from './mouse-tracker.js';

const canvas = document.getElementById('webgl-canvas');
const filmScene = new FilmScene(canvas);

/* ─── Scroll management ─── */

let scrollEnabled = false;

const lenis = new Lenis({
  duration: 1.4,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
});

function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// Scroll → drive scene transition + overlay visibility
lenis.on('scroll', ({ scroll, limit }) => {
  if (!scrollEnabled || limit === 0) return;

  const heroEnd = limit * 0.25;       // hero phase ends (earlier to give more room for zoom)
  const transEnd = limit * 0.70;      // transition completes (longer for smoother zoom)

  // Hero overlay fade
  const heroEl = document.getElementById('hero-overlay');
  if (scroll < heroEnd) {
    heroEl.style.opacity = '1';
  } else {
    heroEl.style.opacity = String(Math.max(0, 1 - (scroll - heroEnd) / (transEnd - heroEnd) * 1.5));
  }

  // 3D scene scroll progress (model moves up into fog)
  if (scroll <= heroEnd) {
    filmScene.setScrollProgress(0);
  } else if (scroll <= transEnd) {
    filmScene.setScrollProgress((scroll - heroEnd) / (transEnd - heroEnd));
  } else {
    filmScene.setScrollProgress(1);
  }

  // Carousel elements visibility
  const carouselT = Math.max(0, (scroll - heroEnd) / (transEnd - heroEnd));
  const ids = ['carousel-viewport', 'film-info', 'nav-prev', 'nav-next', 'dot-indicators', 'credits-line', 'mute-btn'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (carouselT > 0.2) {
      el.classList.remove('initially-hidden');
      el.style.opacity = String(Math.min((carouselT - 0.2) / 0.6, 1));
      el.style.pointerEvents = carouselT > 0.8 ? '' : 'none';
    } else {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    }
  }

  // Enable carousel interaction only when fully visible
  setCarouselActive(carouselT >= 0.9);
});

/* ─── Boot → Reveal → Scroll ─── */

initBootScreen(
  // onReady — boot messages done, scene not yet revealed
  async (fadeOut) => {
    await filmScene.ready;

    // Render final boot state on CRT texture
    filmScene.renderCRTBoot(
      [
        'Detecting display adapter... CRT-2600 OK',
        'Loading filmography database...',
        'Film 01–05 ...................... OK',
        'Shader compilation complete.',
        'Starting projection...',
      ],
      1.0,
      'Ready.',
    );

    // Pre-render the 3D scene so the first frame is ready beneath the boot screen
    filmScene.startReveal(() => {
      // Show hero overlay
      const hero = document.getElementById('hero-overlay');
      hero.classList.remove('initially-hidden');
      gsap.fromTo(hero, { opacity: 0 }, { opacity: 1, duration: 1.2, ease: 'power2.out' });

      // Enable scrolling
      document.body.classList.remove('no-scroll');
      scrollEnabled = true;

      // Init carousel (hidden until scroll reveals it)
      initCarousel(filmScene);

      // Mouse effects
      initMouseTracker(filmScene);
    });

    // Wait a couple of frames so the 3D scene renders with model at opacity 0
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    // NOW fade out the boot screen — everything underneath is ready
    await fadeOut();
  },

  // onUpdate — sync CRT texture during boot
  (messages, progress, status) => {
    filmScene.renderCRTBoot(messages, progress, status);
  },
);
