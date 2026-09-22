import * as THREE from 'https://esm.sh/three@0.158.0';
import { WaterSim } from './waterSim.js?v=20260911-reference-water-v1';

// Visual/physical profile measured from the supplied Anderson Mancini demo's
// default Balanced preset.  The demo exposes H=180, L=80 and roughness=0;
// the remaining values reproduce its clear cyan glass, long-lived height-field
// ripples, strong grazing reflection and refracted RGB caustics in Poolly's
// Z-up, screen-space-refraction renderer.
export const REFERENCE_WATER_PROFILE = Object.freeze({
  hue: 180,
  luminosity: 0.80,
  roughness: 0,
  ior: 1.333,
  fresnelF0: 0.02037,
  viscosity: 0.9945,
  waveSpeed: 0.52,
  ambientDrive: 0.0018,
  surfaceDisplacement: 0.032,
  refractionStrength: 0.021,
  reflectionStrength: 0.72,
  causticsStrength: 1.0
});

export function createWaterFeatureMaterial(options = {}) {
  const color = new THREE.Color().setHSL(
    REFERENCE_WATER_PROFILE.hue / 360,
    0.80,
    REFERENCE_WATER_PROFILE.luminosity
  );
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: REFERENCE_WATER_PROFILE.roughness,
    transmission: options.transmission ?? 0.72,
    thickness: options.thickness ?? 0.012,
    ior: REFERENCE_WATER_PROFILE.ior,
    clearcoat: 0.18,
    clearcoatRoughness: 0.02,
    transparent: true,
    opacity: options.opacity ?? 0.52,
    depthWrite: false,
    side: THREE.DoubleSide,
    ...options
  });
}

/**
 * Compatible with V7:
 * - createPoolWater(length, width, geometryOverride)
 * - or createPoolWater(geometryOverride) (fallback)
 */
