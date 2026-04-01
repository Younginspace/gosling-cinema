// Film grain + CRT post-processing fragment shader
// Used as a custom ShaderPass in Three.js EffectComposer

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

// Pseudo-random noise
float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;

  // 1. Chromatic Aberration
  float caOffset = chromaticStrength;
  vec2 caDir = (uv - 0.5) * caOffset;
  float r = texture2D(tDiffuse, uv + caDir).r;
  float g = texture2D(tDiffuse, uv).g;
  float b = texture2D(tDiffuse, uv - caDir).b;
  vec3 color = vec3(r, g, b);

  // 2. Scanlines
  float scanline = sin(uv.y * 800.0) * 0.5 + 0.5;
  scanline = pow(scanline, 1.5) * scanlineIntensity;
  color -= scanline * 0.12;

  // 3. Vignette
  float dist = distance(uv, vec2(0.5));
  float vignette = smoothstep(0.4, 1.0, dist) * vignetteIntensity;
  color *= 1.0 - vignette;

  // 4. Film Grain
  float noise = rand(uv * time) * 2.0 - 1.0;
  color += noise * noiseIntensity;

  // 5. Sepia
  vec3 sepiaColor = vec3(
    dot(color, vec3(0.393, 0.769, 0.189)),
    dot(color, vec3(0.349, 0.686, 0.168)),
    dot(color, vec3(0.272, 0.534, 0.131))
  );
  color = mix(color, sepiaColor, sepiaIntensity);

  // 6. Color Tint
  color = mix(color, color * tintColor, tintStrength);

  // 7. Slight brightness boost to compensate darkening
  color *= 1.05;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
