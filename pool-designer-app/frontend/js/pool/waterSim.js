import * as THREE from 'https://esm.sh/three@0.158.0';
import { GPUComputationRenderer } from 'https://esm.sh/three@0.158.0/examples/jsm/misc/GPUComputationRenderer.js';

export class WaterSim {
  constructor(renderer, size = (window.__POOL_PERF?.waterSimSize ?? 256)) {
    this.renderer = renderer;
    this.size = size;

    this.gpu = new GPUComputationRenderer(size, size, renderer);

    // Float type for GPGPU textures
    const type = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.FloatType;
    this.gpu.setDataType(type);

    // state texture: R = height, G = velocity
    const initTex = this.gpu.createTexture();
    this._clear(initTex);

    this.varState = this.gpu.addVariable('texState', this._frag(), initTex);
    this.gpu.setVariableDependencies(this.varState, [this.varState]);

    const u = this.varState.material.uniforms;
    u.uDt = { value: 1 / 60 };
    u.uTime = { value: 0 };
    u.uViscosity = { value: 0.9945 };  // long-lived, glassy pool ripples
    u.uWaveSpeed = { value: 0.52 };    // reference-like travelling wave speed
    u.uDrive = { value: 0.0018 };      // subtle multi-directional ambient forcing

    // splash/impulse (one-shot)
    u.uSplashPos = { value: new THREE.Vector2(-10, -10) };
    u.uSplashRadius = { value: 0.03 };
    u.uSplashStrength = { value: 0.0 };

    const err = this.gpu.init();
    if (err) console.error('WaterSim init error:', err);
  }

  // baseline at 0.5 because water shader expects (h - 0.5)
  _clear(tex) {
    const d = tex.image.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i + 0] = 0.5; // height baseline
      d[i + 1] = 0.0; // velocity
      d[i + 2] = 0.0;
      d[i + 3] = 1.0;
    }
  }

  update(dt) {
    const u = this.varState.material.uniforms;

    // Never pass a large or invalid frame delta into the feedback simulation.
    // A fixed-size substep makes the result independent of temporary FPS drops.
    const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 1 / 30)) : 1 / 60;
    this._accumulator = Math.min((this._accumulator || 0) + safeDt, 1 / 15);

    const fixedStep = 1 / 60;
    let steps = 0;
    while (this._accumulator >= fixedStep && steps < 4) {
      u.uDt.value = fixedStep;
      u.uTime.value += fixedStep;
      this.gpu.compute();
      this._accumulator -= fixedStep;
      steps += 1;
    }

    // Ensure the simulation still advances on high-refresh displays.
    if (steps === 0 && safeDt > 0) {
      u.uDt.value = safeDt;
      u.uTime.value += safeDt;
      this.gpu.compute();
    }

    // consume splash after the simulation has seen it once
    if (u.uSplashStrength.value !== 0.0) {
      u.uSplashStrength.value = 0.0;
      u.uSplashPos.value.set(-10, -10);
    }
  }

  get texture() {
    return this.gpu.getCurrentRenderTarget(this.varState).texture;
  }

  /**
   * uv in [0..1] sim space.
   */
  splash(uv, strength = 0.085, radius = 0.055) {
    const u = this.varState.material.uniforms;
    u.uSplashPos.value.copy(uv);
    u.uSplashStrength.value = strength;
    u.uSplashRadius.value = radius;
  }

  setParams({ viscosity, waveSpeed, drive } = {}) {
    const u = this.varState.material.uniforms;
    if (typeof viscosity === 'number') u.uViscosity.value = viscosity;
    if (typeof waveSpeed === 'number') u.uWaveSpeed.value = waveSpeed;
    if (typeof drive === 'number') u.uDrive.value = drive;
  }

  _frag() {
    return `
      uniform float uDt;
      uniform float uTime;
      uniform float uViscosity;
      uniform float uWaveSpeed;
      uniform float uDrive;

      uniform vec2  uSplashPos;
      uniform float uSplashRadius;
      uniform float uSplashStrength;

      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;

        vec4 c = texture2D(texState, uv);
        float h = c.r;  // height (0..1, baseline ~0.5)
        float v = c.g;  // velocity

        // Isotropic 9-point Laplacian. The previous four-neighbour kernel made
        // circular impacts resolve into a visible square grid; diagonal samples
        // keep the travelling rings round at the Balanced 256² simulation size.
        vec2 texel = 1.0 / resolution.xy;
        float hx1 = texture2D(texState, uv + vec2(texel.x, 0.0)).r;
        float hx2 = texture2D(texState, uv - vec2(texel.x, 0.0)).r;
        float hy1 = texture2D(texState, uv + vec2(0.0, texel.y)).r;
        float hy2 = texture2D(texState, uv - vec2(0.0, texel.y)).r;
        float hd1 = texture2D(texState, uv + texel).r;
        float hd2 = texture2D(texState, uv - texel).r;
        float hd3 = texture2D(texState, uv + vec2(texel.x, -texel.y)).r;
        float hd4 = texture2D(texState, uv + vec2(-texel.x, texel.y)).r;

        float axial = hx1 + hx2 + hy1 + hy2;
        float diagonal = hd1 + hd2 + hd3 + hd4;
        float lap = (axial * 0.50 + diagonal * 0.25 - 3.0 * h);

        // shallow-water-ish update
        v += lap * uWaveSpeed;
        v *= uViscosity;
        h += v * uDt;

        // Ambient motion is a bounded force, not a value accumulated directly
        // into height every frame. Scaling by dt prevents runaway/pixelated state.
        float ambientForce = (
          sin(uTime * 0.72 + uv.x * 8.0 + uv.y * 5.0) * 0.50 +
          sin(uTime * 0.51 - uv.x * 5.5 + uv.y * 9.0) * 0.30 +
          sin(uTime * 0.37 + uv.x * 13.0 - uv.y * 3.0) * 0.20
        ) * uDrive;
        v += ambientForce * uDt;

        // Absorb energy gently at pool boundaries so waves reflect without the
        // hard ringing that a clamped feedback texture otherwise creates.
        float edgeDistance = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
        float edgeDamping = mix(0.965, 1.0, smoothstep(0.0, 0.055, edgeDistance));
        v *= edgeDamping;

        // Droplet impact profile:
        // 1) a sharp downward centre dimple,
        // 2) a raised crown ring around the impact,
        // 3) a weaker outer ring that becomes the travelling ripple.
        // Unlike a single Gaussian mound, this starts with the alternating
        // trough/crest shape produced when a droplet strikes a water surface.
        if (uSplashStrength != 0.0) {
          float d = distance(uv, uSplashPos);
          float r = d / max(1e-6, uSplashRadius);

          float centreDimple = -0.90 * exp(-pow(r / 0.26, 2.0));
          float crownRing = 0.72 * exp(-pow((r - 0.52) / 0.16, 2.0));
          float outerRing = -0.22 * exp(-pow((r - 1.05) / 0.24, 2.0));

          float dropletImpact = centreDimple + crownRing + outerRing;
          h += dropletImpact * uSplashStrength;
        }

        // Keep the feedback texture inside a physically useful numeric range.
        // This also recovers safely from a transient GPU/driver precision spike.
        h = clamp(h, 0.35, 0.65);
        v = clamp(v, -0.12, 0.12);

        gl_FragColor = vec4(h, v, 0.0, 1.0);
      }
    `;
  }
}
