import './style.css';
import { initBootScreen } from './boot-screen.js';
import { FilmScene } from './scene.js';
import { initCarousel } from './carousel.js';
import { initMouseTracker } from './mouse-tracker.js';
// Audio disabled for now
// import { playCRTHum, startProjectorLoop, enableAudioOnInteraction } from './audio.js';
// enableAudioOnInteraction();

// Initialize Three.js scene immediately (renders behind boot screen)
const canvas = document.getElementById('webgl-canvas');
const filmScene = new FilmScene(canvas);

// Run boot screen, then enable carousel
initBootScreen(() => {
  // Start 3D film strip carousel
  initCarousel(filmScene);

  // Start mouse tracking (distortion + chromatic aberration)
  initMouseTracker(filmScene);
});
