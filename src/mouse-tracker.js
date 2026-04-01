/**
 * Mouse tracking - drives zoom + liquid distortion + chromatic aberration.
 * Smoothly lerps mouse position and velocity into shader uniforms.
 */

export function initMouseTracker(filmScene) {
  const raw = { x: 0.5, y: 0.5 };        // raw mouse (instant)
  const smooth = { x: 0.5, y: 0.5 };      // smoothed position
  const vel = { x: 0, y: 0 };             // smoothed velocity
  const prevRaw = { x: 0.5, y: 0.5 };

  // Distortion strength (lerped toward target)
  let currentStrength = 0;
  let targetStrength = 0;
  let currentZoom = 0;
  let targetZoom = 0;
  let isMoving = false;
  let idleTimer = null;

  function onMouseMove(e) {
    raw.x = e.clientX / window.innerWidth;
    raw.y = 1.0 - e.clientY / window.innerHeight; // flip Y for shader

    isMoving = true;
    targetStrength = 1.0;
    targetZoom = 1.0;

    // Reset idle timer
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      isMoving = false;
      targetStrength = 0;
      targetZoom = 0;
    }, 150);
  }

  function update() {
    // Smooth position (eased follow)
    const posLerp = 0.08;
    smooth.x += (raw.x - smooth.x) * posLerp;
    smooth.y += (raw.y - smooth.y) * posLerp;

    // Velocity (raw delta, then smoothed)
    const rawVelX = (raw.x - prevRaw.x) * 15;
    const rawVelY = (raw.y - prevRaw.y) * 15;
    prevRaw.x = raw.x;
    prevRaw.y = raw.y;

    const velLerp = 0.12;
    vel.x += (rawVelX - vel.x) * velLerp;
    vel.y += (rawVelY - vel.y) * velLerp;

    // Velocity magnitude drives dynamic strength boost
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    const dynamicBoost = Math.min(speed * 2.0, 1.5);

    // Lerp strength
    const strengthLerp = isMoving ? 0.08 : 0.03; // faster ramp up, slower decay
    currentStrength += (targetStrength + dynamicBoost - currentStrength) * strengthLerp;
    currentZoom += (targetZoom - currentZoom) * (isMoving ? 0.06 : 0.025);

    // Apply to distortion pass
    if (filmScene && filmScene.distortionPass) {
      const du = filmScene.distortionPass.uniforms;
      du.uMouse.value.set(smooth.x, smooth.y);
      du.uMouseVelocity.value.set(vel.x, vel.y);
      du.uStrength.value = currentStrength;
      du.uZoomStrength.value = currentZoom;
    }

    // Also affect chromatic aberration based on mouse
    if (filmScene && filmScene.filmPass) {
      const fu = filmScene.filmPass.uniforms;
      const distFromCenter = Math.sqrt(
        (smooth.x - 0.5) ** 2 + (smooth.y - 0.5) ** 2
      );
      const baseCa = filmScene.currentEffects.chromatic;
      const mouseBoost = distFromCenter * 0.004 + speed * 0.01;
      fu.chromaticStrength.value = baseCa + mouseBoost * currentStrength;
    }

    requestAnimationFrame(update);
  }

  window.addEventListener('mousemove', onMouseMove, { passive: true });
  update();

  return {
    destroy() {
      window.removeEventListener('mousemove', onMouseMove);
      clearTimeout(idleTimer);
    },
  };
}
