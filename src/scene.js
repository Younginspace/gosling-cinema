import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Mouse distortion shader (zoom + liquid bulge)
const DistortionShader = {
  uniforms: {
    tDiffuse: { value: null },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },       // smoothed mouse pos (0-1)
    uMouseVelocity: { value: new THREE.Vector2(0, 0) },    // mouse velocity
    uStrength: { value: 0.0 },                              // overall distortion strength (lerped)
    uZoomStrength: { value: 0.0 },                           // zoom toward mouse
    uBulgeRadius: { value: 0.35 },                           // radius of bulge effect
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

      // Aspect-corrected coordinates for distance calculation
      vec2 uvAspect = vec2(uv.x * aspect, uv.y);
      vec2 mouseAspect = vec2(uMouse.x * aspect, uMouse.y);

      // Distance from mouse (aspect corrected)
      float dist = distance(uvAspect, mouseAspect);

      // --- Zoom effect: pull UVs toward mouse position ---
      vec2 toMouse = uMouse - uv;
      uv += toMouse * uZoomStrength * 0.06;

      // --- Bulge / liquid distortion ---
      // Smooth falloff within radius
      float bulge = 1.0 - smoothstep(0.0, uBulgeRadius, dist);
      bulge = bulge * bulge; // quadratic falloff for more natural look

      // Radial displacement (pushes pixels outward from mouse = magnify)
      vec2 dir = normalize(uvAspect - mouseAspect + 0.0001);
      // Correct direction back to non-aspect space
      dir = vec2(dir.x / aspect, dir.y);

      // Velocity-driven directional distortion (liquid drag)
      vec2 velOffset = uMouseVelocity * bulge * 0.4;

      // Combine: radial bulge + velocity drag
      vec2 displacement = dir * bulge * uStrength * 0.08 + velOffset * uStrength;

      uv += displacement;

      // Clamp to prevent sampling outside texture
      uv = clamp(uv, 0.0, 1.0);

      gl_FragColor = texture2D(tDiffuse, uv);
    }
  `,
};

// Custom Film shader
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

      // Chromatic Aberration
      float caOffset = chromaticStrength;
      vec2 caDir = (uv - 0.5) * caOffset;
      float r = texture2D(tDiffuse, uv + caDir).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - caDir).b;
      vec3 color = vec3(r, g, b);

      // Scanlines
      float scanline = sin(uv.y * 800.0) * 0.5 + 0.5;
      scanline = pow(scanline, 1.5) * scanlineIntensity;
      color -= scanline * 0.12;

      // Vignette
      float dist = distance(uv, vec2(0.5));
      float vignette = smoothstep(0.4, 1.0, dist) * vignetteIntensity;
      color *= 1.0 - vignette;

      // Film Grain
      float noise = rand(uv * time) * 2.0 - 1.0;
      color += noise * noiseIntensity;

      // Sepia
      vec3 sepiaColor = vec3(
        dot(color, vec3(0.393, 0.769, 0.189)),
        dot(color, vec3(0.349, 0.686, 0.168)),
        dot(color, vec3(0.272, 0.534, 0.131))
      );
      color = mix(color, sepiaColor, sepiaIntensity);

      // Color Tint
      color = mix(color, color * tintColor, tintStrength);

      color *= 1.05;
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
};

export class FilmScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.currentEffects = {
      bloom: 1.0,
      chromatic: 0.003,
      sepia: 0.0,
      noise: 0.1,
      vignette: 0.6,
      scanline: 0.1,
      tint: [1, 1, 1],
      bgColor: [0, 0, 0],
    };
    this.targetEffects = { ...this.currentEffects, tint: [1, 1, 1], bgColor: [0, 0, 0] };

    this.init();
  }

  init() {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.z = 5;

    // Simple ambient geometry to give the post-processing something to work on
    this.createBackgroundMesh();

    // Post-processing
    this.setupPostProcessing();

    // Resize
    window.addEventListener('resize', () => this.onResize());

    // Start render loop
    this.animate();
  }

  createBackgroundMesh() {
    // Fullscreen quad with a gradient material that responds to tint
    const geo = new THREE.PlaneGeometry(12, 8);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor1: { value: new THREE.Color(0x000000) },
        uColor2: { value: new THREE.Color(0x111111) },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform float uTime;
        varying vec2 vUv;

        float rand(vec2 co) {
          return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          // Radial gradient
          float dist = distance(vUv, vec2(0.5));
          vec3 color = mix(uColor2, uColor1, smoothstep(0.0, 0.8, dist));

          // Subtle animated noise texture
          float n = rand(vUv * 100.0 + uTime * 0.5) * 0.03;
          color += n;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.bgMesh = new THREE.Mesh(geo, mat);
    this.bgMesh.position.z = -2;
    this.scene.add(this.bgMesh);
  }

  setupPostProcessing() {
    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);

    this.composer = new EffectComposer(this.renderer);

    // Base render
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // Bloom
    this.bloomPass = new UnrealBloomPass(size, 1.0, 0.4, 0.85);
    this.composer.addPass(this.bloomPass);

    // Mouse distortion pass (zoom + liquid)
    this.distortionPass = new ShaderPass(DistortionShader);
    this.distortionPass.uniforms.uResolution.value.set(size.x, size.y);
    this.composer.addPass(this.distortionPass);

    // Custom film pass
    this.filmPass = new ShaderPass(FilmShader);
    this.composer.addPass(this.filmPass);

    // Output
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  setTargetEffects(effects, tint, bgColor) {
    this.targetEffects = {
      bloom: effects.bloom,
      chromatic: effects.chromatic,
      sepia: effects.sepia,
      noise: effects.noise,
      vignette: effects.vignette,
      scanline: effects.scanline,
      tint: [...tint],
      bgColor: [...bgColor],
    };
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();
    const lerpSpeed = 3.0 * dt;

    // Lerp current effects toward target
    const lerp = (a, b, t) => a + (b - a) * Math.min(t, 1);
    this.currentEffects.bloom = lerp(this.currentEffects.bloom, this.targetEffects.bloom, lerpSpeed);
    this.currentEffects.chromatic = lerp(this.currentEffects.chromatic, this.targetEffects.chromatic, lerpSpeed);
    this.currentEffects.sepia = lerp(this.currentEffects.sepia, this.targetEffects.sepia, lerpSpeed);
    this.currentEffects.noise = lerp(this.currentEffects.noise, this.targetEffects.noise, lerpSpeed);
    this.currentEffects.vignette = lerp(this.currentEffects.vignette, this.targetEffects.vignette, lerpSpeed);
    this.currentEffects.scanline = lerp(this.currentEffects.scanline, this.targetEffects.scanline, lerpSpeed);

    for (let i = 0; i < 3; i++) {
      this.currentEffects.tint[i] = lerp(this.currentEffects.tint[i], this.targetEffects.tint[i], lerpSpeed);
      this.currentEffects.bgColor[i] = lerp(this.currentEffects.bgColor[i], this.targetEffects.bgColor[i], lerpSpeed);
    }

    // Update bloom
    this.bloomPass.strength = this.currentEffects.bloom;

    // Update film shader uniforms
    const fu = this.filmPass.uniforms;
    fu.time.value = elapsed;
    fu.noiseIntensity.value = this.currentEffects.noise;
    fu.scanlineIntensity.value = this.currentEffects.scanline;
    fu.vignetteIntensity.value = this.currentEffects.vignette;
    fu.chromaticStrength.value = this.currentEffects.chromatic;
    fu.sepiaIntensity.value = this.currentEffects.sepia;
    fu.tintColor.value.set(...this.currentEffects.tint);
    fu.tintStrength.value = 0.4;

    // Update background colors
    const [r, g, b] = this.currentEffects.bgColor;
    this.bgMesh.material.uniforms.uColor1.value.setRGB(r * 0.15, g * 0.15, b * 0.15);
    this.bgMesh.material.uniforms.uColor2.value.setRGB(r * 0.05, g * 0.05, b * 0.05);
    this.bgMesh.material.uniforms.uTime.value = elapsed;

    // Render
    this.composer.render();
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.distortionPass.uniforms.uResolution.value.set(w, h);
  }
}
