import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ───────── Shaders ───────── */

const DistortionShader = {
  uniforms: {
    tDiffuse: { value: null },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uMouseVelocity: { value: new THREE.Vector2(0, 0) },
    uStrength: { value: 0.0 },
    uZoomStrength: { value: 0.0 },
    uBulgeRadius: { value: 0.35 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uMouse;
    uniform vec2 uMouseVelocity;
    uniform float uStrength;
    uniform float uZoomStrength;
    uniform float uBulgeRadius;
    uniform vec2 uResolution;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      float aspect = uResolution.x / uResolution.y;
      vec2 uvAspect = vec2(uv.x * aspect, uv.y);
      vec2 mouseAspect = vec2(uMouse.x * aspect, uMouse.y);
      float dist = distance(uvAspect, mouseAspect);

      vec2 toMouse = uMouse - uv;
      uv += toMouse * uZoomStrength * 0.06;

      float bulge = 1.0 - smoothstep(0.0, uBulgeRadius, dist);
      bulge = bulge * bulge;

      vec2 dir = normalize(uvAspect - mouseAspect + 0.0001);
      dir = vec2(dir.x / aspect, dir.y);

      vec2 velOffset = uMouseVelocity * bulge * 0.4;
      vec2 displacement = dir * bulge * uStrength * 0.08 + velOffset * uStrength;
      uv += displacement;
      uv = clamp(uv, 0.0, 1.0);

      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
};

const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    noiseIntensity: { value: 0.1 },
    scanlineIntensity: { value: 0.1 },
    vignetteIntensity: { value: 0.6 },
    chromaticStrength: { value: 0.003 },
    sepiaIntensity: { value: 0.0 },
    tintColor: { value: new THREE.Vector3(1, 1, 1) },
    tintStrength: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float noiseIntensity;
    uniform float scanlineIntensity;
    uniform float vignetteIntensity;
    uniform float chromaticStrength;
    uniform float sepiaIntensity;
    uniform vec3 tintColor;
    uniform float tintStrength;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      float caOffset = chromaticStrength;
      vec2 caDir = (uv - 0.5) * caOffset;
      float r = texture2D(tDiffuse, uv + caDir).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - caDir).b;
      vec3 color = vec3(r, g, b);

      float scanline = sin(uv.y * 800.0) * 0.5 + 0.5;
      scanline = pow(scanline, 1.5) * scanlineIntensity;
      color -= scanline * 0.12;

      float dist = distance(uv, vec2(0.5));
      float vignette = smoothstep(0.4, 1.0, dist) * vignetteIntensity;
      color *= 1.0 - vignette;

      float noise = rand(uv * time) * 2.0 - 1.0;
      color += noise * noiseIntensity;

      vec3 sepiaColor = vec3(
        dot(color, vec3(0.393, 0.769, 0.189)),
        dot(color, vec3(0.349, 0.686, 0.168)),
        dot(color, vec3(0.272, 0.534, 0.131))
      );
      color = mix(color, sepiaColor, sepiaIntensity);
      color = mix(color, color * tintColor, tintStrength);
      color *= 1.05;
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};

/* ───────── Scene ───────── */