export function createPoolWater(a, b, geometryOverride = null) {
  const SIM_SIZE = (window.__POOL_PERF?.waterSimSize ?? 256);

  // --- Resolve geometry ---
  let geom = null;

  // Case 1: createPoolWater(geometry)
  if (a && typeof a === 'object' && a.isBufferGeometry) {
    geom = a;
  }
  // Case 2: createPoolWater(length, width, geometryOverride?)
  else {
    const length = typeof a === 'number' ? a : 10;
    const width  = typeof b === 'number' ? b : 6;

    if (geometryOverride && geometryOverride.isBufferGeometry) {
      geom = geometryOverride;
    } else {
      // Needs tessellation for vertex displacement to be visible
      const seg = (window.__POOL_PERF?.waterSegments ?? 128);
      geom = new THREE.PlaneGeometry(length, width, seg, seg);
    }
  }

  // If still null, fail loudly but safely
  if (!geom || !geom.isBufferGeometry) {
    console.error('createPoolWater: invalid geometry args:', a, b, geometryOverride);
    geom = new THREE.PlaneGeometry(10, 6, 1, 1);
  }

  // Dummy 1x1 texture to avoid null sampler compile issues
  const dummy = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  dummy.needsUpdate = true;

  // --- Real normal maps
  const _loader = new THREE.TextureLoader();
  const normal1 = _loader.load('./textures/water/Water_1_M_Normal.png');
  const normal2 = _loader.load('./textures/water/Water_2_M_Normal.png');
  const normal3 = _loader.load('./textures/water/2.png');
  for (const t of [normal1, normal2, normal3]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace; // normal maps are data
    t.anisotropy = (window.__POOL_PERF?.waterAnisotropy ?? 4);
  }

  const uniforms = {
    heightTex: { value: dummy },
    interiorTex: { value: dummy },
    depthTex: { value: dummy },
    depthTexValid: { value: 0.0 }, // 0 = no real depth prepass texture
    environmentTex: { value: window.__POOL_HDRI_TEXTURE || dummy },
    environmentTexValid: { value: window.__POOL_HDRI_TEXTURE ? 1.0 : 0.0 },
    environmentIntensity: { value: 0.78 },

    resolution: { value: new THREE.Vector2(1, 1) },

    poolMin: { value: new THREE.Vector2(0, 0) },
    poolSize: { value: new THREE.Vector2(1, 1) },

    // Time (for micro ripples + subtle animation)
    uTime: { value: 0.0 },

    // Surface shape (calmer)
    heightScale: { value: 0.128 },
    dispScale:   { value: 0.25 },
    normalScale: { value: 2.8 },

    refractStrength: { value: REFERENCE_WATER_PROFILE.refractionStrength },
    chroma: { value: 0.32 },

    // Micro ripples (reduced to avoid blotchiness)
    microStrength: { value: 0.020 },
    microScale:    { value: 11.5 },
    microSpeed:    { value: 0.28 },

    // Real normal maps (reduced)
    normalMap1: { value: normal1 },
    normalMap2: { value: normal2 },
    normalMap3: { value: normal3 },
    normalMapStrength: { value: 0.62 },
    normalMap3Strength: { value: 0.18 },
    // Five percent larger surface detail (slightly lower UV frequency).
    normalTiling1: { value: 0.285 },
    normalTiling2: { value: 0.435 },
    normalTiling3: { value: 0.135 },
    normalSpeed1: { value: 0.010 },
    normalSpeed2: { value: 0.015 },
    normalOrbit3: { value: 0.020 },
    normalAngularSpeed3: { value: 0.060 },

    // Depth/thickness
    cameraNear: { value: 0.1 },
    cameraFar: { value: 200.0 },
    thicknessStrength: { value: 1.0 },

    // Fresnel/spec (softer highlights, reflection mostly at grazing angles)
    fresnelPower: { value: 5.0 },
    fresnelF0: { value: REFERENCE_WATER_PROFILE.fresnelF0 },
    reflectStrength: { value: REFERENCE_WATER_PROFILE.reflectionStrength },

    // Broad glossy reflection rather than tiny sparkling points.
    specPower: { value: 72.0 },
    specStrength: { value: 0.42 },
    lightDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },

    // Directional surface-light reflection and small moving glints
    reflectionTint: { value: new THREE.Color(0.86, 0.93, 0.98) },
    reflectionStrength: { value: 0.48 },
    reflectionPower: { value: 18.0 },

    // HDR reflection uses the same three moving normal maps as the water bump.
    // The legacy timing/detail uniforms are retained for API compatibility.
    reflectionTimeScale: { value: 1.0 },
    reflectionNormalStrength: { value: 0.28 },
    reflectionDetailScale: { value: 1.0 },

    // Broad visible ripple shading, independent of the slow reflection.
    surfaceDetailStrength: { value: 0.16 },
    surfaceDetailNormalStrength: { value: 0.28 },
    surfaceDetailSpeed: { value: 1.0 }, // retained for API compatibility
    brightnessSpeedMultiplier: { value: 1.0 }, // brightness follows the three bump layers exactly

    // Procedural sparkle layer disabled by default; re-enable gently if wanted.
    glintStrength: { value: 0.0 },
    glintScale: { value: 0.22 },
    glintSpeed: { value: 0.05 },

    // Beer–Lambert absorption. Keep this restrained so dark finishes remain dark;
    // the water selectively removes red first instead of painting every tile cyan.
    absorption: { value: new THREE.Color(0.72, 0.16, 0.055) },
    absorptionStrength: { value: 0.115 },

    // Volumetric in-scatter colours. These are deliberately dark because they
    // represent light scattered through the water, not a flat overlay tint.
    shallowColor: { value: new THREE.Color(0.10, 0.64, 0.72) },
    deepColor:    { value: new THREE.Color(0.00, 0.18, 0.31) },

    alphaShallow: { value: 0.34 },
    alphaDeep:    { value: 0.56 },

    // UV fallback depth (meters-ish thickness)
    thicknessShallow: { value: 0.45 },
    thicknessDeep:    { value: 1.20 },

    // Flip which end is deep in UV fallback (0 = vSimUV.y deepwards, 1 = flipped)
    deepFlip: { value: 0.0 },

    orangeClipEnabled: { value: 0.0 },
    orangeClipShape: { value: 0.0 },
    orangeClipMin: { value: new THREE.Vector3(0, 0, 0) },
    orangeClipMax: { value: new THREE.Vector3(0, 0, 0) },
    orangeClipCenter: { value: new THREE.Vector2(0, 0) },
    orangeClipRadius: { value: 0.0 },
    sectionClipEnabled: { value: 0.0 },
    sectionClipY: { value: 0.0 },
  };

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms,
    vertexShader: `
uniform sampler2D heightTex;
uniform vec2 poolMin;
uniform vec2 poolSize;
uniform float heightScale;
uniform float dispScale;

varying vec3 vWorld;
varying vec2 vSimUV;

void main(){
  vec4 w0 = modelMatrix * vec4(position, 1.0);

  // sim UV from world XY (water plane is XY; Z-up)
  vec2 simUV = (w0.xy - poolMin) / poolSize;
  simUV = clamp(simUV, 0.001, 0.999);
  vSimUV = simUV;

  float h = texture2D(heightTex, simUV).r;

  // sim baseline is 0.5
  float hh = clamp((h - 0.5) * 2.0, -1.0, 1.0);

  vec3 p = position;
  p.z += hh * heightScale * dispScale;

  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;

  gl_Position = projectionMatrix * viewMatrix * w;
}
    `,
    fragmentShader: `
precision highp float;

uniform sampler2D heightTex;
uniform sampler2D interiorTex;
uniform sampler2D depthTex;
uniform sampler2D environmentTex;

uniform float depthTexValid;
uniform float environmentTexValid;
uniform float environmentIntensity;

uniform sampler2D normalMap1;
uniform sampler2D normalMap2;
uniform sampler2D normalMap3;
uniform float normalMapStrength;
uniform float normalMap3Strength;
uniform float normalTiling1;
uniform float normalTiling2;
uniform float normalTiling3;
uniform float normalSpeed1;
uniform float normalSpeed2;
uniform float normalOrbit3;
uniform float normalAngularSpeed3;

uniform vec2 resolution;
uniform float uTime;

uniform float normalScale;
uniform float refractStrength;
uniform float chroma;

uniform float microStrength;
uniform float microScale;
uniform float microSpeed;

uniform float fresnelPower;
uniform float fresnelF0;
uniform float reflectStrength;

uniform vec3 lightDir;
uniform float specPower;
uniform float specStrength;
uniform vec3 reflectionTint;
uniform float reflectionStrength;
uniform float reflectionPower;
uniform float reflectionTimeScale;
uniform float reflectionNormalStrength;
uniform float reflectionDetailScale;
uniform float surfaceDetailStrength;
uniform float surfaceDetailNormalStrength;
uniform float surfaceDetailSpeed;
uniform float brightnessSpeedMultiplier;
uniform float glintStrength;
uniform float glintScale;
uniform float glintSpeed;

uniform vec3 absorption;
uniform float absorptionStrength;

uniform float cameraNear;
uniform float cameraFar;
uniform float thicknessStrength;

uniform vec3 shallowColor;
uniform vec3 deepColor;

uniform float alphaShallow;
uniform float alphaDeep;

uniform float thicknessShallow;
uniform float thicknessDeep;

uniform float deepFlip;
uniform float orangeClipEnabled;
uniform float orangeClipShape;
uniform vec3 orangeClipMin;
uniform vec3 orangeClipMax;
uniform vec2 orangeClipCenter;
uniform float orangeClipRadius;
uniform float sectionClipEnabled;
uniform float sectionClipY;

varying vec3 vWorld;
varying vec2 vSimUV;

float perspectiveDepthToViewZ(const in float invClipZ, const in float near, const in float far) {
  return (near * far) / ((far - near) * invClipZ - far);
}

vec2 directionToEquirectUv(vec3 direction) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) * 0.15915494309189535 + 0.5;
  float v = asin(clamp(d.y, -1.0, 1.0)) * 0.3183098861837907 + 0.5;
  return vec2(fract(u), clamp(v, 0.001, 0.999));
}

// Small procedural height field for micro ripples
float microH(vec2 p, float t){
  float a = sin(p.x + t*microSpeed) * cos(p.y*1.17 - t*microSpeed*1.2);
  float b = sin(p.x*1.9 - t*microSpeed*0.8) * cos(p.y*2.3 + t*microSpeed*1.1);
  float c = sin(p.x*3.1 + t*microSpeed*0.6) * cos(p.y*2.7 - t*microSpeed*0.7);
  return (a + 0.5*b + 0.25*c);
}

vec2 flowWarp(vec2 p, float t){
  float w1 = sin(p.x*0.9 + t*0.8) * cos(p.y*1.1 - t*0.6);
  float w2 = sin(p.x*1.7 - t*0.35) * cos(p.y*1.3 + t*0.55);
  return vec2(w1 + 0.6*w2, w2 - 0.4*w1);
}

void main(){
  if (sectionClipEnabled > 0.5 && vWorld.y > sectionClipY) {
    discard;
  }

  if (orangeClipEnabled > 0.5) {
    bool insideHeight = vWorld.z >= orangeClipMin.z && vWorld.z <= orangeClipMax.z;
    if (orangeClipShape > 0.5) {
      vec2 d = vWorld.xy - orangeClipCenter;
      if (insideHeight && dot(d, d) <= orangeClipRadius * orangeClipRadius) {
        discard;
      }
    } else if (
      vWorld.x >= orangeClipMin.x && vWorld.x <= orangeClipMax.x &&
      vWorld.y >= orangeClipMin.y && vWorld.y <= orangeClipMax.y &&
      insideHeight
    ) {
      discard;
    }
  }

  vec2 simUV = clamp(vSimUV, 0.001, 0.999);

  // gradient for normal from sim
  vec2 texel = vec2(1.0 / float(256), 1.0 / float(256));

  float hL = texture2D(heightTex, simUV - vec2(texel.x, 0.0)).r;
  float hR = texture2D(heightTex, simUV + vec2(texel.x, 0.0)).r;
  float hD = texture2D(heightTex, simUV - vec2(0.0, texel.y)).r;
  float hU = texture2D(heightTex, simUV + vec2(0.0, texel.y)).r;

  float dx = (hR - hL) * normalScale;
  float dy = (hU - hD) * normalScale;

  // micro ripples (rotated + jittered to avoid grid moire)
  float ang = 0.63;
  mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 p = rot * (vWorld.xy * microScale + vec2(13.7, 9.2));

  float eps = 0.015;
  float mC = microH(p, uTime);
  float mX = microH(p + vec2(eps, 0.0), uTime);
  float mY = microH(p + vec2(0.0, eps), uTime);

  float mdx = (mX - mC) / eps;
  float mdy = (mY - mC) / eps;

  dx += mdx * microStrength * 0.15;
  dy += mdy * microStrength * 0.15;

  // normal maps
  float hC = texture2D(heightTex, simUV).r;
  vec2 wuv = vWorld.xy;

  vec2 warp = (hC - 0.5) * vec2(0.08, 0.06);
  vec2 uv1 = wuv * normalTiling1 + warp
           + vec2(uTime * normalSpeed1, uTime * normalSpeed1 * 0.65)
           + flowWarp(vWorld.xy*0.35, uTime)*0.045;

  vec2 uv2 = wuv * normalTiling2 - warp
           + vec2(uTime * normalSpeed2, uTime * normalSpeed2 * 0.92)
           + flowWarp(vWorld.xy*0.55 + 7.3, uTime)*0.03;

  float orbitPhase = uTime * normalAngularSpeed3;
  vec2 orbit3 = vec2(cos(orbitPhase), sin(orbitPhase)) * normalOrbit3;
  vec2 uv3 = wuv * normalTiling3 + orbit3
           + flowWarp(vWorld.xy * 0.42 + 3.1, uTime * 0.20) * 0.006;

  vec3 n1 = texture2D(normalMap1, uv1).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(normalMap2, uv2).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D(normalMap3, uv3).xyz * 2.0 - 1.0;
  vec2 nm12 = n1.xy + n2.xy;
  vec2 nm3 = n3.xy * normalMap3Strength;
  vec2 nm = normalize(nm12 + nm3);

  dx += nm.x * normalMapStrength * 0.35;
  dy += nm.y * normalMapStrength * 0.35;

  // View-angle fade of high-frequency normal detail (reduces shimmer / blotches)
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vec3(-dx, -dy, 1.0));

  float viewFade = clamp(dot(N, V), 0.0, 1.0);
  float fadeAmt = mix(0.35, 1.0, viewFade);

  dx *= fadeAmt;
  dy *= fadeAmt;

  // Recompute N after modifying dx/dy
  N = normalize(vec3(-dx, -dy, 1.0));

  vec2 screenUV = gl_FragCoord.xy / resolution;

  // Refraction/deflection of the pool tiles. Use the exact combined water normal
  // and scale distortion with water thickness so the tile motion follows the
  // surface animation instead of appearing as a separate sliding layer.
  float tileDepthFactor = mix(0.68, 1.08, clamp(vSimUV.y, 0.0, 1.0));
  vec2 off = N.xy * refractStrength * tileDepthFactor;
  off = clamp(off, vec2(-0.035), vec2(0.035));
  vec2 offR = off * (1.0 + 0.015 * chroma);
  vec2 offG = off;
  vec2 offB = off * (1.0 - 0.015 * chroma);

  vec3 col;
  vec2 uvR = clamp(screenUV + offR, vec2(0.001), vec2(0.999));
  vec2 uvG = clamp(screenUV + offG, vec2(0.001), vec2(0.999));
  vec2 uvB = clamp(screenUV + offB, vec2(0.001), vec2(0.999));
  col.r = texture2D(interiorTex, uvR).r;
  col.g = texture2D(interiorTex, uvG).g;
  col.b = texture2D(interiorTex, uvB).b;

  // TEST MODE: three brightness layers use the same paths/directions as the
  // bump maps, but their animation time is multiplied independently. Refraction
  // still uses uv1/uv2/uv3 at normal speed, so this isolates brightness motion.
  float brightnessTime = uTime * brightnessSpeedMultiplier;
  vec2 buv1 = wuv * normalTiling1 + warp
            + vec2(brightnessTime * normalSpeed1, brightnessTime * normalSpeed1 * 0.65)
            + flowWarp(vWorld.xy * 0.35, brightnessTime) * 0.045;

  // Brightness layer 2 intentionally moves in the opposite direction to the
  // underlying second water layer, while keeping the same speed magnitude.
  vec2 buv2 = wuv * normalTiling2 - warp
            - vec2(brightnessTime * normalSpeed2, brightnessTime * normalSpeed2 * 0.92)
            - flowWarp(vWorld.xy * 0.55 + 7.3, brightnessTime) * 0.03;

  float brightnessOrbitPhase = brightnessTime * normalAngularSpeed3;
  vec2 brightnessOrbit3 = vec2(cos(brightnessOrbitPhase), sin(brightnessOrbitPhase)) * normalOrbit3;
  vec2 buv3 = wuv * normalTiling3 + brightnessOrbit3
            + flowWarp(vWorld.xy * 0.42 + 3.1, brightnessTime * 0.20) * 0.006;

  vec3 bn1 = texture2D(normalMap1, buv1).xyz * 2.0 - 1.0;
  vec3 bn2 = texture2D(normalMap2, buv2).xyz * 2.0 - 1.0;
  vec3 bn3 = texture2D(normalMap3, buv3).xyz * 2.0 - 1.0;

  vec3 surfaceLightDir = normalize(vec3(0.32, -0.24, 0.92));

  vec3 Nbright1 = normalize(vec3(
    -bn1.x * surfaceDetailNormalStrength,
    -bn1.y * surfaceDetailNormalStrength,
    max(bn1.z, 0.25)
  ));
  vec3 Nbright2 = normalize(vec3(
    -bn2.x * surfaceDetailNormalStrength,
    -bn2.y * surfaceDetailNormalStrength,
    max(bn2.z, 0.25)
  ));
  vec3 Nbright3 = normalize(vec3(
    -bn3.x * surfaceDetailNormalStrength,
    -bn3.y * surfaceDetailNormalStrength,
    max(bn3.z, 0.25)
  ));

  // Broad responses keep the texture readable without producing sharp speckles.
  float brightness1 = smoothstep(0.70, 0.94, dot(Nbright1, surfaceLightDir));
  float brightness2 = smoothstep(0.70, 0.94, dot(Nbright2, surfaceLightDir));
  float brightness3 = smoothstep(0.70, 0.94, dot(Nbright3, surfaceLightDir));

  float matchedBrightness = clamp(
    brightness1 * 0.38 +
    brightness2 * 0.38 +
    brightness3 * 0.24 * normalMap3Strength,
    0.0, 1.0
  );

  // Store the three animated brightness layers. They are applied at the final
  // colour stage so absorption/depth colouring cannot flatten their motion.
  float movingLight = (matchedBrightness - 0.34) * surfaceDetailStrength;

  // HDRI reflection follows the exact same three animated normal-map layers
  // used by the visible water bump/refraction. This means map 1, map 2 and the
  // orbiting map 3 move the reflected environment in their original directions,
  // speeds, tiling and flow-warp patterns. reflectionNormalStrength remains a
  // separate amplitude control, so the reflection can be adjusted without
  // changing the physical-looking water surface motion.
  vec2 reflectionSlope = (n1.xy + n2.xy + n3.xy * normalMap3Strength) / 2.5;
  vec3 Nlight = normalize(vec3(
    -reflectionSlope.x * reflectionNormalStrength,
    -reflectionSlope.y * reflectionNormalStrength,
    1.0
  ));

  // Rebuilt glass reflection. Calculate a broad, stable reflection mask here,
  // but apply it after absorption/depth colouring so it remains clearly visible.
  float NdV = max(dot(Nlight, V), 0.0);
  // Schlick Fresnel for an air/water boundary (IOR 1.333 => F0 0.02037).
  // Head-on views remain transparent while grazing views strongly reflect sky.
  float glassFresnel = fresnelF0 + (1.0 - fresnelF0)
    * pow(1.0 - NdV, max(fresnelPower, 1.0));

  vec3 L = normalize(lightDir);
  vec3 H = normalize(L + V);
  vec3 R = reflect(-L, Nlight);

  // Low powers create large reflection lobes rather than tiny flashing points.
  float halfLobe = pow(max(dot(Nlight, H), 0.0), max(reflectionPower * 0.45, 3.0));
  float mirrorLobe = pow(max(dot(R, V), 0.0), max(specPower * 0.28, 3.0));
  float sunFacing = smoothstep(-0.10, 0.45, dot(Nlight, L));

  // The normal-map samples add slow broad variation to the glass sheen.
  float sheenVariation = clamp(
    0.50 + reflectionSlope.x * 0.55 - reflectionSlope.y * 0.35,
    0.0, 1.0
  );
  sheenVariation = smoothstep(0.18, 0.82, sheenVariation);

  float glassMask = clamp(
    glassFresnel * reflectStrength * 0.92 +
    halfLobe * reflectionStrength * sunFacing * 0.58 +
    mirrorLobe * specStrength * 0.34 +
    sheenVariation * reflectionStrength * 0.10,
    0.0, 0.62
  );

  vec3 glassReflectionColor = mix(
    vec3(0.52, 0.76, 0.96),
    reflectionTint,
    clamp(halfLobe + mirrorLobe * 0.5, 0.0, 1.0)
  );

  // Sample the same rotated HDRI used by scene.environment/background.
  // Pool geometry is Z-up, while Three.js equirectangular environments are Y-up,
  // so remap the reflected world direction before converting it to UVs.
  if (environmentTexValid > 0.5) {
    vec3 reflectedWorld = reflect(-V, Nlight);
    vec3 environmentDirection = normalize(vec3(
      reflectedWorld.x,
      reflectedWorld.z,
      -reflectedWorld.y
    ));
    vec3 hdriReflection = texture2D(
      environmentTex,
      directionToEquirectUv(environmentDirection)
    ).rgb;

    // Preserve HDR values for renderer tone mapping and use the water's broad
    // normal/Fresnel response to avoid a mirror-flat surface.
    float hdriAmount = clamp(
      glassFresnel * 0.92 +
      halfLobe * 0.34 +
      sheenVariation * 0.16,
      0.0,
      0.92
    ) * environmentIntensity;
    glassReflectionColor = mix(glassReflectionColor, hdriReflection, hdriAmount);
    glassMask = clamp(glassMask + hdriAmount * 0.22, 0.0, 0.68);
  }

  // ----- depth/thickness factor -----
  float tUV = clamp(vSimUV.y, 0.0, 1.0);
  if (deepFlip > 0.5) tUV = 1.0 - tUV;

  float thicknessUV = mix(thicknessShallow, thicknessDeep, tUV);

  float thickness = thicknessUV;
  float t = tUV;

  if (depthTexValid > 0.5) {
    float sceneDepth = texture2D(depthTex, screenUV).x;
    float waterDepth = gl_FragCoord.z;

    float sceneViewZ = perspectiveDepthToViewZ(sceneDepth, cameraNear, cameraFar);
    float waterViewZ = perspectiveDepthToViewZ(waterDepth, cameraNear, cameraFar);

    thickness = max(0.0, abs(sceneViewZ - waterViewZ));
    t = clamp(thickness * 0.45, 0.0, 1.0);
  }

  // Beer–Lambert transmission
  vec3 sigma = absorption * absorptionStrength * thicknessStrength;
  vec3 trans = exp(-sigma * thickness);

  // Shallow/deep volumetric in-scatter. Do not apply this as a flat colour tint:
  // bright tile finishes receive more visible aqua scattering, while midnight/black
  // tiles retain their low luminance and are affected mainly by spectral absorption.
  vec3 waterColor = mix(shallowColor, deepColor, t);
  float substrateLuma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float brightSurfaceResponse = smoothstep(0.035, 0.62, substrateLuma);
  float scatterResponse = mix(0.12, 0.88, brightSurfaceResponse);
  float scatterAmount = clamp(
    0.025 + (1.0 - dot(trans, vec3(0.3333333))) * scatterResponse,
    0.0, 0.30
  );

  // Preserve the tile's original luminance, then add only physically restrained
  // water-body scattering. This keeps black tile black instead of turning it blue.
  col = col * trans;
  col += waterColor * scatterAmount;
  // The reference keeps a visible cyan water body even over pale tiles. This
  // restrained in-scatter is depth-aware and avoids the old nearly colourless,
  // double-transparent result while retaining the underlying finish detail.
  col += waterColor * mix(0.018, 0.065, t) * mix(0.55, 1.0, brightSurfaceResponse);
  // Reinforce the shallow-to-deep read without flattening the tile finish.
  // The deep end loses luminance progressively, while the shallow end keeps
  // its transparent appearance and visible tile detail.
  col *= mix(1.0, 0.68, smoothstep(0.18, 1.0, t));

  // Very subtle loss of saturation with depth; avoid whitening dark finishes.
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(luma), 0.025 * t);

  // Final-stage animated water brightness. This directly modulates the finished
  // water colour, so the three bump-driven light layers remain visibly animated.
  float finalBrightness = clamp(movingLight, -0.10, 0.12);
  col *= 1.0 + finalBrightness;

  // Apply the rebuilt glass reflection after every underwater colour operation.
  // This prevents absorption and transparency from washing the reflection away.
  col = mix(col, glassReflectionColor, glassMask);
  col += glassReflectionColor * halfLobe * reflectionStrength * 0.035;
  col += glassReflectionColor * pow(max(glassMask, 0.0), 2.0) * 0.010;

  // Reflected areas become slightly more opaque, like a real glassy water surface.
  float alpha = mix(alphaShallow, alphaDeep, t);
  alpha = clamp(alpha + glassMask * 0.14, 0.0, 0.72);

  gl_FragColor = vec4(col, alpha);
}
    `,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;

  // --- Simulation instance ---
  let sim = null;

  mesh.userData.setInteriorTex = (tex) => {
    uniforms.interiorTex.value = tex || dummy;
  };

  mesh.userData.setDepthTex = (tex) => {
    uniforms.depthTex.value = tex || dummy;
    uniforms.depthTexValid.value = tex ? 1.0 : 0.0;
  };

  mesh.userData.setEnvironmentTex = (tex) => {
    uniforms.environmentTex.value = tex || dummy;
    uniforms.environmentTexValid.value = tex ? 1.0 : 0.0;
  };

  mesh.userData.setSectionClipY = (cutY) => {
    if (typeof cutY === 'number' && Number.isFinite(cutY)) {
      uniforms.sectionClipEnabled.value = 1.0;
      uniforms.sectionClipY.value = cutY;
    } else {
      uniforms.sectionClipEnabled.value = 0.0;
    }
  };

  mesh.userData.setOrangeClipBox = (box) => {
    if (box) {
      uniforms.orangeClipEnabled.value = 1.0;
      if (box.shape === 'circular') {
        uniforms.orangeClipShape.value = 1.0;
        uniforms.orangeClipCenter.value.set(box.centerX, box.centerY);
        uniforms.orangeClipRadius.value = Math.max(0.0, box.radius || 0.0);
        uniforms.orangeClipMin.value.set(box.centerX - box.radius, box.centerY - box.radius, box.minZ);
        uniforms.orangeClipMax.value.set(box.centerX + box.radius, box.centerY + box.radius, box.maxZ);
      } else {
        uniforms.orangeClipShape.value = 0.0;
        uniforms.orangeClipRadius.value = 0.0;
        uniforms.orangeClipCenter.value.set(0, 0);
        uniforms.orangeClipMin.value.set(box.minX, box.minY, box.minZ);
        uniforms.orangeClipMax.value.set(box.maxX, box.maxY, box.maxZ);
      }
    } else {
      uniforms.orangeClipEnabled.value = 0.0;
      uniforms.orangeClipShape.value = 0.0;
      uniforms.orangeClipRadius.value = 0.0;
    }
  };


  // Hyper-realistic outdoor pool preset. All values remain adjustable through
  // mesh.userData.setWaterTuning({...}) without rebuilding the pool.
  mesh.userData.waterPreset = "andersonBalancedReference";
  mesh.userData.getWaterTuning = () => ({
    normalMapStrength: uniforms.normalMapStrength.value,
    normalMap3Strength: uniforms.normalMap3Strength.value,
    normalTiling1: uniforms.normalTiling1.value,
    normalTiling2: uniforms.normalTiling2.value,
    normalTiling3: uniforms.normalTiling3.value,
    normalSpeed1: uniforms.normalSpeed1.value,
    normalSpeed2: uniforms.normalSpeed2.value,
    normalOrbit3: uniforms.normalOrbit3.value,
    normalAngularSpeed3: uniforms.normalAngularSpeed3.value,
    refractStrength: uniforms.refractStrength.value,
    reflectStrength: uniforms.reflectStrength.value,
    reflectionStrength: uniforms.reflectionStrength.value,
    reflectionNormalStrength: uniforms.reflectionNormalStrength.value,
    absorptionStrength: uniforms.absorptionStrength.value,
    shallowColor: uniforms.shallowColor.value.clone(),
    deepColor: uniforms.deepColor.value.clone()
  });

  mesh.userData.setWaterTuning = (t = {}) => {
    if (typeof t.heightScale === 'number') uniforms.heightScale.value = t.heightScale;
    if (typeof t.normalScale === 'number') uniforms.normalScale.value = t.normalScale;
    if (typeof t.refractStrength === 'number') uniforms.refractStrength.value = t.refractStrength;
    if (typeof t.dispScale === 'number') uniforms.dispScale.value = t.dispScale;
    if (typeof t.chroma === 'number') uniforms.chroma.value = t.chroma;
    if (typeof t.thicknessStrength === 'number') uniforms.thicknessStrength.value = t.thicknessStrength;

    if (typeof t.microStrength === 'number') uniforms.microStrength.value = t.microStrength;
    if (typeof t.microScale === 'number') uniforms.microScale.value = t.microScale;
    if (typeof t.microSpeed === 'number') uniforms.microSpeed.value = t.microSpeed;

    if (typeof t.normalMapStrength === 'number') uniforms.normalMapStrength.value = t.normalMapStrength;
    if (typeof t.normalMap3Strength === 'number') uniforms.normalMap3Strength.value = t.normalMap3Strength;
    if (typeof t.normalTiling1 === 'number') uniforms.normalTiling1.value = t.normalTiling1;
    if (typeof t.normalTiling2 === 'number') uniforms.normalTiling2.value = t.normalTiling2;
    if (typeof t.normalTiling3 === 'number') uniforms.normalTiling3.value = t.normalTiling3;
    if (typeof t.normalSpeed1 === 'number') uniforms.normalSpeed1.value = t.normalSpeed1;
    if (typeof t.normalSpeed2 === 'number') uniforms.normalSpeed2.value = t.normalSpeed2;
    if (typeof t.normalOrbit3 === 'number') uniforms.normalOrbit3.value = t.normalOrbit3;
    if (typeof t.normalAngularSpeed3 === 'number') uniforms.normalAngularSpeed3.value = t.normalAngularSpeed3;

    if (typeof t.fresnelPower === 'number') uniforms.fresnelPower.value = t.fresnelPower;
    if (typeof t.fresnelF0 === 'number') uniforms.fresnelF0.value = t.fresnelF0;
    if (typeof t.reflectStrength === 'number') uniforms.reflectStrength.value = t.reflectStrength;

    if (typeof t.specPower === 'number') uniforms.specPower.value = t.specPower;
    if (typeof t.specStrength === 'number') uniforms.specStrength.value = t.specStrength;
    if (typeof t.reflectionStrength === 'number') uniforms.reflectionStrength.value = t.reflectionStrength;
    if (typeof t.reflectionPower === 'number') uniforms.reflectionPower.value = t.reflectionPower;
    if (typeof t.reflectionTimeScale === 'number') uniforms.reflectionTimeScale.value = t.reflectionTimeScale;
    if (typeof t.reflectionNormalStrength === 'number') uniforms.reflectionNormalStrength.value = t.reflectionNormalStrength;
    if (typeof t.reflectionDetailScale === 'number') uniforms.reflectionDetailScale.value = t.reflectionDetailScale;
    if (typeof t.surfaceDetailStrength === 'number') uniforms.surfaceDetailStrength.value = t.surfaceDetailStrength;
    if (typeof t.surfaceDetailNormalStrength === 'number') uniforms.surfaceDetailNormalStrength.value = t.surfaceDetailNormalStrength;
    if (typeof t.surfaceDetailSpeed === 'number') uniforms.surfaceDetailSpeed.value = t.surfaceDetailSpeed;
    if (typeof t.brightnessSpeedMultiplier === 'number') uniforms.brightnessSpeedMultiplier.value = t.brightnessSpeedMultiplier;
    if (typeof t.glintStrength === 'number') uniforms.glintStrength.value = t.glintStrength;
    if (typeof t.glintScale === 'number') uniforms.glintScale.value = t.glintScale;
    if (typeof t.glintSpeed === 'number') uniforms.glintSpeed.value = t.glintSpeed;
    if (t.reflectionTint && t.reflectionTint.isColor) uniforms.reflectionTint.value.copy(t.reflectionTint);

    if (t.absorption && (t.absorption.isColor || Array.isArray(t.absorption))) {
      if (t.absorption.isColor) uniforms.absorption.value.copy(t.absorption);
      else uniforms.absorption.value.setRGB(t.absorption[0], t.absorption[1], t.absorption[2]);
    }
    if (typeof t.absorptionStrength === 'number') uniforms.absorptionStrength.value = t.absorptionStrength;

    if (t.shallowColor && t.shallowColor.isColor) uniforms.shallowColor.value.copy(t.shallowColor);
    if (t.deepColor && t.deepColor.isColor) uniforms.deepColor.value.copy(t.deepColor);

    if (typeof t.alphaShallow === 'number') uniforms.alphaShallow.value = t.alphaShallow;
    if (typeof t.alphaDeep === 'number') uniforms.alphaDeep.value = t.alphaDeep;

    if (typeof t.thicknessShallow === 'number') uniforms.thicknessShallow.value = t.thicknessShallow;
    if (typeof t.thicknessDeep === 'number') uniforms.thicknessDeep.value = t.thicknessDeep;

    if (typeof t.deepFlip === 'number') uniforms.deepFlip.value = t.deepFlip;

    if (sim && (typeof t.viscosity === 'number' || typeof t.waveSpeed === 'number' || typeof t.drive === 'number')) {
      sim.setParams({ viscosity: t.viscosity, waveSpeed: t.waveSpeed, drive: t.drive });
    }
  };

  mesh.userData.triggerRipple = (xWorld, yWorld) => {
    if (!sim) return;

    const min = uniforms.poolMin.value;
    const size = uniforms.poolSize.value;

    const u = (xWorld - min.x) / size.x;
    const v = (yWorld - min.y) / size.y;

    // Droplet-style double-click impact. The simulation converts this into
    // a centre dimple, raised crown and softer outer travelling ring.
    const DOUBLE_CLICK_RIPPLE_STRENGTH = 0.085;
    const DOUBLE_CLICK_RIPPLE_RADIUS = 0.055;

    sim.splash(new THREE.Vector2(
      THREE.MathUtils.clamp(u, 0.001, 0.999),
      THREE.MathUtils.clamp(v, 0.001, 0.999)
    ), DOUBLE_CLICK_RIPPLE_STRENGTH, DOUBLE_CLICK_RIPPLE_RADIUS);
  };

  // animate(delta, clock, camera, dirLight, renderer)
  mesh.userData.animate = (delta, clock, camera, dirLight, renderer) => {
    const r = renderer && renderer.isWebGLRenderer ? renderer :
              (clock && clock.isWebGLRenderer ? clock : null);

    if (!r) return;

    if (!sim) {
      sim = new WaterSim(r, SIM_SIZE);
      // Default motion (subtle)
      sim.setParams({
        viscosity: REFERENCE_WATER_PROFILE.viscosity,
        waveSpeed: REFERENCE_WATER_PROFILE.waveSpeed,
        drive: REFERENCE_WATER_PROFILE.ambientDrive
      });
    }

    const dt = (typeof delta === 'number' ? delta : 1 / 60);
    uniforms.uTime.value += dt;

    sim.update(dt);
    uniforms.heightTex.value = sim.texture;

    uniforms.resolution.value.set(r.domElement.width, r.domElement.height);

    if (dirLight && dirLight.position) {
      uniforms.lightDir.value.copy(dirLight.position).normalize();
    }

    const box = new THREE.Box3().setFromObject(mesh);
    uniforms.poolMin.value.set(box.min.x, box.min.y);
    uniforms.poolSize.value.set(
      Math.max(0.001, box.max.x - box.min.x),
      Math.max(0.001, box.max.y - box.min.y)
    );
  };

  return mesh;
}