export class FilmScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();

    // Hero phase: minimal post-processing so 3D model is clearly visible
    this.currentEffects = {
      bloom: 0.6, chromatic: 0.001, sepia: 0.0,
      noise: 0.02, vignette: 0.15, scanline: 0.02,
      tint: [1, 1, 1], bgColor: [0, 0, 0],
    };
    this.targetEffects = { ...this.currentEffects, tint: [1, 1, 1], bgColor: [0, 0, 0] };

    // Model references
    this.model = null;
    this.screenMesh = null;
    this.glassMesh = null;
    this.modelBaseY = 0;
    this.modelBaseScale = 1;
    this.modelMeshes = []; // cached for fade

    // CRT canvas texture
    this.crtCanvas = document.createElement('canvas');
    this.crtCanvas.width = 512;
    this.crtCanvas.height = 384;
    this.crtCtx = this.crtCanvas.getContext('2d');
    this.crtTexture = new THREE.CanvasTexture(this.crtCanvas);
    this.crtTexture.minFilter = THREE.LinearFilter;
    this.crtTexture.magFilter = THREE.LinearFilter;

    // Camera state
    this.camClosePos = new THREE.Vector3(0, 0, 3);
    this.camCloseTarget = new THREE.Vector3(0, 0, 0);
    this.camHeroPos = new THREE.Vector3(-1.8, 0.4, 5.5);
    this.camHeroTarget = new THREE.Vector3(0.3, -0.1, 0);
    this.camZoomPos = new THREE.Vector3(0, 0, 1);   // zoom into screen
    this.camZoomTarget = new THREE.Vector3(0, 0, 0);
    this.revealProgress = 0;        // 0 = hidden, 1 = hero view fully visible
    this.isRevealing = false;
    this._revealStart = 0;
    this._revealDuration = 1.6;     // fade-in duration
    this._revealCallback = null;
    this._modelReady = false;       // model hidden until reveal

    // Scroll
    this.scrollProgress = 0;        // 0 = hero, 1 = carousel

    this.ready = this._init();
  }

  async _init() {
    this._setupRenderer();
    this._setupScene();
    this._createBackground();
    await this._loadModel();
    this._setupLights();
    this._setupParticles();
    this._setupPostProcessing();
    window.addEventListener('resize', () => this._onResize());
    this._animate();
  }

  /* ─── Renderer ─── */

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: false, alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 2.0;
  }

  /* ─── Scene & Camera ─── */

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.04);

    this.camera = new THREE.PerspectiveCamera(
      50, window.innerWidth / window.innerHeight, 0.1, 100,
    );
    this.camera.position.copy(this.camClosePos);
    this.camera.lookAt(this.camCloseTarget);
  }

  /* ─── Background ─── */

  _createBackground() {
    const geo = new THREE.PlaneGeometry(24, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor1: { value: new THREE.Color(0x000000) },
        uColor2: { value: new THREE.Color(0x111111) },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        uniform vec3 uColor1; uniform vec3 uColor2; uniform float uTime;
        varying vec2 vUv;
        float rand(vec2 co){ return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453); }
        void main(){
          float d = distance(vUv, vec2(0.5));
          vec3 c = mix(uColor2, uColor1, smoothstep(0.0,0.8,d));
          c += rand(vUv*100.0+uTime*0.5)*0.03;
          gl_FragColor = vec4(c,1.0);
        }
      `,
    });
    this.bgMesh = new THREE.Mesh(geo, mat);
    this.bgMesh.position.z = -8;
    this.scene.add(this.bgMesh);
  }

  /* ─── Model loading ─── */

  _loadModel() {
    return new Promise((resolve) => {
      new GLTFLoader().load(
        '/asset/commodore_pet_2001_mini.glb',
        (gltf) => {
          this.model = gltf.scene;

          // Find screen and glass meshes (French naming from Blender)
          this.model.traverse((child) => {
            if (!child.isMesh) return;
            if (child.name.includes('Plan_7')) this.screenMesh = child;
            if (child.name.includes('vitre')) this.glassMesh = child;
          });

          // Scale model bigger (≈ 8 units) so it dominates the frame
          const box = new THREE.Box3().setFromObject(this.model);
          const size = box.getSize(new THREE.Vector3());
          const scale = 10.0 / Math.max(size.x, size.y, size.z);
          this.model.scale.setScalar(scale);
          this.modelBaseScale = scale;

          // Center model, then offset right and down (shader.se style)
          box.setFromObject(this.model);
          const center = box.getCenter(new THREE.Vector3());
          this.model.position.sub(center);
          this.model.position.x += 3.0;  // push further right
          this.model.position.y -= 1.8;  // push down
          this.modelBaseY = this.model.position.y;

          // Cache meshes for scroll fade
          this.model.traverse((child) => {
            if (child.isMesh) this.modelMeshes.push(child);
          });

          // Apply CRT texture to screen mesh
          if (this.screenMesh) {
            this.screenMesh.material = new THREE.MeshStandardMaterial({
              map: this.crtTexture,
              emissive: new THREE.Color(0xffffff),
              emissiveMap: this.crtTexture,
              emissiveIntensity: 2.0,
            });

            // Compute camera positions from screen geometry
            const screenBox = new THREE.Box3().setFromObject(this.screenMesh);
            const screenCenter = screenBox.getCenter(new THREE.Vector3());
            const screenSize = screenBox.getSize(new THREE.Vector3());

            // Determine screen facing direction (local +Z transformed)
            const normal = new THREE.Vector3(0, 0, 1);
            const quat = new THREE.Quaternion();
            this.screenMesh.getWorldQuaternion(quat);
            normal.applyQuaternion(quat);

            // Close camera: screen fills viewport
            const fovRad = this.camera.fov * Math.PI / 180;
            const aspect = this.camera.aspect;
            const screenH = Math.max(screenSize.x, screenSize.y);
            const dist = (screenH / 2) / Math.tan(fovRad / 2) * 1.15;

            this.camClosePos.copy(screenCenter).addScaledVector(normal, dist);
            this.camCloseTarget.copy(screenCenter);

            // Hero camera: offset left so text is left, computer fills right side
            const right = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
            this.camHeroPos.copy(screenCenter)
              .addScaledVector(normal, dist * 2.2)
              .addScaledVector(right, -2.0)
              .add(new THREE.Vector3(0, 1.4, 0));
            this.camHeroTarget.copy(screenCenter).add(new THREE.Vector3(0.3, -0.4, 0));

            // Zoom target: camera flies INTO the screen (past it)
            this.camZoomPos.copy(screenCenter).addScaledVector(normal, dist * 0.15);
            this.camZoomTarget.copy(screenCenter);
          }

          // Make glass transparent
          if (this.glassMesh) {
            this.glassMesh.material = new THREE.MeshPhysicalMaterial({
              transparent: true,
              opacity: 0.08,
              roughness: 0.1,
              color: 0x8888aa,
            });
          }

          // Camera starts at hero position (no zoom-out reveal)
          this.camera.position.copy(this.camHeroPos);
          this.camera.lookAt(this.camHeroTarget);

          // Hide model until reveal
          this.model.visible = false;
          this._modelReady = true;

          this.scene.add(this.model);
          resolve();
        },
        undefined,
        (err) => { console.error('Model load failed:', err); resolve(); },
      );
    });
  }

  /* ─── Lights ─── */

  _setupLights() {
    this.scene.add(new THREE.AmbientLight(0x8080a0, 1.5));

    // Strong front key light
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(2, 3, 6);
    this.scene.add(key);

    // Fill from left (blue tint for cinematic feel)
    const fill = new THREE.PointLight(0x8888ff, 3, 25);
    fill.position.set(-5, 2, 4);
    this.scene.add(fill);

    // Rim light from behind
    const rim = new THREE.PointLight(0xffffff, 4, 25);
    rim.position.set(0, 3, -5);
    this.scene.add(rim);

    // Top-down soft light
    const top = new THREE.PointLight(0xffffff, 2, 20);
    top.position.set(0, 6, 2);
    this.scene.add(top);
  }

  /* ─── Particles (floating dust) ─── */

  _setupParticles() {
    const count = 400;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 25;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 18;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particles = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.018, transparent: true, opacity: 0.2, fog: true,
    }));
    this.scene.add(this.particles);
  }

  /* ─── Post-processing (unchanged) ─── */

  _setupPostProcessing() {
    const sz = new THREE.Vector2(window.innerWidth, window.innerHeight);
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloomPass = new UnrealBloomPass(sz, 1.0, 0.4, 0.85);
    this.composer.addPass(this.bloomPass);
    this.distortionPass = new ShaderPass(DistortionShader);
    this.distortionPass.uniforms.uResolution.value.set(sz.x, sz.y);
    this.composer.addPass(this.distortionPass);
    this.filmPass = new ShaderPass(FilmShader);
    this.composer.addPass(this.filmPass);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  /* ─── CRT canvas rendering ─── */

  renderCRTBoot(messages, progress, status) {
    const ctx = this.crtCtx;
    const w = this.crtCanvas.width;
    const h = this.crtCanvas.height;

    // Background
    ctx.fillStyle = '#1a0a6e';
    ctx.fillRect(0, 0, w, h);

    // Vignette
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const fs = Math.floor(h / 22);
    const pad = Math.floor(w * 0.08);
    let y = pad;

    // Logo
    ctx.font = `bold ${fs * 2.5}px monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(200,200,255,0.4)';
    ctx.shadowBlur = 12;
    ctx.fillText('GOSLING_', pad, y);
    ctx.shadowBlur = 0;
    y += fs * 3;

    // Sub
    ctx.font = `${Math.floor(fs * 0.75)}px monospace`;
    ctx.fillStyle = '#a0a0c0';
    ctx.fillText('Gosling Cinema System, Version 1.0', pad, y);
    y += Math.floor(fs * 1.1);
    ctx.fillText('Copyright (c) Gosling Filmography 2026.', pad, y);
    y += Math.floor(fs * 1.8);

    // Messages
    ctx.font = `${Math.floor(fs * 0.65)}px monospace`;
    ctx.fillStyle = '#8888aa';
    for (const msg of messages) {
      ctx.fillText(msg, pad, y);
      y += Math.floor(fs * 1.2);
    }

    // Progress bar
    const barY = h - pad - fs * 3;
    const barW = w - pad * 2;
    const barH = Math.floor(fs * 1.1);
    ctx.strokeStyle = '#c0c0c0';
    ctx.lineWidth = 2;
    ctx.strokeRect(pad, barY, barW, barH);
    const fillW = barW * progress;
    ctx.fillStyle = '#c0c0c0';
    for (let x = pad + 2; x < pad + fillW - 2; x += 13) {
      ctx.fillRect(x, barY + 2, Math.min(10, pad + fillW - 2 - x), barH - 4);
    }

    // Status
    ctx.font = `${Math.floor(fs * 0.6)}px monospace`;
    ctx.fillStyle = '#8888aa';
    ctx.fillText(status, pad, barY + barH + Math.floor(fs * 0.7));

    // Scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    for (let sy = 0; sy < h; sy += 3) ctx.fillRect(0, sy, w, 1);

    this.crtTexture.needsUpdate = true;
  }

  /** Idle CRT screen after boot (flickering logo) */
  _renderCRTIdle(time) {
    const ctx = this.crtCtx;
    const w = this.crtCanvas.width;
    const h = this.crtCanvas.height;

    ctx.fillStyle = '#0a0820';
    ctx.fillRect(0, 0, w, h);

    const alpha = 0.25 + Math.sin(time * 2) * 0.08;
    ctx.font = `bold ${Math.floor(h / 7)}px monospace`;
    ctx.fillStyle = `rgba(160,160,200,${alpha})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(100,100,255,0.25)';
    ctx.shadowBlur = 15;
    ctx.fillText('GOSLING', w / 2, h / 2);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';

    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    for (let sy = 0; sy < h; sy += 3) ctx.fillRect(0, sy, w, 1);

    this.crtTexture.needsUpdate = true;
  }

  /* ─── Camera reveal (fade-in at hero position) ─── */

  startReveal(onComplete) {
    if (!this._modelReady) {
      // Model not loaded yet, wait
      const check = () => {
        if (this._modelReady) this.startReveal(onComplete);
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
      return;
    }
    this.model.visible = true;
    // Start all meshes transparent
    for (const mesh of this.modelMeshes) {
      mesh.material.transparent = true;
      mesh.material.opacity = 0;
    }
    this.isRevealing = true;
    this._revealStart = this.clock.getElapsedTime();
    this._revealCallback = onComplete;
  }

  /* ─── Scroll progress ─── */

  setScrollProgress(p) {
    this.scrollProgress = Math.max(0, Math.min(1, p));
  }

  /* ─── Effects ─── */

  setTargetEffects(effects, tint, bgColor) {
    this.targetEffects = {
      bloom: effects.bloom, chromatic: effects.chromatic,
      sepia: effects.sepia, noise: effects.noise,
      vignette: effects.vignette, scanline: effects.scanline,
      tint: [...tint], bgColor: [...bgColor],
    };
  }

  /* ─── Animation loop ─── */

  _animate() {
    requestAnimationFrame(() => this._animate());

    const dt = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();
    const ls = 3.0 * dt;
    const lerp = (a, b, t) => a + (b - a) * Math.min(t, 1);

    // Lerp effects
    for (const k of ['bloom', 'chromatic', 'sepia', 'noise', 'vignette', 'scanline']) {
      this.currentEffects[k] = lerp(this.currentEffects[k], this.targetEffects[k], ls);
    }
    for (let i = 0; i < 3; i++) {
      this.currentEffects.tint[i] = lerp(this.currentEffects.tint[i], this.targetEffects.tint[i], ls);
      this.currentEffects.bgColor[i] = lerp(this.currentEffects.bgColor[i], this.targetEffects.bgColor[i], ls);
    }

    // Apply to passes
    this.bloomPass.strength = this.currentEffects.bloom;
    const fu = this.filmPass.uniforms;
    fu.time.value = elapsed;
    fu.noiseIntensity.value = this.currentEffects.noise;
    fu.scanlineIntensity.value = this.currentEffects.scanline;
    fu.vignetteIntensity.value = this.currentEffects.vignette;
    fu.chromaticStrength.value = this.currentEffects.chromatic;
    fu.sepiaIntensity.value = this.currentEffects.sepia;
    fu.tintColor.value.set(...this.currentEffects.tint);
    fu.tintStrength.value = 0.4;

    // Background
    const [r, g, b] = this.currentEffects.bgColor;
    this.bgMesh.material.uniforms.uColor1.value.setRGB(r * 0.15, g * 0.15, b * 0.15);
    this.bgMesh.material.uniforms.uColor2.value.setRGB(r * 0.05, g * 0.05, b * 0.05);
    this.bgMesh.material.uniforms.uTime.value = elapsed;

    // Particles drift
    if (this.particles) {
      this.particles.rotation.y = elapsed * 0.015;
      this.particles.rotation.x = Math.sin(elapsed * 0.008) * 0.04;
    }

    // ── Camera ──
    const lerpV = (a, b, t) => new THREE.Vector3().lerpVectors(a, b, t);

    if (this.isRevealing) {
      const t = Math.min((elapsed - this._revealStart) / this._revealDuration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      this.revealProgress = ease;

      // Camera stays at hero position; model fades in
      this.camera.position.copy(this.camHeroPos);
      this.camera.lookAt(this.camHeroTarget);
      for (const mesh of this.modelMeshes) {
        mesh.material.opacity = ease;
      }

      if (t >= 1) {
        this.isRevealing = false;
        for (const mesh of this.modelMeshes) {
          mesh.material.transparent = false;
          mesh.material.opacity = 1;
        }
        if (this._revealCallback) this._revealCallback();
      }
    } else if (this.revealProgress >= 1 && this.model) {
      // Scroll-driven: camera zooms INTO the computer screen
      const sp = this.scrollProgress;
      this.distortionPass.uniforms.uZoomStrength.value = 0;

      // Two-phase zoom: slow approach (0-0.4), then accelerate into screen (0.4-1.0)
      let zoomEase;
      if (sp <= 0.4) {
        // Phase 1: gentle ease — camera drifts toward screen center
        const t = sp / 0.4;
        zoomEase = t * t * 0.25; // max 0.25 at sp=0.4
      } else {
        // Phase 2: accelerate into the screen
        const t = (sp - 0.4) / 0.6;
        const accel = t * t * t; // cubic ease-in
        zoomEase = 0.25 + accel * 0.75; // 0.25 → 1.0
      }

      // Camera flies from hero position toward/through the screen
      this.camera.position.copy(lerpV(this.camHeroPos, this.camZoomPos, zoomEase));
      this.camera.lookAt(lerpV(this.camHeroTarget, this.camZoomTarget, zoomEase));

      // Gentle scale-up (less aggressive to avoid mesh tearing)
      const scaleUp = 1 + zoomEase * 0.6;
      this.model.scale.setScalar(this.modelBaseScale * scaleUp);

      // Mild zoom distortion — only in phase 2, and gentler
      if (sp > 0.4) {
        const distT = (sp - 0.4) / 0.6;
        this.distortionPass.uniforms.uZoomStrength.value = distT * distT * 0.8;
      }

      // Fade model: start fading early at 0.35, fully gone by 0.75
      if (sp > 0.35) {
        const fade = Math.max(0, 1 - (sp - 0.35) / 0.4);
        for (const mesh of this.modelMeshes) {
          mesh.material.transparent = true;
          mesh.material.opacity = fade;
        }
      } else {
        for (const mesh of this.modelMeshes) {
          mesh.material.opacity = 1;
        }
      }
    }

    // Update CRT idle when in hero phase
    if (this.revealProgress >= 1 && !this.isRevealing) {
      this._renderCRTIdle(elapsed);
    }

    this.composer.render();
  }

  /* ─── Resize ─── */

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.distortionPass.uniforms.uResolution.value.set(w, h);
  }
}
