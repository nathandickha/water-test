// frontend/js/scene.js
// Safe override: no world-axis flips; compressed panorama aligned via sky-dome; ground void preserved
import * as THREE from "https://esm.sh/three@0.158.0";
import { hydrateStoneMaterial } from "./materials/StoneMaterialFactory.js";
import { OrbitControls } from "https://esm.sh/three@0.158.0/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "https://esm.sh/three@0.158.0/examples/jsm/environments/RoomEnvironment.js";
import { RGBELoader } from "https://esm.sh/three@0.158.0/examples/jsm/loaders/RGBELoader.js";
import { EffectComposer } from "https://esm.sh/three@0.158.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://esm.sh/three@0.158.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://esm.sh/three@0.158.0/examples/jsm/postprocessing/UnrealBloomPass.js";
import { createPoolWater } from "./pool/water.js?v=20260911-reference-water-v1";

let dirLight;

const FAST_STARTUP = true;
const ENABLE_SPA_DEBUG_VOIDS = false;
const ENABLE_ORANGE_INTERIOR_DEBUG = false;
const ENABLE_ROOM_ENVIRONMENT = false;
const SHADOW_MAP_SIZE = FAST_STARTUP ? 1024 : 2048;
const SKY_PANORAMA_FILENAME = "kloofendal_48d_partly_cloudy_puresky_sky.webp";
const HDRI_FILENAME = "kloofendal_48d_partly_cloudy_puresky_fast.hdr";
const SKY_PANORAMA_URL = new URL(`../assets/environment/${SKY_PANORAMA_FILENAME}`, import.meta.url).href;
const HDRI_URL = new URL(`../assets/environment/${HDRI_FILENAME}`, import.meta.url).href;
// One shared PMREM generator and one cached result: never regenerate on pool rebuilds.
let sharedPMREMGenerator = null;
let cachedEnvironmentMap = null;
let cachedRotatedPanoramaTarget = null;
// Blender World Mapping Z rotation equivalent: horizontal panorama azimuth rotation.
const HDRI_ROTATION_Z = THREE.MathUtils.degToRad(180);

// Brightest solar disc measured from the bundled Kloofendal HDR. These are
// equirectangular source-image coordinates before HDRI_ROTATION_Z is applied.
// Keeping the value tied to the actual HDR makes the shadow-casting key light
// point at the sun that is visible in the panorama.
const HDRI_SUN_U = 1218 / 2048;
const HDRI_SUN_V_FROM_TOP = 239 / 1024;
const HDRI_SUN_LIGHT_DISTANCE = 55;

function getHDRISunDirection(rotationZ = HDRI_ROTATION_Z) {
  // The dome shader maps longitude to U as:
  // u = longitude / 2PI + 0.5 + rotationOffset.
  // Image rows run from top to bottom, so elevation is positive above the
  // horizon when source V is less than 0.5.
  const longitude = (HDRI_SUN_U - 0.5 - rotationZ / (Math.PI * 2)) * Math.PI * 2;
  const elevation = (0.5 - HDRI_SUN_V_FROM_TOP) * Math.PI;
  const cosElevation = Math.cos(elevation);

  return new THREE.Vector3(
    Math.cos(longitude) * cosElevation,
    Math.sin(longitude) * cosElevation,
    Math.sin(elevation)
  ).normalize();
}

function alignDirectionalLightToHDRISun(light, target = new THREE.Vector3()) {
  if (!light) return;
  const sunDirection = getHDRISunDirection();
  light.target.position.copy(target);
  light.position.copy(target).addScaledVector(sunDirection, HDRI_SUN_LIGHT_DISTANCE);
  light.target.updateMatrixWorld();
  light.updateMatrixWorld();
  light.userData.hdriSunDirection = sunDirection.clone();
}

// Render the panorama on a camera-centred Z-up dome. The project uses Z as
// vertical, while THREE.Scene.background assumes Three.js' default Y-up
// equirectangular convention. A camera-following dome preserves the correct
// horizon/cloud proportions without creating a nearby physical "sky sphere".
const HDRI_FINITE_DOME_ENABLED = true;
const HDRI_FINITE_DOME_RADIUS = 120;
const GROUND_EXTENT_PADDING = 22;
const GROUND_EXTENT_MIN_SIZE = 50;
const GROUND_EXTENT_MAX_SIZE = 140;

function getMaxDevicePixelRatio() {
  const isMobile = window.matchMedia?.("(max-width: 900px), (pointer: coarse)")?.matches;
  return isMobile ? 1.25 : 1.75;
}

function applyRendererPixelRatio(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, getMaxDevicePixelRatio()));
}

function createRotatedEquirectangularTexture(renderer, sourceTexture, rotationZ) {
  // Equivalent to Blender: Texture Coordinate -> Mapping (Z rotation) -> Environment Texture.
  // Equirectangular longitude runs along U, so rotating around world Z becomes a U offset.
  // Keep the PMREM/custom-water source manageable. The visible dome still samples
  // the full 16K HDR directly, while reflections use a high-quality 4K copy.
  const sourceWidth = sourceTexture.image?.width || 4096;
  const sourceHeight = sourceTexture.image?.height || 2048;
  const width = Math.min(sourceWidth, 4096);
  const height = Math.min(sourceHeight, 2048);
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.ClampToEdgeWrapping
  });

  const rotationOffset = rotationZ / (Math.PI * 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      envTexture: { value: sourceTexture },
      rotationOffset: { value: rotationOffset }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D envTexture;
      uniform float rotationOffset;
      varying vec2 vUv;
      void main() {
        vec2 mappedUv = vec2(fract(vUv.x + rotationOffset), vUv.y);
        gl_FragColor = texture2D(envTexture, mappedUv);
      }
    `,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const tempScene = new THREE.Scene();
  const tempCamera = new THREE.Camera();
  tempScene.add(quad);

  const previousTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(renderTarget);
  renderer.clear();
  renderer.render(tempScene, tempCamera);
  renderer.setRenderTarget(previousTarget);

  quad.geometry.dispose();
  material.dispose();

  renderTarget.texture.mapping = THREE.EquirectangularReflectionMapping;
  renderTarget.texture.name = `Panorama rotated ${THREE.MathUtils.radToDeg(rotationZ)}deg`;
  return renderTarget;
}


function createFiniteHDRIDome(scene, panoramaTexture) {
  const oldDome = scene.userData.hdriFiniteDome;
  if (oldDome) {
    oldDome.parent?.remove(oldDome);
    oldDome.geometry?.dispose?.();
    oldDome.material?.dispose?.();
  }

  // A 40 x 24 sphere is visually smooth for an equirectangular panorama and
  // cheaper than the previous 64 x 40 mesh.
  const geometry = new THREE.SphereGeometry(HDRI_FINITE_DOME_RADIUS, 40, 24);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    uniforms: {
      panoramaTexture: { value: panoramaTexture },
      rotationOffset: { value: HDRI_ROTATION_Z / (Math.PI * 2) }
    },
    vertexShader: `
      varying vec3 vWorldDirection;
      void main() {
        // Use the sphere's local direction. The mesh follows the camera, so
        // translation must not alter the sampled panorama direction.
        vWorldDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D panoramaTexture;
      uniform float rotationOffset;
      varying vec3 vWorldDirection;
      const float PI = 3.141592653589793;
      void main() {
        vec3 dir = normalize(vWorldDirection);
        float u = fract(atan(dir.y, dir.x) / (2.0 * PI) + 0.5 + rotationOffset);
        float v = asin(clamp(dir.z, -1.0, 1.0)) / PI + 0.5;

        // Display the complete HDR panorama so the horizon and lower hemisphere
        // match the Poly Haven environment preview.
        vec3 hdrColor = texture2D(panoramaTexture, vec2(u, v)).rgb;
        gl_FragColor = vec4(hdrColor, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });

  const dome = new THREE.Mesh(geometry, material);
  dome.name = "Camera-centred compressed panorama dome";
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.onBeforeRender = (_renderer, _scene, camera) => {
    dome.position.copy(camera.position);
  };
  scene.add(dome);
  scene.userData.hdriFiniteDome = dome;
  return dome;
}

function computeGroundOuterRect(poolGroup, spaGroup = null, padding = GROUND_EXTENT_PADDING, minSize = GROUND_EXTENT_MIN_SIZE, maxSize = GROUND_EXTENT_MAX_SIZE) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const includePoint = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };

  const poolPts = poolGroup?.userData?.outerPts || [];
  for (const p of poolPts) includePoint(p.x, p.y);

  if (spaGroup) {
    const box = new THREE.Box3().setFromObject(spaGroup);
    if (!box.isEmpty()) {
      includePoint(box.min.x, box.min.y);
      includePoint(box.max.x, box.max.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    const half = minSize * 0.5;
    return { minX: -half, minY: -half, maxX: half, maxY: half };
  }

  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const sizeX = THREE.MathUtils.clamp((maxX - minX) + padding * 2, minSize, maxSize);
  const sizeY = THREE.MathUtils.clamp((maxY - minY) + padding * 2, minSize, maxSize);
  const halfX = sizeX * 0.5;
  const halfY = sizeY * 0.5;

  return {
    minX: centerX - halfX,
    minY: centerY - halfY,
    maxX: centerX + halfX,
    maxY: centerY + halfY
  };
}

function computeGroundCircle(poolGroup, spaGroup = null) {
  const rect = computeGroundOuterRect(poolGroup, spaGroup);
  const centerX = (rect.minX + rect.maxX) * 0.5;
  const centerY = (rect.minY + rect.maxY) * 0.5;
  const currentLargestDimension = Math.max(rect.maxX - rect.minX, rect.maxY - rect.minY);

  // Circle diameter is twice the previous ground's largest dimension.
  const radius = Math.max(1, currentLargestDimension);
  return { centerX, centerY, radius };
}

function loadCompressedSkyPanorama(scene, renderer) {
  if (scene.userData.skyPanoramaPromise) return scene.userData.skyPanoramaPromise;

  scene.userData.skyPanoramaPromise = new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      SKY_PANORAMA_URL,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.name = "Fast 4K visible sky panorama";

        if (HDRI_FINITE_DOME_ENABLED) {
          scene.background = null;
          createFiniteHDRIDome(scene, texture);
        } else {
          scene.background = texture;
        }

        if (scene.userData.skyDome) {
          const fallback = scene.userData.skyDome;
          fallback.parent?.remove(fallback);
          fallback.geometry?.dispose?.();
          fallback.material?.dispose?.();
          scene.userData.skyDome = null;
        }

        scene.userData.skyPanoramaTexture = texture;
        resolve(texture);
      },
      undefined,
      reject
    );
  });
  return scene.userData.skyPanoramaPromise;
}

function loadHDRITexture(scene) {
  if (scene.userData.hdriTexturePromise) return scene.userData.hdriTexturePromise;

  scene.userData.hdriTexturePromise = new Promise((resolve, reject) => {
    new RGBELoader()
      .setDataType(THREE.HalfFloatType)
      .load(
        HDRI_URL,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          texture.name = "Fast 2K HDR lighting panorama";
          resolve(texture);
        },
        undefined,
        reject
      );
  });

  return scene.userData.hdriTexturePromise;
}

async function applyCompressedEnvironment(scene, renderer, panoramaTexture) {
  if (cachedEnvironmentMap) {
    scene.environment = cachedEnvironmentMap;
    const reflectionTexture = cachedRotatedPanoramaTarget?.texture || panoramaTexture;
    window.__POOL_HDRI_TEXTURE = reflectionTexture;
    scene.traverse((object) => object?.userData?.setEnvironmentTex?.(reflectionTexture));
    return cachedEnvironmentMap;
  }

  // Rotate and prefilter the HDR panorama once. The full-resolution HDR supplies
  // the visible dome; a capped 4K half-float copy supplies PMREM and custom water.
  cachedRotatedPanoramaTarget ||= createRotatedEquirectangularTexture(
    renderer,
    panoramaTexture,
    HDRI_ROTATION_Z
  );
  const rotatedTexture = cachedRotatedPanoramaTarget.texture;

  sharedPMREMGenerator ||= new THREE.PMREMGenerator(renderer);
  sharedPMREMGenerator.compileEquirectangularShader();
  cachedEnvironmentMap = sharedPMREMGenerator.fromEquirectangular(rotatedTexture).texture;
  cachedEnvironmentMap.name = "Cached fast HDR PMREM";

  scene.environment = cachedEnvironmentMap;
  // Keep the existing global name so the original water implementation does
  // not need to be modified.
  window.__POOL_HDRI_TEXTURE = rotatedTexture;
  scene.traverse((object) => object?.userData?.setEnvironmentTex?.(rotatedTexture));

  scene.userData.hdriLoaded = true;
  console.info(`[Environment] Loaded fast HDR environment once: ${HDRI_URL}`);
  return cachedEnvironmentMap;
}

async function loadDeferredEnvironment(scene, renderer) {
  // The small 4K WebP becomes visible first. The 2K HDR then supplies PMREM,
  // material lighting and water reflections without blocking the initial view.
  const skyPromise = loadCompressedSkyPanorama(scene, renderer).catch((error) => {
    console.warn("[Environment] Fast sky panorama failed; keeping gradient fallback.", error);
    return null;
  });

  try {
    const hdriTexture = await loadHDRITexture(scene);

    // The WebP is only an immediate visual placeholder. Once the true HDR has
    // decoded, replace the dome texture with the HDR so the visible sky uses
    // the same exposure, highlight range and colour response as the previous
    // HDR-only version. This avoids leaving the separately tone-mapped WebP
    // visible after environment loading has completed.
    if (HDRI_FINITE_DOME_ENABLED) {
      const dome = scene.userData.hdriFiniteDome;
      const panoramaUniform = dome?.material?.uniforms?.panoramaTexture;
      if (panoramaUniform) {
        panoramaUniform.value = hdriTexture;
        dome.material.needsUpdate = true;
      } else {
        createFiniteHDRIDome(scene, hdriTexture);
      }
    } else {
      scene.background = hdriTexture;
    }
    scene.userData.skyPanoramaTexture = hdriTexture;

    const result = await applyCompressedEnvironment(scene, renderer, hdriTexture);
    await skyPromise;
    return result;
  } catch (error) {
    console.warn("[Environment] Fast HDR lighting failed; keeping the visible sky only.", error);
    await skyPromise;
    return null;
  }
}

const RAISED_SPA_CHANNEL_GAP = 0.15; // 150mm clear gap from spa outer wall
const RAISED_SPA_CHANNEL_WALL_OFFSET = 0.45; // inner face of channel wall sits 450mm off spa
const RAISED_SPA_THRESHOLD_Z = 0.05; // 50mm above pool/ground
const SPA_GROUND_CLIP_MARGIN_REDUCTION = 0.20; // shrink magenta XY clip by 100mm per active side
const SPA_THROAT_ALONG_PAD = 0.15; // extend yellow throat clip 100mm+ past spa extents along the wall
const SPA_THROAT_WIDTH_EXTRA = 0.10; // widen yellow throat clip by 100mm across the wall opening
const SPA_THROAT_SHELL_HALF_THICKNESS = 0.10; // spa shell is 200mm thick; include its outer face in throat width

// Independent debug controls for the two throat void boxes shown in the scene.
// Yellow = existing spa-top-referenced throat void.
const SPA_THROAT_DEBUG_YELLOW_COLOR = 0xffdd00;
const SPA_THROAT_DEBUG_YELLOW_DEPTH = 0.30;
const SPA_THROAT_DEBUG_YELLOW_BOTTOM_PAD = 0.01;
const SPA_THROAT_DEBUG_YELLOW_TOP_PAD = 0.01;

// Blue = duplicate throat void locked to pool wall height / coping underside.
const SPA_THROAT_DEBUG_BLUE_COLOR = 0x00b7ff;
const SPA_THROAT_DEBUG_BLUE_DEPTH = 0.30;
const SPA_THROAT_DEBUG_BLUE_BOTTOM_PAD = 0.050;
const SPA_THROAT_DEBUG_BLUE_TOP_PAD = 0.01;
const SPA_THROAT_DEBUG_BLUE_Z_LIFT = 0.10;

// Independent throat shortening along the wall (positive values shrink).
const SPA_THROAT_YELLOW_LENGTH_SHRINK = 0.08;
const SPA_THROAT_BLUE_LENGTH_SHRINK = 0.00;
const SPA_THROAT_BLUE_LENGTH_EXTRA = 0.035; // positive value extends blue throat further along wall

// Orange interior spa void debug box (separate from blue/yellow).
const SPA_INTERIOR_CLEAR_WALL_INSET_XY = 0.01;
const SPA_INTERIOR_CLEAR_EXTRA_INSET_XY = 0.00;
const SPA_INTERIOR_CLEAR_EXTRA_INSET_Z = 0.02;
const SPA_INTERIOR_CLEAR_DEBUG_COLOR = 0xff6600;
const SPA_CHANNEL_BRIDGE_EXTRA = 0.18; // extend pool-facing channel floor/walls 180mm total (100mm farther toward pool)
const SPA_CHANNEL_COPING_END_OVERHANG = 0.05; // coping extends 50mm past each channel end where the channel terminates at the pool
const CIRCULAR_CHANNEL_COPING_WIDTH = 0.25; // circular spa coping rebuild width (250mm)

function getPoolFootprintWorldPts(poolGroup) {
  const outerPts = poolGroup?.userData?.outerPts;
  if (!Array.isArray(outerPts) || !outerPts.length) return null;

  const sx = (poolGroup.scale && isFinite(poolGroup.scale.x)) ? poolGroup.scale.x : 1;
  const sy = (poolGroup.scale && isFinite(poolGroup.scale.y)) ? poolGroup.scale.y : 1;
  const px = (poolGroup.position && isFinite(poolGroup.position.x)) ? poolGroup.position.x : 0;
  const py = (poolGroup.position && isFinite(poolGroup.position.y)) ? poolGroup.position.y : 0;

  return outerPts.map((v) => ({ x: v.x * sx + px, y: v.y * sy + py }));
}

function getPoolFootprintBoundsWorld(poolGroup) {
  const pts = getPoolFootprintWorldPts(poolGroup);
  if (!pts?.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (!p) continue;
    const x = Number.isFinite(p.x) ? p.x : 0;
    const y = Number.isFinite(p.y) ? p.y : 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) return null;
  return { minX, maxX, minY, maxY };
}

function isPointInsidePolygon2D(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || 1e-9) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function isPointInsidePoolFootprint(poolGroup, point) {
  const poly = getPoolFootprintWorldPts(poolGroup);
  if (!poly) return false;
  return isPointInsidePolygon2D(point, poly);
}

function getOutsideIntervalsAlongSide(center, axisAlong, axisAcross, acrossLocal, alongMin, alongMax, poolGroup) {
  const poly = getPoolFootprintWorldPts(poolGroup);
  if (!poly) return [[alongMin, alongMax]];

  const origin = center.clone().add(axisAcross.clone().multiplyScalar(acrossLocal));
  const ox = origin.x;
  const oy = origin.y;
  const dx = axisAlong.x;
  const dy = axisAlong.y;
  const denomEps = 1e-9;
  const pointEps = 1e-5;
  const rangeEps = 1e-4;

  const tValues = [alongMin, alongMax];

  const addT = (t) => {
    if (!isFinite(t) || t < alongMin - rangeEps || t > alongMax + rangeEps) return;
    const clamped = Math.max(alongMin, Math.min(alongMax, t));
    if (!tValues.some((v) => Math.abs(v - clamped) < 1e-5)) tValues.push(clamped);
  };

  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const det = dx * (-ey) - dy * (-ex);

    if (Math.abs(det) < denomEps) continue;

    const rx = a.x - ox;
    const ry = a.y - oy;
    const t = (rx * (-ey) - ry * (-ex)) / det;
    const u = (dx * ry - dy * rx) / det;
    if (u >= -pointEps && u <= 1 + pointEps) addT(t);
  }

  tValues.sort((a, b) => a - b);

  const sampleOutside = (t) => {
    const p = {
      x: ox + dx * t,
      y: oy + dy * t
    };
    return !isPointInsidePolygon2D(p, poly);
  };

  const intervals = [];
  for (let i = 0; i < tValues.length - 1; i++) {
    const a = tValues[i];
    const b = tValues[i + 1];
    if (b - a <= rangeEps) continue;
    const mid = (a + b) * 0.5;
    if (sampleOutside(mid)) intervals.push([a, b]);
  }

  const startOutside = sampleOutside(alongMin + rangeEps);
  const endOutside = sampleOutside(alongMax - rangeEps);
  if (!intervals.length && (startOutside || endOutside)) return [[alongMin, alongMax]];

  return intervals;
}

function getSpaChannelMargin(spaGroup) {
  if (!spaGroup) return 0;
  return spaGroup?.userData?.channelEnabled ? RAISED_SPA_CHANNEL_WALL_OFFSET : 0;
}

function getSpaChannelMargins(spaGroup, poolGroup = null) {
  const channel = getSpaChannelMargin(spaGroup);
  const margins = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  if (!channel) return margins;
  if (!spaGroup || !poolGroup) {
    margins.minX = channel;
    margins.maxX = channel;
    margins.minY = channel;
    margins.maxY = channel;
    return margins;
  }

  const snapSide = spaGroup?.userData?.snapSide || null;
  const snapVariant = spaGroup?.userData?.snapVariant || null;
  const bounds = getPoolFootprintBoundsWorld(poolGroup);
  const spaBox = new THREE.Box3().setFromObject(spaGroup);
  const bridgeToPoolWall = {
    left: bounds ? Math.max(0, bounds.minX - spaBox.max.x) : 0,
    right: bounds ? Math.max(0, spaBox.min.x - bounds.maxX) : 0,
    front: bounds ? Math.max(0, bounds.minY - spaBox.max.y) : 0,
    back: bounds ? Math.max(0, spaBox.min.y - bounds.maxY) : 0
  };

  if (snapSide === 'left') {
    margins.minX = channel;
    margins.minY = channel;
    margins.maxY = channel;
    if (snapVariant === 'inner-wall-align') margins.maxX = Math.max(0, bridgeToPoolWall.left + SPA_CHANNEL_BRIDGE_EXTRA);
    return margins;
  }
  if (snapSide === 'right') {
    margins.maxX = channel;
    margins.minY = channel;
    margins.maxY = channel;
    if (snapVariant === 'inner-wall-align') margins.minX = Math.max(0, bridgeToPoolWall.right + SPA_CHANNEL_BRIDGE_EXTRA);
    return margins;
  }
  if (snapSide === 'front') {
    margins.minY = channel;
    margins.minX = channel;
    margins.maxX = channel;
    if (snapVariant === 'inner-wall-align') margins.maxY = Math.max(0, bridgeToPoolWall.front + SPA_CHANNEL_BRIDGE_EXTRA);
    return margins;
  }
  if (snapSide === 'back') {
    margins.maxY = channel;
    margins.minX = channel;
    margins.maxX = channel;
    if (snapVariant === 'inner-wall-align') margins.minY = Math.max(0, bridgeToPoolWall.back + SPA_CHANNEL_BRIDGE_EXTRA);
    return margins;
  }

  spaGroup.updateMatrixWorld?.(true);
  poolGroup.updateMatrixWorld?.(true);

  const center = new THREE.Vector3();
  spaGroup.getWorldPosition(center);

  const quat = new THREE.Quaternion();
  spaGroup.getWorldQuaternion(quat);

  const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(quat).normalize();
  const axisY = new THREE.Vector3(0, 1, 0).applyQuaternion(quat).normalize();

  const halfX = Math.max(0.005, (spaGroup.userData?.spaLength || 0.01) * 0.5);
  const halfY = Math.max(0.005, (spaGroup.userData?.spaWidth || 0.01) * 0.5);
  const sampleInset = 0.01;
  const sampleOut = 0.04;

  const isOutsidePool = (point) => !isPointInsidePoolFootprint(poolGroup, point);
  const samplePoint = (ax, dist) => center.clone().add(ax.clone().multiplyScalar(dist));

  if (isOutsidePool(samplePoint(axisX, -(halfX + sampleOut))) || isOutsidePool(samplePoint(axisX, -(halfX - sampleInset)))) margins.minX = channel;
  if (isOutsidePool(samplePoint(axisX, +(halfX + sampleOut))) || isOutsidePool(samplePoint(axisX, +(halfX - sampleInset)))) margins.maxX = channel;
  if (isOutsidePool(samplePoint(axisY, -(halfY + sampleOut))) || isOutsidePool(samplePoint(axisY, -(halfY - sampleInset)))) margins.minY = channel;
  if (isOutsidePool(samplePoint(axisY, +(halfY + sampleOut))) || isOutsidePool(samplePoint(axisY, +(halfY - sampleInset)))) margins.maxY = channel;

  return margins;
}

function getExpandedSpaWorldAABB(spaGroup, margins = null, pad = 0, marginReduction = 0) {
  if (!spaGroup) return null;

  spaGroup.updateMatrixWorld?.(true);

  const center = new THREE.Vector3();
  spaGroup.getWorldPosition(center);

  const quat = new THREE.Quaternion();
  spaGroup.getWorldQuaternion(quat);

  const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(quat).normalize();
  const axisY = new THREE.Vector3(0, 1, 0).applyQuaternion(quat).normalize();

  const halfX = Math.max(0.005, (spaGroup.userData?.spaLength || 0.01) * 0.5 + pad);
  const halfY = Math.max(0.005, (spaGroup.userData?.spaWidth || 0.01) * 0.5 + pad);
  const reducedMinX = Math.max(0, (margins?.minX || 0) - marginReduction);
  const reducedMaxX = Math.max(0, (margins?.maxX || 0) - marginReduction);
  const reducedMinY = Math.max(0, (margins?.minY || 0) - marginReduction);
  const reducedMaxY = Math.max(0, (margins?.maxY || 0) - marginReduction);

  const minX = -halfX - reducedMinX;
  const maxX =  halfX + reducedMaxX;
  const minY = -halfY - reducedMinY;
  const maxY =  halfY + reducedMaxY;

  const corners = [
    center.clone().add(axisX.clone().multiplyScalar(minX)).add(axisY.clone().multiplyScalar(minY)),
    center.clone().add(axisX.clone().multiplyScalar(minX)).add(axisY.clone().multiplyScalar(maxY)),
    center.clone().add(axisX.clone().multiplyScalar(maxX)).add(axisY.clone().multiplyScalar(minY)),
    center.clone().add(axisX.clone().multiplyScalar(maxX)).add(axisY.clone().multiplyScalar(maxY))
  ];

  const aabb = new THREE.Box3();
  corners.forEach((c) => aabb.expandByPoint(c));
  return { aabb, center, axisX, axisY, minX, maxX, minY, maxY };
}



function getAllPoolCopingMeshes(poolGroup) {
  if (!poolGroup) return [];

  // Pool builders do not all expose coping in the same shape-specific field:
  // rectangle/L/freeform use copingSegments, while oval/kidney use one
  // continuous copingMesh. Resolve every convention into one authoritative list
  // so elevation/channel/void code behaves identically for straight and curved
  // pools.
  const result = [];
  const seen = new Set();
  const addEntry = (entry) => {
    if (!entry) return;
    if (entry.isMesh && !seen.has(entry)) {
      seen.add(entry);
      result.push(entry);
    }
    entry.traverse?.((child) => {
      if (!child?.isMesh || seen.has(child)) return;
      if (child.userData?.isCoping || String(child.name || '').toLowerCase().includes('coping')) {
        seen.add(child);
        result.push(child);
      }
    });
  };

  const copingSegments = poolGroup.userData?.copingSegments;
  if (Array.isArray(copingSegments)) copingSegments.forEach(addEntry);
  else if (copingSegments && typeof copingSegments === 'object') Object.values(copingSegments).forEach(addEntry);

  // Continuous curved coping used by oval/kidney (and any future ring-based
  // pool implementation).
  addEntry(poolGroup.userData?.copingMesh);

  // Defensive fallback for custom/freeform or future builders. This also means
  // channel height never silently drops to ground simply because a builder used
  // a different userData property name.
  poolGroup.traverse?.((obj) => {
    if (!obj?.isMesh || seen.has(obj)) return;
    const name = String(obj.name || '').toLowerCase();
    if (obj.userData?.isCoping || obj.userData?.coping === true || name.includes('coping')) {
      seen.add(obj);
      result.push(obj);
    }
  });

  return result;
}

function buildBulletproofCopingMeshSet(poolGroup) {
  const set = new Set();
  const direct = getAllPoolCopingMeshes(poolGroup);

  // 1) Add direct coping segment refs and all descendant meshes.
  direct.forEach((entry) => {
    if (!entry) return;
    if (entry.isMesh) set.add(entry);
    entry.traverse?.((child) => {
      if (child?.isMesh) set.add(child);
    });
  });

  // 2) Fallback by naming / userData conventions.
  poolGroup?.traverse?.((obj) => {
    if (!obj?.isMesh) return;
    const n = String(obj.name || '').toLowerCase();
    if (n.includes('coping')) set.add(obj);
    if (obj.userData?.isCoping || obj.userData?.coping === true) set.add(obj);
  });

  // 3) Fallback by shared material identity with known coping segments.
  const copingMaterials = new Set();
  direct.forEach((entry) => {
    entry?.traverse?.((child) => {
      if (!child?.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => { if (m) copingMaterials.add(m); });
    });
    if (entry?.isMesh) {
      const mats = Array.isArray(entry.material) ? entry.material : [entry.material];
      mats.forEach((m) => { if (m) copingMaterials.add(m); });
    }
  });

  if (copingMaterials.size) {
    poolGroup?.traverse?.((obj) => {
      if (!obj?.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      if (mats.some((m) => copingMaterials.has(m))) set.add(obj);
    });
  }

  return set;
}

function shrinkThroatBoxAlongWall(throat, spaGroup, shrink = 0) {
  if (!throat) return null;

  const out = { ...throat };
  const amount = Math.max(0, shrink || 0);

  if (Number.isFinite(out.halfAlong)) {
    out.halfAlong = Math.max(0.005, out.halfAlong - amount);
    return out;
  }

  const snapSide = spaGroup?.userData?.snapSide || null;
  if (snapSide === 'left' || snapSide === 'right') {
    const maxShrink = Math.max(0, (out.maxY - out.minY - 0.01) * 0.5);
    const s = Math.min(amount, maxShrink);
    out.minY += s;
    out.maxY -= s;
  } else if (snapSide === 'front' || snapSide === 'back') {
    const maxShrink = Math.max(0, (out.maxX - out.minX - 0.01) * 0.5);
    const s = Math.min(amount, maxShrink);
    out.minX += s;
    out.maxX -= s;
  }

  return out;
}

function extendThroatBoxAlongWall(throat, spaGroup, extra = 0) {
  if (!throat) return null;

  const out = { ...throat };
  const amount = Math.max(0, extra || 0);

  if (Number.isFinite(out.halfAlong)) {
    out.halfAlong = Math.max(0.005, out.halfAlong + amount);
    return out;
  }

  const snapSide = spaGroup?.userData?.snapSide || null;
  if (snapSide === 'left' || snapSide === 'right') {
    out.minY -= amount;
    out.maxY += amount;
  } else if (snapSide === 'front' || snapSide === 'back') {
    out.minX -= amount;
    out.maxX += amount;
  }

  return out;
}

function getSpaInteriorClearBox(spaGroup) {
  if (!spaGroup) return null;
  // Force parent + descendant matrices current. The orange clip is world-space
  // and is refreshed during drag/elevation changes before a render frame may
  // otherwise propagate those transforms.
  spaGroup.updateWorldMatrix?.(true, true);

  const box = new THREE.Box3().setFromObject(spaGroup);
  if (!isFinite(box.min.x) || !isFinite(box.max.x)) return null;

  const insetXY = Math.max(0, SPA_INTERIOR_CLEAR_WALL_INSET_XY + SPA_INTERIOR_CLEAR_EXTRA_INSET_XY);
  const insetZ = Math.max(0, SPA_INTERIOR_CLEAR_EXTRA_INSET_Z);
  const minZ = box.min.z + insetZ;
  const maxZ = box.max.z - insetZ;
  if (!(maxZ > minZ)) return null;

  if (spaGroup?.userData?.spaShape === 'circular') {
    const center = new THREE.Vector3();
    spaGroup.getWorldPosition(center);
    const baseRadius = Math.max(0.01, (spaGroup.userData?.spaLength || spaGroup.userData?.spaWidth || 0.01) * 0.5);
    const radius = baseRadius - insetXY;
    if (!(radius > 0.01)) return null;
    return {
      shape: 'circular',
      centerX: center.x,
      centerY: center.y,
      radius,
      minZ,
      maxZ
    };
  }

  const minX = box.min.x + insetXY;
  const maxX = box.max.x - insetXY;
  const minY = box.min.y + insetXY;
  const maxY = box.max.y - insetXY;

  if (!(maxX > minX && maxY > minY)) return null;
  return { shape: 'rect', minX, maxX, minY, maxY, minZ, maxZ };
}

function getSpaPoolWallSamplePoint(poolGroup, spaGroup) {
  if (!spaGroup) return null;
  spaGroup.updateMatrixWorld?.(true);
  const quat = new THREE.Quaternion();
  spaGroup.getWorldQuaternion(quat);
  const center = new THREE.Vector3();
  spaGroup.getWorldPosition(center);
  const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(quat).normalize();
  const axisY = new THREE.Vector3(0, 1, 0).applyQuaternion(quat).normalize();
  const halfX = Math.max(0.005, (spaGroup.userData?.spaLength || 0.01) * 0.5);
  const halfY = Math.max(0.005, (spaGroup.userData?.spaWidth || 0.01) * 0.5);
  const snapSide = spaGroup?.userData?.snapSide || null;
  if (snapSide === 'left') return center.clone().add(axisX.multiplyScalar(-halfX));
  if (snapSide === 'right') return center.clone().add(axisX.multiplyScalar(halfX));
  if (snapSide === 'front') return center.clone().add(axisY.multiplyScalar(-halfY));
  if (snapSide === 'back') return center.clone().add(axisY.multiplyScalar(halfY));
  return center;
}

function getAdjacentPoolCopingBounds(poolGroup, spaGroup) {
  // Coping bounds must be read from the CURRENT world transforms. Pool elevation
  // can be changed immediately before the spa/channel rebuild; without forcing
  // parent + child matrices here, Box3 can see the old unraised coping datum and
  // build the entire channel lower by the full pool elevation.
  poolGroup?.updateWorldMatrix?.(true, true);
  spaGroup?.updateWorldMatrix?.(true, true);

  const copingMeshes = getAllPoolCopingMeshes(poolGroup);
  if (!copingMeshes.length) return null;

  const sample = getSpaPoolWallSamplePoint(poolGroup, spaGroup);
  let best = null;
  let bestDistSq = Infinity;

  for (const mesh of copingMeshes) {
    if (!mesh) continue;
    mesh.updateWorldMatrix?.(true, true);
    const box = new THREE.Box3().setFromObject(mesh);
    if (!isFinite(box.min.z) || !isFinite(box.max.z)) continue;

    if (!sample) {
      const zSpan = box.max.z - box.min.z;
      if (!best || zSpan > (best.max.z - best.min.z)) best = box.clone();
      continue;
    }

    const clampedX = Math.max(box.min.x, Math.min(sample.x, box.max.x));
    const clampedY = Math.max(box.min.y, Math.min(sample.y, box.max.y));
    const dx = sample.x - clampedX;
    const dy = sample.y - clampedY;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = box.clone();
    }
  }

  return best;
}

function getPoolCopingFallbackDatum(poolGroup) {
  if (!poolGroup) return { under: 0.0, top: 0.05 };
  poolGroup.updateWorldMatrix?.(true, true);
  const origin = new THREE.Vector3();
  poolGroup.getWorldPosition?.(origin);
  return { under: origin.z, top: origin.z + 0.05 };
}

function getPoolCopingUndersideZ(poolGroup, spaGroup) {
  const box = getAdjacentPoolCopingBounds(poolGroup, spaGroup);
  if (box && isFinite(box.min.z)) return box.min.z;
  return getPoolCopingFallbackDatum(poolGroup).under;
}

function getPoolCopingTopZ(poolGroup, spaGroup) {
  const box = getAdjacentPoolCopingBounds(poolGroup, spaGroup);
  if (box && isFinite(box.max.z)) return box.max.z;
  return getPoolCopingFallbackDatum(poolGroup).top;
}


function transformPoolPlanPointToWorld(poolGroup, point) {
  const p = point?.isVector2 ? point : new THREE.Vector2(Number(point?.x) || 0, Number(point?.y) || 0);
  const sx = (poolGroup?.scale && isFinite(poolGroup.scale.x)) ? poolGroup.scale.x : 1;
  const sy = (poolGroup?.scale && isFinite(poolGroup.scale.y)) ? poolGroup.scale.y : 1;
  const px = (poolGroup?.position && isFinite(poolGroup.position.x)) ? poolGroup.position.x : 0;
  const py = (poolGroup?.position && isFinite(poolGroup.position.y)) ? poolGroup.position.y : 0;
  return new THREE.Vector2(p.x * sx + px, p.y * sy + py);
}

function projectPointToSegment2D(point, a, b) {
  const ab = b.clone().sub(a);
  const lenSq = ab.lengthSq();
  if (lenSq <= 1e-10) return a.clone();
  let t = point.clone().sub(a).dot(ab) / lenSq;
  t = THREE.MathUtils.clamp(t, 0, 1);
  return a.clone().add(ab.multiplyScalar(t));
}

function getSpaWorldPlanAxes(spaGroup) {
  if (!spaGroup?.matrixWorld) {
    return {
      axisX: new THREE.Vector2(1, 0),
      axisY: new THREE.Vector2(0, 1)
    };
  }
  spaGroup.updateMatrixWorld?.(true);
  const e = spaGroup.matrixWorld.elements;
  const axisX = new THREE.Vector2(e[0], e[1]);
  const axisY = new THREE.Vector2(e[4], e[5]);
  if (axisX.lengthSq() <= 1e-10) axisX.set(1, 0);
  if (axisY.lengthSq() <= 1e-10) axisY.set(0, 1);
  axisX.normalize();
  axisY.normalize();
  return { axisX, axisY };
}

function getSpaWorldSnapEdge(poolGroup, spaGroup) {
  const edge = spaGroup?.userData?.snapEdge;
  if (!edge?.p0 || !edge?.p1) return null;

  const p0 = edge.worldSpace ? edge.p0.clone() : transformPoolPlanPointToWorld(poolGroup, edge.p0);
  const p1 = edge.worldSpace ? edge.p1.clone() : transformPoolPlanPointToWorld(poolGroup, edge.p1);
  const tangent = edge.worldSpace && edge?.tangent?.isVector2
    ? edge.tangent.clone().normalize()
    : p1.clone().sub(p0).normalize();
  const length = p0.distanceTo(p1);
  if (length <= 1e-6) return null;

  let normal = edge?.normal?.isVector2 ? edge.normal.clone() : null;
  if (!normal || normal.lengthSq() <= 1e-10) {
    normal = new THREE.Vector2(-tangent.y, tangent.x);
  }
  normal.normalize();

  return {
    p0,
    p1,
    tangent,
    normal,
    length
  };
}

function makeOrientedThroatVolume(poolGroup, spaGroup, pad = 0.01) {
  if (!spaGroup) return null;

  spaGroup.updateMatrixWorld?.(true);
  const spaCenter3 = new THREE.Vector3();
  spaGroup.getWorldPosition(spaCenter3);
  const spaCenter = new THREE.Vector2(spaCenter3.x, spaCenter3.y);
  const { axisX, axisY } = getSpaWorldPlanAxes(spaGroup);
  const snapSide = spaGroup?.userData?.snapSide || null;

  const halfX = Math.max(0.005, (spaGroup.userData?.spaLength || 0.01) * 0.5);
  const halfY = Math.max(0.005, (spaGroup.userData?.spaWidth || 0.01) * 0.5);

  let tangent = null;
  let normal = null;
  let spanAlong = Math.max(halfX, halfY);
  let edgePoint = spaCenter.clone();
  const snapEdge = getSpaWorldSnapEdge(poolGroup, spaGroup);
  const wallPoint = snapEdge ? projectPointToSegment2D(spaCenter, snapEdge.p0, snapEdge.p1) : null;

  // Authoritative path: when the spa is snapped to a real pool edge, use that
  // edge's tangent and inward normal for BOTH straight and curved pool walls.
  // Previously cardinal snapSide values forced world/spa X/Y axes here. That
  // made the throat look plausible on rectangles but rotated/mis-positioned it
  // on oval/kidney/freeform walls, and could also miss a straight wall after a
  // drag/resnap near a corner.
  if (snapEdge) {
    tangent = snapEdge.tangent.clone().normalize();
    normal = snapEdge.normal.clone().normalize();
    edgePoint = wallPoint ? wallPoint.clone() : projectPointToSegment2D(spaCenter, snapEdge.p0, snapEdge.p1);

    if (spaGroup?.userData?.spaShape === 'circular') {
      spanAlong = Math.max(halfX, halfY);
    } else {
      // Project the spa's LOCAL plan half-extents onto the actual wall tangent.
      // This remains correct if a future spa is rotated relative to world axes.
      spanAlong = Math.abs(tangent.dot(axisX)) * halfX + Math.abs(tangent.dot(axisY)) * halfY;
    }
  } else if (snapSide === 'left') {
    tangent = axisY.clone();
    normal = axisX.clone();
    spanAlong = halfY;
    edgePoint.add(axisX.clone().multiplyScalar(halfX));
  } else if (snapSide === 'right') {
    tangent = axisY.clone();
    normal = axisX.clone().multiplyScalar(-1);
    spanAlong = halfY;
    edgePoint.add(axisX.clone().multiplyScalar(-halfX));
  } else if (snapSide === 'front') {
    tangent = axisX.clone();
    normal = axisY.clone();
    spanAlong = halfX;
    edgePoint.add(axisY.clone().multiplyScalar(halfY));
  } else if (snapSide === 'back') {
    tangent = axisX.clone();
    normal = axisY.clone().multiplyScalar(-1);
    spanAlong = halfX;
    edgePoint.add(axisY.clone().multiplyScalar(-halfY));
  } else {
    return null;
  }

  tangent.normalize();
  normal.normalize();

  const insidePad = (0.05 + pad) * 3.0 + 0.30;
  const outsideDepth = (0.21 + pad) * 3.0;
  const alongPad = SPA_THROAT_ALONG_PAD + SPA_THROAT_WIDTH_EXTRA;

  // spaLength/spaWidth describe the main spa footprint while its structural
  // shell extends another 100mm each side. Include that outer shell in the
  // throat span, then retain the existing design clearance. This fixes the
  // opening horizontally rather than using an artificially deep blue clip.
  const halfAlong = Math.max(0.01, spanAlong + SPA_THROAT_SHELL_HALF_THICKNESS + alongPad);
  const halfDepth = Math.max(0.01, (insidePad + outsideDepth) * 0.5);
  const center2 = edgePoint.clone().add(normal.clone().multiplyScalar((insidePad - outsideDepth) * 0.5));
  const angle = Math.atan2(tangent.y, tangent.x);
  const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);

  return {
    center2,
    tangent,
    normal,
    halfAlong,
    halfDepth,
    quat
  };
}

function makeAabbFromOrientedVolume(volume) {
  if (!volume) return null;
  const t = volume.tangent.clone().multiplyScalar(volume.halfAlong);
  const n = volume.normal.clone().multiplyScalar(volume.halfDepth);
  const pts = [
    volume.center2.clone().add(t).add(n),
    volume.center2.clone().add(t).sub(n),
    volume.center2.clone().sub(t).add(n),
    volume.center2.clone().sub(t).sub(n)
  ];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

function makeClipPlanesFromOrientedVolume(volume, minZ, maxZ) {
  if (!volume) return null;
  const center3 = new THREE.Vector3(volume.center2.x, volume.center2.y, 0);
  const tangent3 = new THREE.Vector3(volume.tangent.x, volume.tangent.y, 0).normalize();
  const normal3 = new THREE.Vector3(volume.normal.x, volume.normal.y, 0).normalize();

  const pTNeg = center3.clone().addScaledVector(tangent3, -volume.halfAlong);
  const pTPos = center3.clone().addScaledVector(tangent3, volume.halfAlong);
  const pNNeg = center3.clone().addScaledVector(normal3, -volume.halfDepth);
  const pNPos = center3.clone().addScaledVector(normal3, volume.halfDepth);

  return [
    new THREE.Plane().setFromNormalAndCoplanarPoint(tangent3.clone().negate(), pTNeg),
    new THREE.Plane().setFromNormalAndCoplanarPoint(tangent3.clone(), pTPos),
    new THREE.Plane().setFromNormalAndCoplanarPoint(normal3.clone().negate(), pNNeg),
    new THREE.Plane().setFromNormalAndCoplanarPoint(normal3.clone(), pNPos),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), minZ),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -maxZ)
  ];
}


function createDebugTransparentMaterial(color, opacity = 0.22) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide
  });
}

function ensureSpaDebugGroup(scene) {
  if (!scene) return null;
  if (scene.userData?.spaVoidDebugGroup) return scene.userData.spaVoidDebugGroup;
  const group = new THREE.Group();
  group.name = 'SpaVoidDebugGroup';
  scene.add(group);
  scene.userData = scene.userData || {};
  scene.userData.spaVoidDebugGroup = group;
  return group;
}

function clearSpaDebugGroup(scene) {
  const group = scene?.userData?.spaVoidDebugGroup;
  if (!group) return;
  while (group.children.length) {
    const child = group.children.pop();
    child.geometry?.dispose?.();
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((m) => m?.dispose?.());
    group.remove(child);
  }
}

function addDebugBox(group, sizeX, sizeY, sizeZ, worldCenter, quat, color, name) {
  if (!group || !(sizeX > 1e-4) || !(sizeY > 1e-4) || !(sizeZ > 1e-4)) return;
  const fill = new THREE.Mesh(
    new THREE.BoxGeometry(sizeX, sizeY, sizeZ),
    createDebugTransparentMaterial(color, 0.18)
  );
  fill.position.copy(worldCenter);
  if (quat) fill.quaternion.copy(quat);
  fill.renderOrder = 999;
  fill.name = name;
  group.add(fill);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(sizeX, sizeY, sizeZ)),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
  );
  edges.position.copy(worldCenter);
  if (quat) edges.quaternion.copy(quat);
  edges.renderOrder = 1000;
  edges.name = `${name}_edges`;
  group.add(edges);
}


function addDebugCircularDisc(group, radius, worldCenter, quat, color, name, opacity = 0.18, radialSegments = 96) {
  if (!group || !(radius > 1e-4)) return;
  const geo = new THREE.CircleGeometry(radius, radialSegments);
  const mesh = new THREE.Mesh(geo, createDebugTransparentMaterial(color, opacity));
  mesh.position.copy(worldCenter);
  if (quat) mesh.quaternion.copy(quat);
  mesh.renderOrder = 999;
  mesh.name = name;
  group.add(mesh);

  const edgeGeo = new THREE.EdgesGeometry(geo);
  const edges = new THREE.LineSegments(
    edgeGeo,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
  );
  edges.position.copy(worldCenter);
  if (quat) edges.quaternion.copy(quat);
  edges.renderOrder = 1000;
  edges.name = `${name}_edges`;
  group.add(edges);
}

function addDebugCircularRing(group, innerRadius, outerRadius, worldCenter, quat, color, name, opacity = 0.18, radialSegments = 96) {
  if (!group || !(outerRadius > innerRadius) || !(outerRadius > 1e-4)) return;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, Math.max(0.0001, innerRadius), 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape, radialSegments);
  const mesh = new THREE.Mesh(geo, createDebugTransparentMaterial(color, opacity));
  mesh.position.copy(worldCenter);
  if (quat) mesh.quaternion.copy(quat);
  mesh.renderOrder = 999;
  mesh.name = name;
  group.add(mesh);

  const outerPts = [];
  const innerPts = [];
  for (let i = 0; i <= radialSegments; i++) {
    const a = (i / radialSegments) * Math.PI * 2;
    outerPts.push(new THREE.Vector3(Math.cos(a) * outerRadius, Math.sin(a) * outerRadius, 0));
    innerPts.push(new THREE.Vector3(Math.cos(a) * innerRadius, Math.sin(a) * innerRadius, 0));
  }
  for (const [pts, suffix] of [[outerPts, 'outer'], [innerPts, 'inner']]) {
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    line.position.copy(worldCenter);
    if (quat) line.quaternion.copy(quat);
    line.renderOrder = 1000;
    line.name = `${name}_${suffix}`;
    group.add(line);
  }
}

function addDebugCylinder(group, radius, height, worldCenter, quat, color, name, opacity = 0.18, radialSegments = 96) {
  if (!group || !(radius > 1e-4) || !(height > 1e-4)) return;
  const geo = new THREE.CylinderGeometry(radius, radius, height, radialSegments, 1, false);
  geo.rotateX(Math.PI * 0.5);
  const mesh = new THREE.Mesh(geo, createDebugTransparentMaterial(color, opacity));
  mesh.position.copy(worldCenter);
  if (quat) mesh.quaternion.copy(quat);
  mesh.renderOrder = 999;
  mesh.name = name;
  group.add(mesh);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
  );
  edges.position.copy(worldCenter);
  if (quat) edges.quaternion.copy(quat);
  edges.renderOrder = 1000;
  edges.name = `${name}_edges`;
  group.add(edges);
}

function addDebugPoolVoidMesh(group, holePts, groundZ = 0) {
  if (!group || !Array.isArray(holePts) || holePts.length < 3) return;
  const shape = new THREE.Shape(holePts);
  const geo = new THREE.ShapeGeometry(shape);
  const mesh = new THREE.Mesh(geo, createDebugTransparentMaterial(0x00d0ff, 0.16));
  mesh.position.z = groundZ + 0.003;
  mesh.renderOrder = 998;
  mesh.name = 'PoolVoidDebug';
  group.add(mesh);

  const pts = [...holePts, holePts[0]].map((v) => new THREE.Vector3(v.x, v.y, groundZ + 0.01));
  const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x00d0ff, transparent: true, opacity: 0.95 }));
  line.renderOrder = 1001;
  line.name = 'PoolVoidDebugOutline';
  group.add(line);
}

function updateSpaVoidDebug(scene, ground, poolGroup, spaGroup, holePts = null) {
  if (!ENABLE_SPA_DEBUG_VOIDS && !ENABLE_ORANGE_INTERIOR_DEBUG) {
    clearSpaDebugGroup(scene || ground?.parent);
    return;
  }
  const group = ensureSpaDebugGroup(scene || ground?.parent);
  if (!group) return;
  clearSpaDebugGroup(scene || ground?.parent);

  const debugScene = scene || ground?.parent;
  const groundZ = ground?.position?.z ?? 0;

  if (ENABLE_SPA_DEBUG_VOIDS) {
    // 1) Pool footprint void (cyan)
    if (holePts?.length) addDebugPoolVoidMesh(group, holePts, groundZ);
  }

  if (!spaGroup) return;

  spaGroup.updateMatrixWorld?.(true);
  const quat = new THREE.Quaternion();
  spaGroup.getWorldQuaternion(quat);
  const center = new THREE.Vector3();
  spaGroup.getWorldPosition(center);
  const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(quat).normalize();
  const axisY = new THREE.Vector3(0, 1, 0).applyQuaternion(quat).normalize();

  if (ENABLE_SPA_DEBUG_VOIDS) {
  // 2) Ground material spa clip region (magenta)
  const margins = getSpaChannelMargins(spaGroup, poolGroup);
  const expanded = getExpandedSpaWorldAABB(spaGroup, margins, 0.02, SPA_GROUND_CLIP_MARGIN_REDUCTION);
  if (expanded) {
    const offsetX = (expanded.maxX + expanded.minX) * 0.5;
    const offsetY = (expanded.maxY + expanded.minY) * 0.5;
    const clipCenter = expanded.center.clone()
      .add(expanded.axisX.clone().multiplyScalar(offsetX))
      .add(expanded.axisY.clone().multiplyScalar(offsetY));
    const debugCenter = new THREE.Vector3(clipCenter.x, clipCenter.y, groundZ + 0.015);
    if (spaGroup?.userData?.spaShape === 'circular') {
      const clipRadius = Math.max(0.01, (spaGroup.userData?.spaLength || 0.01) * 0.5 + Math.max(margins.minX, margins.maxX, margins.minY, margins.maxY) - SPA_GROUND_CLIP_MARGIN_REDUCTION + 0.02);
      addDebugCircularDisc(group, clipRadius, debugCenter, quat, 0xff00aa, 'SpaGroundClipDebug');
    } else {
      addDebugBox(
        group,
        Math.max(0.01, expanded.maxX - expanded.minX),
        Math.max(0.01, expanded.maxY - expanded.minY),
        0.03,
        debugCenter,
        quat,
        0xff00aa,
        'SpaGroundClipDebug'
      );
    }
  }

  // 3) Pool throat / wall clip region (yellow + blue with independent length shrink)
  const clipVolumes = getSpaClipVolumes(poolGroup, spaGroup, 0.01);
  if (clipVolumes) {
    const {
      yellowClipBox,
      blueClipBox,
      yellowMinZ,
      yellowMaxZ,
      blueMinZ,
      blueMaxZ
    } = clipVolumes;

    const yellowCenter = clipVolumes.yellowOriented
      ? new THREE.Vector3(clipVolumes.yellowOriented.center2.x, clipVolumes.yellowOriented.center2.y, (yellowMinZ + yellowMaxZ) * 0.5)
      : new THREE.Vector3(
          (yellowClipBox.minX + yellowClipBox.maxX) * 0.5,
          (yellowClipBox.minY + yellowClipBox.maxY) * 0.5,
          (yellowMinZ + yellowMaxZ) * 0.5
        );
    addDebugBox(
      group,
      clipVolumes.yellowOriented ? Math.max(0.01, clipVolumes.yellowOriented.halfAlong * 2) : Math.max(0.01, yellowClipBox.maxX - yellowClipBox.minX),
      clipVolumes.yellowOriented ? Math.max(0.01, clipVolumes.yellowOriented.halfDepth * 2) : Math.max(0.01, yellowClipBox.maxY - yellowClipBox.minY),
      Math.max(0.01, yellowMaxZ - yellowMinZ),
      yellowCenter,
      clipVolumes.yellowOriented ? clipVolumes.yellowOriented.quat : null,
      SPA_THROAT_DEBUG_YELLOW_COLOR,
      'SpaThroatClipDebug'
    );

    const blueCenter = clipVolumes.blueOriented
      ? new THREE.Vector3(clipVolumes.blueOriented.center2.x, clipVolumes.blueOriented.center2.y, (blueMinZ + blueMaxZ) * 0.5)
      : new THREE.Vector3(
          (blueClipBox.minX + blueClipBox.maxX) * 0.5,
          (blueClipBox.minY + blueClipBox.maxY) * 0.5,
          (blueMinZ + blueMaxZ) * 0.5
        );
    addDebugBox(
      group,
      clipVolumes.blueOriented ? Math.max(0.01, clipVolumes.blueOriented.halfAlong * 2) : Math.max(0.01, blueClipBox.maxX - blueClipBox.minX),
      clipVolumes.blueOriented ? Math.max(0.01, clipVolumes.blueOriented.halfDepth * 2) : Math.max(0.01, blueClipBox.maxY - blueClipBox.minY),
      Math.max(0.01, blueMaxZ - blueMinZ),
      blueCenter,
      clipVolumes.blueOriented ? clipVolumes.blueOriented.quat : null,
      SPA_THROAT_DEBUG_BLUE_COLOR,
      'SpaThroatClipDebugUnderCoping'
    );
  }
  }

  if (ENABLE_ORANGE_INTERIOR_DEBUG) {
    const interiorClear = getSpaInteriorClearBox(spaGroup);
    if (interiorClear) {
      if (spaGroup?.userData?.spaShape === 'circular') {
        const interiorCenter = new THREE.Vector3(
          interiorClear.centerX,
          interiorClear.centerY,
          (interiorClear.minZ + interiorClear.maxZ) * 0.5
        );
        addDebugCylinder(group, Math.max(0.01, interiorClear.radius), Math.max(0.01, interiorClear.maxZ - interiorClear.minZ), interiorCenter, quat, SPA_INTERIOR_CLEAR_DEBUG_COLOR, 'SpaInteriorClearDebug');
      } else {
        const interiorCenter = new THREE.Vector3(
          (interiorClear.minX + interiorClear.maxX) * 0.5,
          (interiorClear.minY + interiorClear.maxY) * 0.5,
          (interiorClear.minZ + interiorClear.maxZ) * 0.5
        );
        addDebugBox(
          group,
          Math.max(0.01, interiorClear.maxX - interiorClear.minX),
          Math.max(0.01, interiorClear.maxY - interiorClear.minY),
          Math.max(0.01, interiorClear.maxZ - interiorClear.minZ),
          interiorCenter,
          null,
          SPA_INTERIOR_CLEAR_DEBUG_COLOR,
          'SpaInteriorClearDebug'
        );
      }
    }
  }

  // 4) Actual spa body extents (green) for reference only
  const spaBox = new THREE.Box3().setFromObject(spaGroup);
  const spaSize = spaBox.getSize(new THREE.Vector3());
  const spaCenter = spaBox.getCenter(new THREE.Vector3());
  if (ENABLE_SPA_DEBUG_VOIDS) addDebugBox(group, spaSize.x, spaSize.y, Math.max(0.01, spaSize.z), spaCenter, quat, 0x00ff66, 'SpaBodyDebug');
}

function disposeObject3D(obj) {
  if (!obj) return;
  obj.traverse?.((child) => {
    if (child?.geometry) child.geometry.dispose?.();
    const mats = Array.isArray(child?.material) ? child.material : [child?.material];
    mats.forEach((m) => m?.dispose?.());
  });
}

function clearSpaChannelMeshes(ground) {
  const parent = ground?.parent;
  const group = ground?.userData?.spaChannelGroup;
  const waterGroup = ground?.userData?.spaChannelWaterGroup;
  if (group && parent) parent.remove(group);
  if (waterGroup && parent) parent.remove(waterGroup);
  disposeObject3D(group);
  disposeObject3D(waterGroup);
  if (ground?.userData) {
    ground.userData.spaChannelGroup = null;
    ground.userData.spaChannelWaterGroup = null;
  }
}

function isDescendantOf(obj, ancestor) {
  let cur = obj;
  while (cur) {
    if (cur === ancestor) return true;
    cur = cur.parent || null;
  }
  return false;
}

export function purgeDetachedSpaChannelArtifacts(scene, activeGroup = null, activeWaterGroup = null) {
  if (!scene?.traverse) return;
  const staleMeshes = [];
  const staleGroups = [];
  scene.traverse((obj) => {
    if (obj?.userData?.isSpaChannel) {
      if (!activeGroup || !isDescendantOf(obj, activeGroup)) staleMeshes.push(obj);
    }
    if (obj?.userData?.isSpaChannelWater) {
      if (!activeWaterGroup || !isDescendantOf(obj, activeWaterGroup)) staleMeshes.push(obj);
    }
    if (obj?.type === 'Group' && obj?.name === 'SpaChannelGroup' && obj !== activeGroup) {
      staleGroups.push(obj);
    }
    if (obj?.type === 'Group' && obj?.name === 'SpaChannelWaterGroup' && obj !== activeWaterGroup) {
      staleGroups.push(obj);
    }
  });

  staleMeshes.forEach((obj) => {
    obj.parent?.remove?.(obj);
    obj.geometry?.dispose?.();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => m?.dispose?.());
  });

  staleGroups.forEach((group) => {
    group.parent?.remove?.(group);
    disposeObject3D(group);
  });
}

function generateMeterUVsForBoxGeometry(geo, tileSize = 0.3) {
  const pos = geo?.attributes?.position;
  const nrm = geo?.attributes?.normal;
  if (!pos || !nrm) return;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(nrm.getX(i));
    const ay = Math.abs(nrm.getY(i));
    const az = Math.abs(nrm.getZ(i));
    let u = 0, v = 0;
    if (az >= ax && az >= ay) {
      u = x / tileSize;
      v = y / tileSize;
    } else if (ay >= ax && ay >= az) {
      u = x / tileSize;
      v = z / tileSize;
    } else {
      u = y / tileSize;
      v = z / tileSize;
    }
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (!geo.attributes.uv2) geo.setAttribute('uv2', new THREE.BufferAttribute(uvs.slice(), 2));
}

function generateMeterUVsForCircularDiscGeometry(geo, tileSize = 0.3) {
  const pos = geo?.attributes?.position;
  if (!pos) return;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const usePlanar = Math.abs(z) <= Math.abs(y);
    uvs[i * 2] = x / tileSize;
    uvs[i * 2 + 1] = (usePlanar ? y : z) / tileSize;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (!geo.attributes.uv2) geo.setAttribute('uv2', new THREE.BufferAttribute(uvs.slice(), 2));
}

function generateMeterUVsForCircularRingGeometry(geo, tileSize = 0.3) {
  let target = geo;
  if (target?.index) target = target.toNonIndexed();
  const pos = target?.attributes?.position;
  const nrm = target?.attributes?.normal;
  if (!pos || !nrm) return target;

  const uvs = new Float32Array(pos.count * 2);

  for (let i = 0; i < pos.count; i += 3) {
    const tri = [];
    for (let k = 0; k < 3; k++) {
      const idx = i + k;
      const x = pos.getX(idx);
      const y = pos.getY(idx);
      const z = pos.getZ(idx);
      const ax = Math.abs(nrm.getX(idx));
      const ay = Math.abs(nrm.getY(idx));
      const az = Math.abs(nrm.getZ(idx));

      if (az >= ax && az >= ay) {
        tri.push({ idx, u: x / tileSize, v: y / tileSize, side: false });
      } else {
        let angle = Math.atan2(y, x);
        if (angle < 0) angle += Math.PI * 2;
        const radius = Math.sqrt(x * x + y * y);
        tri.push({ idx, angle, radius, v: z / tileSize, side: true });
      }
    }

    const sideVerts = tri.filter((v) => v.side);
    if (sideVerts.length) {
      const minA = Math.min(...sideVerts.map((v) => v.angle));
      const maxA = Math.max(...sideVerts.map((v) => v.angle));
      if ((maxA - minA) > Math.PI) {
        sideVerts.forEach((v) => {
          if (v.angle < Math.PI) v.angle += Math.PI * 2;
        });
      }
      sideVerts.forEach((v) => {
        v.u = (v.angle * v.radius) / tileSize;
      });
    }

    tri.forEach((v) => {
      uvs[v.idx * 2] = v.u;
      uvs[v.idx * 2 + 1] = v.v;
    });
  }

  target.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (!target.attributes.uv2) target.setAttribute('uv2', new THREE.BufferAttribute(uvs.slice(), 2));
  return target;
}

function createSpaChannelMaterial(spaGroup, poolGroup = null) {
  // Prefer the live pool interior material so a rebuilt spa channel always
  // matches the selected pool finish. Fall back to the spa material only when
  // the pool floor is not available.
  const source = poolGroup?.userData?.floorMesh?.material || spaGroup?.userData?.floor?.material || spaGroup?.userData?.walls?.front?.material || null;
  if (source?.clone) {
    const cloned = source.clone();
    cloned.transparent = false;
    cloned.opacity = 1;
    return cloned;
  }
  return new THREE.MeshStandardMaterial({
    color: 0xa9bcc8,
    roughness: 0.85,
    metalness: 0.0
  });
}

function createCopingRebuildMaterial(poolGroup) {
  const source = poolGroup?.userData?.copingSegments?.[0]?.material || null;
  if (source?.clone) {
    const cloned = source.clone();
    cloned.transparent = false;
    cloned.opacity = 1;
    return cloned;
  }
  return new THREE.MeshStandardMaterial({
    color: 0xe5e0d8,
    roughness: 0.9,
    metalness: 0.0
  });
}

function getForcedSpaChannelFullSpanSides(spaGroup) {
  const snapSide = spaGroup?.userData?.snapSide || null;
  if (snapSide === 'left') return new Set(['minX', 'minY', 'maxY']);
  if (snapSide === 'right') return new Set(['maxX', 'minY', 'maxY']);
  if (snapSide === 'front') return new Set(['minY', 'minX', 'maxX']);
  if (snapSide === 'back') return new Set(['maxY', 'minX', 'maxX']);
  return new Set();
}

function sanitizeSpaChannelMaterial(material) {
  if (!material) return material;
  const sectionPlane = material.userData?.__sectionVoidPlane || null;
  const sectionActive = !!(sectionPlane && material.userData?.__sectionVoidPrevClipping);
  if (sectionActive) {
    material.userData.__sectionVoidPrevClipping = [];
    material.clippingPlanes = [sectionPlane];
  } else {
    material.clippingPlanes = null;
  }
  material.clipIntersection = false;
  material.clipShadows = sectionActive ? true : false;
  if (material.userData?.orangeInteriorClipUniforms) {
    const uniforms = material.userData.orangeInteriorClipUniforms;
    uniforms.orangeInteriorClipEnabled.value = 0;
    uniforms.orangeInteriorClipShape.value = 0;
    uniforms.orangeInteriorClipRadius.value = 0;
  }
  material.needsUpdate = true;
  return material;
}

function addChannelBox(group, sizeX, sizeY, sizeZ, localX, localY, center, axisX, axisY, quat, material, zCenter, tileSize = 0.3, part = 'wall') {
  if (!(sizeX > 1e-4 && sizeY > 1e-4 && sizeZ > 1e-4)) return;
  const geo = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
  generateMeterUVsForBoxGeometry(geo, tileSize);
  const mesh = new THREE.Mesh(geo, sanitizeSpaChannelMaterial(material.clone()));
  const worldPos = center.clone().add(axisX.clone().multiplyScalar(localX)).add(axisY.clone().multiplyScalar(localY));
  mesh.position.set(worldPos.x, worldPos.y, zCenter); mesh.quaternion.copy(quat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.isSpaChannel = true; mesh.userData.spaChannelPart = part; group.add(mesh);
}
function createCircularArcBandShape(innerRadius, outerRadius, startAngle, endAngle) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, Math.max(0.01, outerRadius), startAngle, endAngle, false);
  shape.absarc(0, 0, Math.max(0.005, innerRadius), endAngle, startAngle, true);
  shape.closePath();
  return shape;
}
function addCircularChannelExtrude(group, shape, depth, localZ, center, quat, material, tileSize = 0.3, part = 'wall') {
  if (!group || !shape || !(depth > 1e-4)) return;
  const baseGeo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 48 }); baseGeo.computeVertexNormals();
  const geo = generateMeterUVsForCircularRingGeometry(baseGeo, tileSize);
  const mesh = new THREE.Mesh(geo, sanitizeSpaChannelMaterial(material.clone())); mesh.position.set(center.x, center.y, localZ); mesh.quaternion.copy(quat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.isSpaChannel = true; mesh.userData.spaChannelPart = part; group.add(mesh);
}

function createSpaChannelWaterMesh(geometry) {
  const water = createPoolWater(geometry);
  water.userData.isSpaChannelWater = true;
  return water;
}

function addChannelWaterPlane(group, sizeX, sizeY, localX, localY, center, axisX, axisY, quat, zWorld) {
  if (!group || !(sizeX > 1e-4 && sizeY > 1e-4)) return;
  const segX = Math.max(12, Math.ceil(sizeX * 24));
  const segY = Math.max(12, Math.ceil(sizeY * 24));
  const geo = new THREE.PlaneGeometry(sizeX, sizeY, segX, segY);
  const mesh = createSpaChannelWaterMesh(geo);
  const worldPos = center.clone().add(axisX.clone().multiplyScalar(localX)).add(axisY.clone().multiplyScalar(localY));
  mesh.position.set(worldPos.x, worldPos.y, zWorld + 0.001);
  mesh.quaternion.copy(quat);
  group.add(mesh);
}

function addCircularChannelWaterArc(group, innerRadius, outerRadius, startAngle, endAngle, center, quat, zWorld) {
  if (!group || !(outerRadius > innerRadius)) return;
  const thetaLength = Math.max(0.01, endAngle - startAngle);
  const geo = new THREE.RingGeometry(Math.max(0.01, innerRadius), Math.max(0.02, outerRadius), 96, 12, startAngle, thetaLength);
  const mesh = createSpaChannelWaterMesh(geo);
  mesh.position.set(center.x, center.y, zWorld + 0.001);
  mesh.quaternion.copy(quat);
  group.add(mesh);
}

function updateSpaChannelMeshes(ground, poolGroup, spaGroup) {
  if (!ground || !poolGroup || !spaGroup) {
    clearSpaChannelMeshes(ground);
    return;
  }

  // Synchronise transforms before deriving any channel Z datum. This is critical
  // after raising/lowering the whole pool because the channel is generated in
  // world coordinates rather than as a child of the pool group.
  poolGroup.updateWorldMatrix?.(true, true);
  spaGroup.updateWorldMatrix?.(true, true);

  const channelEnabled = !!(spaGroup.userData?.channelEnabled || spaGroup.userData?.isHalfwayInWall);
  if (!channelEnabled) {
    clearSpaChannelMeshes(ground);
    return;
  }

  const margins = getSpaChannelMargins(spaGroup, poolGroup);
  if (!(margins.minX > 0 || margins.maxX > 0 || margins.minY > 0 || margins.maxY > 0)) {
    clearSpaChannelMeshes(ground);
    return;
  }

  spaGroup.updateMatrixWorld?.(true);
  const quat = new THREE.Quaternion();
  spaGroup.getWorldQuaternion(quat);
  const center = new THREE.Vector3();
  spaGroup.getWorldPosition(center);
  const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(quat).normalize();
  const axisY = new THREE.Vector3(0, 1, 0).applyQuaternion(quat).normalize();
  const halfX = Math.max(0.005, (spaGroup.userData?.spaLength || 0.01) * 0.5);
  const halfY = Math.max(0.005, (spaGroup.userData?.spaWidth || 0.01) * 0.5);

  const minX = -halfX - (margins.minX || 0);
  const maxX =  halfX + (margins.maxX || 0);
  const minY = -halfY - (margins.minY || 0);
  const maxY =  halfY + (margins.maxY || 0);

  const snapSide = spaGroup.userData?.snapSide || null;
  const snapVariant = spaGroup.userData?.snapVariant || null;
  const suppressPoolFacingBridgeWall = snapVariant === 'inner-wall-align';

  const copingUnderZ = getPoolCopingUndersideZ(poolGroup, spaGroup);
  const copingTopZ = getPoolCopingTopZ(poolGroup, spaGroup);
  const copingDepth = Math.max(0.05, copingTopZ - copingUnderZ);
  const channelFloorTopZ = copingTopZ - 0.3;
  const channelFloorThickness = 0.02;

  // Keep the original channel floor, water and upper wall geometry at their
  // established elevations. Only add a separate lower wall extension from the
  // channel-floor underside down to the unchanged ground plane.
  const wallHeight = Math.max(0.02, copingUnderZ - channelFloorTopZ);
  ground.updateWorldMatrix?.(true, false);
  const groundBounds = new THREE.Box3().setFromObject(ground);
  const groundTopZ = Number.isFinite(groundBounds.max.z) ? groundBounds.max.z : 0;
  const lowerWallBottomZ = Math.min(channelFloorTopZ, groundTopZ);
  const lowerWallHeight = Math.max(0, channelFloorTopZ - lowerWallBottomZ);
  const wallThickness = 0.20;
  const copingRebuildWidth = 0.25;
  const tileSize = spaGroup?.userData?.tileSize || poolGroup?.userData?.tileSize || 0.3;
  const waterLevelZ = copingUnderZ - 0.10;

  clearSpaChannelMeshes(ground);
  const group = new THREE.Group();
  group.name = 'SpaChannelGroup';
  const waterGroup = new THREE.Group();
  waterGroup.name = 'SpaChannelWaterGroup';

  // Channel geometry is generated from current world-space pool/spa positions.
  // Record the elevation already represented in those coordinates so the parent
  // app does not apply the raised-pool offset a second time after a spa rebuild.
  const representedElevation = Number(poolGroup?.userData?.poolElevationApplied) || 0;
  group.userData.poolElevationApplied = representedElevation;
  group.userData.poolElevationLastZ = group.position.z;
  waterGroup.userData.poolElevationApplied = representedElevation;
  waterGroup.userData.poolElevationLastZ = waterGroup.position.z;
  const mat = createSpaChannelMaterial(spaGroup, poolGroup);
  const copingMat = createCopingRebuildMaterial(poolGroup);
  const floorZCenter = channelFloorTopZ - channelFloorThickness * 0.5;
  const wallZCenter = channelFloorTopZ + wallHeight * 0.5;
  const lowerWallZCenter = lowerWallBottomZ + lowerWallHeight * 0.5;
  const copingZCenter = copingUnderZ + copingDepth * 0.5;

  if (spaGroup?.userData?.spaShape === 'circular') {
    const radius = Math.max(0.05, (spaGroup.userData?.spaLength || 0.1) * 0.5);
    const channelMargin = Math.max(margins.minX, margins.maxX, margins.minY, margins.maxY, 0.2);
    const outerRadius = radius + channelMargin;
    const wallInnerRadius = Math.max(radius, outerRadius - wallThickness);
    const copingInnerRadius = Math.max(radius, outerRadius - Math.min(channelMargin, CIRCULAR_CHANNEL_COPING_WIDTH));
    const radialMid = radius + channelMargin * 0.5;
    const segments = 96;
    const step = (Math.PI * 2) / segments;
    const isOutsideAtAngle = (angle) => {
      const localX = Math.cos(angle) * radialMid;
      const localY = Math.sin(angle) * radialMid;
      const worldPoint = center.clone()
        .add(axisX.clone().multiplyScalar(localX))
        .add(axisY.clone().multiplyScalar(localY));
      return !isPointInsidePoolFootprint(poolGroup, worldPoint);
    };

    let arcStart = null;
    for (let i = 0; i <= segments; i++) {
      const a0 = i * step;
      const outside = i < segments ? isOutsideAtAngle(a0 + step * 0.5) : false;
      if (outside && arcStart === null) {
        arcStart = a0;
      } else if (!outside && arcStart !== null) {
        const arcEnd = a0;
        if (arcEnd - arcStart > 0.01) {
          const floorBand = createCircularArcBandShape(radius, wallInnerRadius, arcStart, arcEnd);
          const wallBand = createCircularArcBandShape(wallInnerRadius, outerRadius, arcStart, arcEnd);

          // The 250mm coping already overhangs the 200mm channel wall by 50mm
          // across the channel width. Separately, extend the coping 50mm beyond
          // each START/END of a channel run when that endpoint meets the pool.
          // Only the coping is extended; floor, wall and water retain the exact
          // detected channel arc.
          const copingMidRadius = Math.max(0.05, (copingInnerRadius + outerRadius) * 0.5);
          const copingAngleOverhang = SPA_CHANNEL_COPING_END_OVERHANG / copingMidRadius;
          const endpointProbe = Math.max(0.008, copingAngleOverhang * 0.4);
          const startMeetsPool = !isOutsideAtAngle(arcStart - endpointProbe);
          const endMeetsPool = !isOutsideAtAngle(arcEnd + endpointProbe);
          const copingArcStart = arcStart - (startMeetsPool ? copingAngleOverhang : 0);
          const copingArcEnd = arcEnd + (endMeetsPool ? copingAngleOverhang : 0);
          const copingBand = createCircularArcBandShape(copingInnerRadius, outerRadius, copingArcStart, copingArcEnd);

          addCircularChannelExtrude(group, floorBand, channelFloorThickness, channelFloorTopZ - channelFloorThickness, center, quat, mat, tileSize, 'floor');
          addCircularChannelExtrude(group, wallBand, wallHeight, channelFloorTopZ, center, quat, mat, tileSize, 'wall');
          if (lowerWallHeight > 0.001) {
            addCircularChannelExtrude(group, wallBand, lowerWallHeight, lowerWallBottomZ, center, quat, mat, tileSize, 'wall-extension');
          }
          addCircularChannelExtrude(group, copingBand, copingDepth, copingUnderZ, center, quat, copingMat, tileSize, 'coping');
          addCircularChannelWaterArc(waterGroup, radius, wallInnerRadius, arcStart, arcEnd, center, quat, waterLevelZ);
        }
        arcStart = null;
      }
    }

    const bridgeWidth = Math.max(0.35, radius * 1.2);
    const addBridge = (sx, sy, lx, ly) => {
      addChannelBox(group, sx, sy, channelFloorThickness, lx, ly, center, axisX, axisY, quat, mat, floorZCenter, tileSize, 'floor');
      addChannelBox(group, sx, sy, wallHeight, lx, ly, center, axisX, axisY, quat, mat, wallZCenter, tileSize, 'wall');
      if (lowerWallHeight > 0.001) {
        addChannelBox(group, sx, sy, lowerWallHeight, lx, ly, center, axisX, axisY, quat, mat, lowerWallZCenter, tileSize, 'wall-extension');
      }
      addChannelBox(group, sx, sy, copingDepth, lx, ly, center, axisX, axisY, quat, copingMat, copingZCenter, tileSize, 'coping');
      addChannelWaterPlane(waterGroup, sx, sy, lx, ly, center, axisX, axisY, quat, waterLevelZ);
    };
    if (snapVariant === 'inner-wall-align') {
      if (snapSide === 'left' && margins.maxX > 0) addBridge(Math.max(0.01, margins.maxX), bridgeWidth, radius + margins.maxX * 0.5, 0);
      if (snapSide === 'right' && margins.minX > 0) addBridge(Math.max(0.01, margins.minX), bridgeWidth, -(radius + margins.minX * 0.5), 0);
      if (snapSide === 'front' && margins.maxY > 0) addBridge(bridgeWidth, Math.max(0.01, margins.maxY), 0, radius + margins.maxY * 0.5);
      if (snapSide === 'back' && margins.minY > 0) addBridge(bridgeWidth, Math.max(0.01, margins.minY), 0, -(radius + margins.minY * 0.5));
    }

    ground.parent?.add(group);
    ground.parent?.add(waterGroup);
    if (ground.userData) { ground.userData.spaChannelGroup = group; ground.userData.spaChannelWaterGroup = waterGroup; }
    return;
  }

  const getSideIntervals = (_sideKey, axisAlong, axisAcross, stripCenter, alongMin, alongMax) => {
    return getOutsideIntervalsAlongSide(center, axisAlong, axisAcross, stripCenter, alongMin, alongMax, poolGroup);
  };

  // Extend the coping longitudinally at the actual START/END of each channel
  // run. The normal 250mm coping width already gives the intended 50mm
  // overhang across the 200mm channel wall, so this helper only handles the
  // missing 50mm at terminal ends where the channel meets the pool footprint.
  // Floor, walls and water continue to use the unextended [a,b] interval.
  const extendCopingIntervalAtPoolEnds = (a, b, axisAlong, axisAcross, acrossLocal) => {
    if (SPA_CHANNEL_COPING_END_OVERHANG <= 0) return [a, b];

    const along = axisAlong.clone();
    const across = axisAcross.clone();
    if (along.lengthSq() <= 1e-10 || across.lengthSq() <= 1e-10) return [a, b];
    along.normalize();
    across.normalize();

    const origin = center.clone().add(across.multiplyScalar(acrossLocal));
    const probe = Math.min(0.025, SPA_CHANNEL_COPING_END_OVERHANG * 0.5);
    const pointAt = (t) => origin.clone().add(along.clone().multiplyScalar(t));

    // getOutsideIntervalsAlongSide() returns the exact outside-pool channel run.
    // If the point immediately beyond an endpoint is inside the pool, that is a
    // genuine channel start/stop at the pool wall and the coping should continue
    // exactly 50mm past it into the pool. If it is still outside, the endpoint is
    // merely a spa/channel corner and is left unchanged.
    const startMeetsPool = isPointInsidePoolFootprint(poolGroup, pointAt(a - probe));
    const endMeetsPool = isPointInsidePoolFootprint(poolGroup, pointAt(b + probe));

    return [
      a - (startMeetsPool ? SPA_CHANNEL_COPING_END_OVERHANG : 0),
      b + (endMeetsPool ? SPA_CHANNEL_COPING_END_OVERHANG : 0)
    ];
  };

  const addFloorStrip = (sx, sy, lx, ly) => {
    addChannelBox(group, sx, sy, channelFloorThickness, lx, ly, center, axisX, axisY, quat, mat, floorZCenter, tileSize, 'floor');
    addChannelWaterPlane(waterGroup, sx, sy, lx, ly, center, axisX, axisY, quat, waterLevelZ);
  };
  const addWallStrip = (sx, sy, lx, ly) => {
    addChannelBox(group, sx, sy, wallHeight, lx, ly, center, axisX, axisY, quat, mat, wallZCenter, tileSize, 'wall');
    if (lowerWallHeight > 0.001) {
      addChannelBox(group, sx, sy, lowerWallHeight, lx, ly, center, axisX, axisY, quat, mat, lowerWallZCenter, tileSize, 'wall-extension');
    }
  };
  const addCopingStrip = (sx, sy, lx, ly) => {
    addChannelBox(group, sx, sy, copingDepth, lx, ly, center, axisX, axisY, quat, copingMat, copingZCenter, tileSize, 'coping');
  };

  if (margins.minX > 0) {
    const wallInnerX = minX + wallThickness;
    const floorWidth = Math.max(0.01, (-halfX) - wallInnerX);
    const floorCenterX = (wallInnerX + (-halfX)) * 0.5;
    const stripCenterX = -halfX - margins.minX * 0.5;
    const wallX = minX + wallThickness * 0.5;
    const copingX = minX + copingRebuildWidth * 0.5;
    const intervals = getSideIntervals('minX', axisY, axisX, stripCenterX, minY, maxY);
    intervals.forEach(([a, b]) => {
      const span = b - a;
      const mid = (a + b) * 0.5;
      addFloorStrip(floorWidth, span, floorCenterX, mid);
      const suppressBridgeFace = suppressPoolFacingBridgeWall && snapSide === 'right';
      if (!suppressBridgeFace) addWallStrip(wallThickness, span, wallX, mid);
      if (!suppressBridgeFace) {
        const [copingA, copingB] = extendCopingIntervalAtPoolEnds(a, b, axisY, axisX, stripCenterX);
        const copingSpan = copingB - copingA;
        const copingMid = (copingA + copingB) * 0.5;
        addCopingStrip(copingRebuildWidth, copingSpan, copingX, copingMid);
      }
    });
  }
  if (margins.maxX > 0) {
    const wallInnerX = maxX - wallThickness;
    const floorWidth = Math.max(0.01, wallInnerX - halfX);
    const floorCenterX = (wallInnerX + halfX) * 0.5;
    const stripCenterX = halfX + margins.maxX * 0.5;
    const wallX = maxX - wallThickness * 0.5;
    const copingX = maxX - copingRebuildWidth * 0.5;
    const intervals = getSideIntervals('maxX', axisY, axisX, stripCenterX, minY, maxY);
    intervals.forEach(([a, b]) => {
      const span = b - a;
      const mid = (a + b) * 0.5;
      addFloorStrip(floorWidth, span, floorCenterX, mid);
      const suppressBridgeFace = suppressPoolFacingBridgeWall && snapSide === 'left';
      if (!suppressBridgeFace) addWallStrip(wallThickness, span, wallX, mid);
      if (!suppressBridgeFace) {
        const [copingA, copingB] = extendCopingIntervalAtPoolEnds(a, b, axisY, axisX, stripCenterX);
        const copingSpan = copingB - copingA;
        const copingMid = (copingA + copingB) * 0.5;
        addCopingStrip(copingRebuildWidth, copingSpan, copingX, copingMid);
      }
    });
  }
  if (margins.minY > 0) {
    const wallInnerY = minY + wallThickness;
    const floorWidth = Math.max(0.01, (-halfY) - wallInnerY);
    const floorCenterY = (wallInnerY + (-halfY)) * 0.5;
    const stripCenterY = -halfY - margins.minY * 0.5;
    const wallY = minY + wallThickness * 0.5;
    const copingY = minY + copingRebuildWidth * 0.5;
    const intervals = getSideIntervals('minY', axisX, axisY, stripCenterY, minX, maxX);
    intervals.forEach(([a, b]) => {
      const span = b - a;
      const mid = (a + b) * 0.5;
      addFloorStrip(span, floorWidth, mid, floorCenterY);
      const suppressBridgeFace = suppressPoolFacingBridgeWall && snapSide === 'back';
      if (!suppressBridgeFace) addWallStrip(span, wallThickness, mid, wallY);
      if (!suppressBridgeFace) {
        const [copingA, copingB] = extendCopingIntervalAtPoolEnds(a, b, axisX, axisY, stripCenterY);
        const copingSpan = copingB - copingA;
        const copingMid = (copingA + copingB) * 0.5;
        addCopingStrip(copingSpan, copingRebuildWidth, copingMid, copingY);
      }
    });
  }
  if (margins.maxY > 0) {
    const wallInnerY = maxY - wallThickness;
    const floorWidth = Math.max(0.01, wallInnerY - halfY);
    const floorCenterY = (wallInnerY + halfY) * 0.5;
    const stripCenterY = halfY + margins.maxY * 0.5;
    const wallY = maxY - wallThickness * 0.5;
    const copingY = maxY - copingRebuildWidth * 0.5;
    const intervals = getSideIntervals('maxY', axisX, axisY, stripCenterY, minX, maxX);
    intervals.forEach(([a, b]) => {
      const span = b - a;
      const mid = (a + b) * 0.5;
      addFloorStrip(span, floorWidth, mid, floorCenterY);
      const suppressBridgeFace = suppressPoolFacingBridgeWall && snapSide === 'front';
      if (!suppressBridgeFace) addWallStrip(span, wallThickness, mid, wallY);
      if (!suppressBridgeFace) {
        const [copingA, copingB] = extendCopingIntervalAtPoolEnds(a, b, axisX, axisY, stripCenterY);
        const copingSpan = copingB - copingA;
        const copingMid = (copingA + copingB) * 0.5;
        addCopingStrip(copingSpan, copingRebuildWidth, copingMid, copingY);
      }
    });
  }

  ground.parent?.add(group);
  ground.parent?.add(waterGroup);
  if (ground.userData) { ground.userData.spaChannelGroup = group; ground.userData.spaChannelWaterGroup = waterGroup; }
}


function ensureOrangeInteriorClipMaterial(material) {
  if (!material) return;
  material.userData = material.userData || {};

  // Material.clone()/copy() serializes userData but does not safely preserve an
  // instance-level onBeforeCompile wrapper. That can leave a cloned pool-wall
  // material claiming it is orange-patched while the actual shader discard is
  // gone (and the copied Vector uniforms are plain objects). Treat the patch as
  // valid only when BOTH the live wrapper marker and live THREE vector uniforms
  // are present. Otherwise rebuild the patch from scratch.
  const existingUniforms = material.userData.orangeInteriorClipUniforms;
  const liveUniforms = !!(
    existingUniforms &&
    existingUniforms.orangeInteriorClipMin?.value?.isVector3 &&
    existingUniforms.orangeInteriorClipMax?.value?.isVector3 &&
    existingUniforms.orangeInteriorClipCenter?.value?.isVector2
  );
  const liveWrapper = material.onBeforeCompile?.__orangeInteriorClipWrapper === true;
  if (material.userData.orangeInteriorClipPatched && liveUniforms && liveWrapper) return;

  // A stale cloned marker must never block reinstallation of the shader hook.
  material.userData.orangeInteriorClipPatched = true;
  material.userData.orangeInteriorClipUniforms = {
    orangeInteriorClipEnabled: { value: 0 },
    orangeInteriorClipShape: { value: 0 },
    orangeInteriorClipMin: { value: new THREE.Vector3() },
    orangeInteriorClipMax: { value: new THREE.Vector3() },
    orangeInteriorClipCenter: { value: new THREE.Vector2() },
    orangeInteriorClipRadius: { value: 0 }
  };

  const previousOnBeforeCompile = liveWrapper
    ? material.onBeforeCompile.__orangeInteriorPreviousOnBeforeCompile
    : material.onBeforeCompile;

  const orangeInteriorOnBeforeCompile = (shader) => {
    if (typeof previousOnBeforeCompile === "function") previousOnBeforeCompile(shader);

    Object.assign(shader.uniforms, material.userData.orangeInteriorClipUniforms);

    if (!shader.vertexShader.includes('vOrangeInteriorWorldPos')) {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vOrangeInteriorWorldPos;'
        )
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\n  vOrangeInteriorWorldPos = worldPosition.xyz;'
        );
    }

    if (!shader.fragmentShader.includes('orangeInteriorClipEnabled')) {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vOrangeInteriorWorldPos;\nuniform int orangeInteriorClipEnabled;\nuniform int orangeInteriorClipShape;\nuniform vec3 orangeInteriorClipMin;\nuniform vec3 orangeInteriorClipMax;\nuniform vec2 orangeInteriorClipCenter;\nuniform float orangeInteriorClipRadius;'
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
  if (orangeInteriorClipEnabled == 1 &&
      vOrangeInteriorWorldPos.z >= orangeInteriorClipMin.z && vOrangeInteriorWorldPos.z <= orangeInteriorClipMax.z) {
    bool insideOrangeInteriorClip = false;
    if (orangeInteriorClipShape == 1) {
      vec2 orangeInteriorDelta = vOrangeInteriorWorldPos.xy - orangeInteriorClipCenter;
      insideOrangeInteriorClip = dot(orangeInteriorDelta, orangeInteriorDelta) <= orangeInteriorClipRadius * orangeInteriorClipRadius;
    } else {
      insideOrangeInteriorClip =
        vOrangeInteriorWorldPos.x >= orangeInteriorClipMin.x && vOrangeInteriorWorldPos.x <= orangeInteriorClipMax.x &&
        vOrangeInteriorWorldPos.y >= orangeInteriorClipMin.y && vOrangeInteriorWorldPos.y <= orangeInteriorClipMax.y;
    }
    if (insideOrangeInteriorClip) discard;
  }`
        );
    }
  };
  orangeInteriorOnBeforeCompile.__orangeInteriorClipWrapper = true;
  orangeInteriorOnBeforeCompile.__orangeInteriorPreviousOnBeforeCompile = previousOnBeforeCompile;
  material.onBeforeCompile = orangeInteriorOnBeforeCompile;

  const previousCacheKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => {
    const prev = previousCacheKey ? previousCacheKey() : '';
    return `${prev}|orange-interior-clip-v4`;
  };

  material.needsUpdate = true;
}

function setOrangeInteriorClipOnMaterial(material, box) {
  if (!material) return;
  ensureOrangeInteriorClipMaterial(material);

  const uniforms = material.userData?.orangeInteriorClipUniforms;
  if (!uniforms) return;

  if (box) {
    uniforms.orangeInteriorClipEnabled.value = 1;
    uniforms.orangeInteriorClipMin.value.set(box.minX ?? 0, box.minY ?? 0, box.minZ ?? 0);
    uniforms.orangeInteriorClipMax.value.set(box.maxX ?? 0, box.maxY ?? 0, box.maxZ ?? 0);
    if (box.shape === 'circular') {
      uniforms.orangeInteriorClipShape.value = 1;
      uniforms.orangeInteriorClipCenter.value.set(box.centerX ?? 0, box.centerY ?? 0);
      uniforms.orangeInteriorClipRadius.value = Math.max(0, box.radius ?? 0);
    } else {
      uniforms.orangeInteriorClipShape.value = 0;
      uniforms.orangeInteriorClipCenter.value.set(0, 0);
      uniforms.orangeInteriorClipRadius.value = 0;
    }
  } else {
    uniforms.orangeInteriorClipEnabled.value = 0;
    uniforms.orangeInteriorClipShape.value = 0;
    uniforms.orangeInteriorClipRadius.value = 0;
  }

}

function ensureGroundSpaClipMaterial(ground) {
  const mat = ground?.material;
  if (!mat || mat.userData?.spaClipPatched) return;

  mat.userData.spaClipPatched = true;
  mat.userData.spaClipUniforms = {
    spaClipEnabled: { value: 0 },
    spaClipCenter: { value: new THREE.Vector3() },
    spaClipAxisX: { value: new THREE.Vector3(1, 0, 0) },
    spaClipAxisY: { value: new THREE.Vector3(0, 1, 0) },
    spaClipHalfSize: { value: new THREE.Vector2(0.5, 0.5) },
    spaClipShape: { value: 0 },
    spaClipRadius: { value: 0.5 },
    yellowClipEnabled: { value: 0 },
    yellowClipMin: { value: new THREE.Vector3() },
    yellowClipMax: { value: new THREE.Vector3() },
    groundFadeCenter: { value: new THREE.Vector2(0, 0) },
    groundFadeRadius: { value: 24.0 },
    groundFadeWidth: { value: 5.0 }
  };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, mat.userData.spaClipUniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vSpaClipWorldPos;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         vSpaClipWorldPos = worldPosition.xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vSpaClipWorldPos;
         uniform int spaClipEnabled;
         uniform vec3 spaClipCenter;
         uniform vec3 spaClipAxisX;
         uniform vec3 spaClipAxisY;
         uniform vec2 spaClipHalfSize;
         uniform int spaClipShape;
         uniform float spaClipRadius;
         uniform int yellowClipEnabled;
         uniform vec3 yellowClipMin;
         uniform vec3 yellowClipMax;
         uniform vec2 groundFadeCenter;
         uniform float groundFadeRadius;
         uniform float groundFadeWidth;

         float groundHash(vec2 p) {
           p = fract(p * vec2(123.34, 456.21));
           p += dot(p, p + 45.32);
           return fract(p.x * p.y);
         }

         float groundNoise(vec2 p) {
           vec2 i = floor(p);
           vec2 f = fract(p);
           f = f * f * (3.0 - 2.0 * f);
           float a = groundHash(i);
           float b = groundHash(i + vec2(1.0, 0.0));
           float c = groundHash(i + vec2(0.0, 1.0));
           float d = groundHash(i + vec2(1.0, 1.0));
           return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
         }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         vec2 grassPos = vSpaClipWorldPos.xy;
         float broadGrass = groundNoise(grassPos * 0.16);
         float mediumGrass = groundNoise(grassPos * 0.72 + vec2(17.3, 9.1));
         float fineGrass = groundNoise(grassPos * 3.1 + vec2(31.7, 22.4));
         float grassVariation =
           (broadGrass - 0.5) * 0.16 +
           (mediumGrass - 0.5) * 0.07 +
           (fineGrass - 0.5) * 0.018;
         vec3 grassTint = vec3(
           1.0 + grassVariation * 0.45,
           1.0 + grassVariation,
           1.0 + grassVariation * 0.32
         );
         diffuseColor.rgb *= grassTint;`
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
         if (spaClipEnabled == 1) {
           vec3 d = vSpaClipWorldPos - spaClipCenter;
           float lx = dot(d, normalize(spaClipAxisX));
           float ly = dot(d, normalize(spaClipAxisY));
           if (spaClipShape == 1) {
             if ((lx * lx + ly * ly) <= (spaClipRadius * spaClipRadius)) discard;
           } else {
             if (abs(lx) <= spaClipHalfSize.x && abs(ly) <= spaClipHalfSize.y) discard;
           }
         }
         if (yellowClipEnabled == 1) {
           if (vSpaClipWorldPos.x >= yellowClipMin.x && vSpaClipWorldPos.x <= yellowClipMax.x &&
               vSpaClipWorldPos.y >= yellowClipMin.y && vSpaClipWorldPos.y <= yellowClipMax.y &&
               vSpaClipWorldPos.z >= yellowClipMin.z && vSpaClipWorldPos.z <= yellowClipMax.z) discard;
         }`
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
         float radialDistance = distance(vSpaClipWorldPos.xy, groundFadeCenter);
         float edgeDistance = groundFadeRadius - radialDistance;
         float edgeAlpha = smoothstep(0.0, max(groundFadeWidth, 0.001), edgeDistance);
         gl_FragColor.a *= edgeAlpha;
         if (gl_FragColor.a < 0.015) discard;`
      );
  };

  mat.customProgramCacheKey = () => 'ground-spa-clip-circular-grass-fade-v3';
  mat.needsUpdate = true;
}

function updateGroundMaterialSpaClip(ground, spaGroup = null, poolGroup = null) {
  const mat = ground?.material;
  const uniforms = mat?.userData?.spaClipUniforms;
  if (!uniforms) return;

  if (!spaGroup) {
    uniforms.spaClipEnabled.value = 0;
    uniforms.spaClipShape.value = 0;
    uniforms.spaClipRadius.value = 0.5;
    uniforms.yellowClipEnabled.value = 0;
    return;
  }

  if (spaGroup.userData?.orangeOnlyVoidMode) {
    uniforms.spaClipEnabled.value = 0;
    uniforms.spaClipShape.value = 0;
    uniforms.spaClipRadius.value = 0.5;
    uniforms.yellowClipEnabled.value = 0;
    return;
  }

  spaGroup.updateMatrixWorld?.(true);
  const box = new THREE.Box3().setFromObject(spaGroup);
  const minZ = box.min.z;
  const maxZ = box.max.z;
  const groundZ = ground?.position?.z ?? 0;

  if (!(minZ <= groundZ + 0.02 && maxZ >= groundZ - 0.02)) {
    uniforms.spaClipEnabled.value = 0;
    uniforms.spaClipShape.value = 0;
    uniforms.spaClipRadius.value = 0.5;
    uniforms.yellowClipEnabled.value = 0;
    return;
  }

  const pad = 0.02;
  const margins = getSpaChannelMargins(spaGroup, poolGroup);
  const expanded = getExpandedSpaWorldAABB(spaGroup, margins, pad, SPA_GROUND_CLIP_MARGIN_REDUCTION);
  if (!expanded) {
    uniforms.spaClipEnabled.value = 0;
    uniforms.spaClipShape.value = 0;
    uniforms.spaClipRadius.value = 0.5;
    uniforms.yellowClipEnabled.value = 0;
    return;
  }

  const isCircularSpa = spaGroup?.userData?.spaShape === 'circular';
  const offsetX = (expanded.maxX + expanded.minX) * 0.5;
  const offsetY = (expanded.maxY + expanded.minY) * 0.5;
  const clipCenter = expanded.center.clone().add(expanded.axisX.clone().multiplyScalar(offsetX)).add(expanded.axisY.clone().multiplyScalar(offsetY));
  const halfX = Math.max(0.01, (expanded.maxX - expanded.minX) * 0.5);
  const halfY = Math.max(0.01, (expanded.maxY - expanded.minY) * 0.5);
  uniforms.spaClipEnabled.value = 1; uniforms.spaClipCenter.value.copy(clipCenter); uniforms.spaClipAxisX.value.copy(expanded.axisX); uniforms.spaClipAxisY.value.copy(expanded.axisY); uniforms.spaClipHalfSize.value.set(halfX, halfY); uniforms.spaClipShape.value = isCircularSpa ? 1 : 0; uniforms.spaClipRadius.value = isCircularSpa ? Math.max(0.01, (spaGroup.userData?.spaLength || 0.01) * 0.5 + Math.max(margins.minX, margins.maxX, margins.minY, margins.maxY) - SPA_GROUND_CLIP_MARGIN_REDUCTION + pad) : Math.max(halfX, halfY);

  const volumes = getSpaClipVolumes(poolGroup, spaGroup, 0.01);
  if (volumes?.yellowClipBox) {
    uniforms.yellowClipEnabled.value = 1;
    uniforms.yellowClipMin.value.set(volumes.yellowClipBox.minX, volumes.yellowClipBox.minY, volumes.yellowMinZ);
    uniforms.yellowClipMax.value.set(volumes.yellowClipBox.maxX, volumes.yellowClipBox.maxY, volumes.yellowMaxZ);
  } else {
    uniforms.yellowClipEnabled.value = 0;
  }
}


function createProceduralGrassTexture(renderer) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha: false });

  const image = ctx.createImageData(size, size);
  const data = image.data;
  let seed = 918273645;
  const rand = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const broad = Math.sin(x * 0.035) * 5 + Math.cos(y * 0.041) * 4;
      const fine = (rand() - 0.5) * 22;
      const r = 66 + broad + fine * 0.35;
      const g = 102 + broad * 1.3 + fine;
      const b = 49 + broad * 0.45 + fine * 0.22;
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Fine blades and small colour variation, kept subtle to avoid moire.
  ctx.globalAlpha = 0.28;
  for (let i = 0; i < 9500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const length = 1 + rand() * 3.5;
    ctx.strokeStyle = rand() > 0.48 ? 'rgb(104,135,70)' : 'rgb(39,76,35)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 1.4, y - length);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'Procedural grass ground';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.42, 0.42); // ShapeGeometry UVs are world-position based.
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  texture.needsUpdate = true;
  return texture;
}


const ORBIT_GROUND_Z = 0;
const ORBIT_CAMERA_CLEARANCE = 0.22;
const ORBIT_TARGET_CLEARANCE = 0.02;

/**
 * Keeps OrbitControls above the Z-up ground plane.
 *
 * OrbitControls' maxPolarAngle prevents a normal orbit from crossing its
 * target plane, but panning or programmatic camera changes can still move the
 * target/camera below world Z = 0. This clamp handles every input path.
 */
export function constrainOrbitAboveGround(
  camera,
  controls,
  {
    groundZ = ORBIT_GROUND_Z,
    cameraClearance = ORBIT_CAMERA_CLEARANCE,
    targetClearance = ORBIT_TARGET_CLEARANCE
  } = {}
) {
  if (!camera || !controls?.target) return false;

  let changed = false;
  const minTargetZ = groundZ + targetClearance;
  const minCameraZ = groundZ + cameraClearance;

  if (controls.target.z < minTargetZ) {
    controls.target.z = minTargetZ;
    changed = true;
  }

  if (camera.position.z < minCameraZ) {
    camera.position.z = minCameraZ;
    changed = true;
  }

  // Prevent the orbit pivot from ending above the camera, which can produce
  // an inverted-feeling drag when the camera is close to the ground.
  const maximumTargetZ = camera.position.z - 0.05;
  if (controls.target.z > maximumTargetZ) {
    controls.target.z = Math.max(minTargetZ, maximumTargetZ);
    changed = true;
  }

  if (changed) {
    camera.updateMatrixWorld?.();
  }

  return changed;
}

export async function initScene() {
  const container = document.getElementById("three-root") || document.body;

  const scene = new THREE.Scene();

  // IMPORTANT: Do NOT touch THREE.Object3D.DEFAULT_UP here.
  // Your app already has an established axis convention; changing DEFAULT_UP will flip everything.
  // We only set camera.up to match the rest of your app (Z-up in your pool code).
  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    500
  );
  camera.up.set(0, 0, 1);
  camera.position.set(8, -11, 7);
  camera.lookAt(0, 0, 0);
  scene.userData.camera = camera;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    // Required for screenshot capture. The screenshot code copies the
    // already-rendered canvas pixels without triggering another render pass;
    // without this, some browsers clear the WebGL back buffer and the exported
    // screenshot becomes black.
    preserveDrawingBuffer: true
  });
  applyRendererPixelRatio(renderer)
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;

  // Modern color pipeline + PBR-friendly tone mapping
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  container.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, getMaxDevicePixelRatio()));
  composer.setSize(container.clientWidth, container.clientHeight);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.10,
    0.28,
    0.88
  );
  composer.addPass(bloomPass);
  scene.userData.postFX = { composer, renderPass, bloomPass };
  scene.userData.renderWithPostFX = () => composer.render();

  // -------------------------
  // Lighting: key/fill/rim
  // -------------------------
  const ambient = new THREE.AmbientLight(0xffffff, 0.22);
  scene.add(ambient);

  dirLight = new THREE.DirectionalLight(0xffffff, 2.8);
  // Environment maps provide image-based illumination and reflections, but
  // WebGL cannot derive a shadow map directly from an HDR panorama. Use one
  // real DirectionalLight aligned to the HDR's visible solar disc so geometry
  // shadows agree with the sky instead of coming from an arbitrary fixed angle.
  alignDirectionalLightToHDRISun(dirLight, new THREE.Vector3(0, 0, 0));
  dirLight.castShadow = true;

  // If you want extra FPS, drop to 1024:
  dirLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  dirLight.shadow.normalBias = 0.02;
  dirLight.shadow.bias = -0.0002;

  const d = 20;
  dirLight.shadow.camera = new THREE.OrthographicCamera(-d, d, d, -d, 0.5, 150);
  scene.add(dirLight);
  scene.add(dirLight.target);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.75);
  fillLight.position.set(-20, 20, 18);
  fillLight.castShadow = false;
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.55);
  rimLight.position.set(25, 25, 12);
  rimLight.castShadow = false;
  scene.add(rimLight);
  scene.userData.startupLights = [ambient, dirLight, dirLight.target, fillLight, rimLight];
  scene.userData.dirLight = dirLight;
  scene.userData.hdriSunDirection = dirLight.userData.hdriSunDirection?.clone();
  scene.userData.realignSunToHDRI = (target = new THREE.Vector3(0, 0, 0)) => {
    alignDirectionalLightToHDRISun(dirLight, target);
    scene.userData.hdriSunDirection = dirLight.userData.hdriSunDirection?.clone();
  };

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // Z-up ground-safe orbit. The small angle margin keeps the viewing camera
  // visibly above the horizon, while the explicit clamp also handles panning.
  controls.maxPolarAngle = Math.PI / 2 - THREE.MathUtils.degToRad(2.5);
  controls.minPolarAngle = THREE.MathUtils.degToRad(5);
  controls.minDistance = 1.25;
  controls.target.set(0, 0, ORBIT_TARGET_CLEARANCE);
  controls.update();
  constrainOrbitAboveGround(camera, controls);
  scene.userData.controls = controls;
  scene.userData.constrainOrbitAboveGround = () =>
    constrainOrbitAboveGround(camera, controls);

  // -------------------------
  // Ground plane
  // NOTE: Your app cuts the void using updateGroundVoid(). Keep this mesh stable.
  // -------------------------
  const groundGeo = new THREE.PlaneGeometry(24, 24, 1, 1);

  // -------------------------
  // Ground material: Studio floor (neutral, slightly rough)
  // Keep this mesh stable: updateGroundVoid() will replace the geometry to cut the pool footprint hole.
  // -------------------------
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x5f7f47,
    roughness: 0.96,
    metalness: 0.0,
    envMapIntensity: 0.14,
    transparent: true,
    alphaTest: 0.015,
    depthWrite: true
  });

  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  ensureGroundSpaClipMaterial(ground);
  scene.add(ground);
  scene.userData.ground = ground;

  // -------------------------
  // Studio environment (no external HDRI): neutral reflections + soft ambient feel
  // -------------------------
  if (ENABLE_ROOM_ENVIRONMENT) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  } else {
    scene.environment = null;
  }

  // -------------------------
  // Background: subtle vertical gradient sky-dome (clean showroom look)
  // -------------------------
  const skyGeo = new THREE.SphereGeometry(5000, 48, 32);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0xf7f9fc) },
      bottomColor: { value: new THREE.Color(0xe7edf5) }
    },
    vertexShader: `
      varying vec3 vPos;
      void main(){
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      void main(){
        float h = normalize(vPos).y * 0.5 + 0.5;
        h = smoothstep(0.0, 1.0, h);
        gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
      }
    `
  });

  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.frustumCulled = false;
  skyDome.onBeforeRender = (_r, _s, cam) => {
    skyDome.position.copy(cam.position);
  };

  // Remove any previous background objects
  if (scene.userData.skyDome) {
    scene.remove(scene.userData.skyDome);
    scene.userData.skyDome.geometry.dispose();
    scene.userData.skyDome.material.dispose();
  }
  scene.add(skyDome);
  scene.userData.skyDome = skyDome;

  // Background is provided by geometry
  scene.background = null;

  // Resize
  window.addEventListener("resize", () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    applyRendererPixelRatio(renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, getMaxDevicePixelRatio()));
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
  });

  // Called by PoolApp only after the base pool model has rendered, keeping startup non-blocking.
  scene.userData.loadHDRIEnvironment = () => loadDeferredEnvironment(scene, renderer);

  return { scene, camera, renderer, ground, controls };
}


// --------------------------------------------------------
// Pool paving perimeter
// --------------------------------------------------------
const PAVING_WIDTH = 2.0;          // clear paving width beyond coping outer edge
const COPING_OUTER_OVERHANG = 0.125;
const PAVING_COPING_BUTT_OVERLAP = 0.100; // 100 mm paving-only overlap stays concealed within the 200 mm shell

function getPoolCopingOuterOverhang(poolGroup) {
  const pts = poolGroup?.userData?.outerPts;
  const params = poolGroup?.userData?.poolParams || poolGroup?.userData?.params;
  const isLShape = Array.isArray(pts) && pts.length === 6 &&
    (Number.isFinite(params?.notchLengthX) || Number.isFinite(params?.notchWidthY));
  return isLShape ? 0.10 : COPING_OUTER_OVERHANG;
}

function isFreeformPoolForPaving(poolGroup) {
  const params = poolGroup?.userData?.poolParams || poolGroup?.userData?.params || {};
  return String(params?.shape || '').toLowerCase() === 'freeform';
}

function getPoolPavingOffsets(poolGroup) {
  // Preserve the established freeform paving behaviour because arbitrary
  // editable outlines can intentionally use their coping outline as the datum.
  if (isFreeformPoolForPaving(poolGroup)) {
    // Freeform/curved `outerPts` follow the water-side/front wall face. The
    // structural wall now extends its full thickness outward from that datum,
    // and the coping rear edge is flush with the exterior wall face. Build the
    // paving from the same exterior datum so it cannot sit outside the shell.
    const shellThickness = Math.max(0.01, Number(poolGroup?.userData?.wallThickness) || 0.20);
    const copingOuterOverhang = shellThickness;
    return {
      inner: Math.max(0, copingOuterOverhang - PAVING_COPING_BUTT_OVERLAP),
      outer: copingOuterOverhang + PAVING_WIDTH
    };
  }

  // Rectangle, L, oval and kidney outerPts describe the INTERNAL pool face.
  // Start paving at the back/outside face of the shell, never within the shell.
  // Adding the same paving width from that datum keeps the outside paving
  // footprint the same constant width around the complete pool perimeter.
  const shellThickness = Math.max(0.01, Number(poolGroup?.userData?.wallThickness) || 0.20);
  return {
    // Let paving extend 20 mm beneath the outside shell face. The overlap is
    // paving-only and closes the hairline that otherwise appears when a raised
    // pool and its independently extruded entry platform meet.
    inner: Math.max(0, shellThickness - PAVING_COPING_BUTT_OVERLAP),
    outer: shellThickness + PAVING_WIDTH
  };
}
const PAVING_TILE_SIZE = 2.4; // 4x larger paving pattern than the previous 0.6 m scale
let cachedPavingMaterial = null;

function signedArea2D(points) {
  let area = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

function cleanClosedPolygon(points, epsilon = 1e-5) {
  const out = [];
  for (const p of points || []) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const v = new THREE.Vector2(p.x, p.y);
    if (!out.length || out[out.length - 1].distanceToSquared(v) > epsilon * epsilon) out.push(v);
  }
  if (out.length > 2 && out[0].distanceToSquared(out[out.length - 1]) <= epsilon * epsilon) out.pop();
  return out;
}

function intersectInfiniteLines(a0, a1, b0, b1) {
  const da = a1.clone().sub(a0);
  const db = b1.clone().sub(b0);
  const denom = da.x * db.y - da.y * db.x;
  if (Math.abs(denom) < 1e-8) return null;
  const d = b0.clone().sub(a0);
  const t = (d.x * db.y - d.y * db.x) / denom;
  return a0.clone().addScaledVector(da, t);
}

// Produces a true constant-distance outline for straight, angled and densely
// sampled curved pool boundaries. Extreme mitres are bevelled to prevent spikes.
function offsetPolygon(points, distance) {
  const poly = cleanClosedPolygon(points);
  const n = poly.length;
  if (n < 3 || !Number.isFinite(distance)) return poly;

  const ccw = signedArea2D(poly) > 0;
  const shifted = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dir = b.clone().sub(a).normalize();
    const outward = ccw
      ? new THREE.Vector2(dir.y, -dir.x)
      : new THREE.Vector2(-dir.y, dir.x);
    shifted.push({ a: a.clone().addScaledVector(outward, distance), b: b.clone().addScaledVector(outward, distance) });
  }

  const result = [];
  const maxMiter = Math.max(Math.abs(distance) * 4, 0.35);
  for (let i = 0; i < n; i++) {
    const prev = shifted[(i - 1 + n) % n];
    const next = shifted[i];
    let q = intersectInfiniteLines(prev.a, prev.b, next.a, next.b);
    const source = poly[i];
    if (!q || q.distanceTo(source) > maxMiter) {
      // Bevel fallback keeps concave/custom shapes stable and avoids long spikes.
      result.push(prev.b.clone(), next.a.clone());
    } else {
      result.push(q);
    }
  }
  return cleanClosedPolygon(result);
}

function makePavingMaterial() {
  if (cachedPavingMaterial) return cachedPavingMaterial;

  // Create a visible stone material synchronously. A TextureLoader texture can
  // render black until its image reaches the GPU, so maps are attached only
  // after each image has finished loading.
  cachedPavingMaterial = new THREE.MeshStandardMaterial({
    color: 0xbab3a8,
    roughness: 0.88,
    metalness: 0.0,
    envMapIntensity: 0.65
  });

  hydrateStoneMaterial(cachedPavingMaterial, {
    repeat: 1,
    anisotropy: 8,
    includeDisplacement: false,
    debugLabel: "Paving"
  });

  // The spa can overlap the paving ring. Clip the paving in the material rather
  // than adding an overlapping ShapeGeometry hole, which becomes invalid when
  // the spa intersects the pool's existing inner hole.
  const spaClipUniforms = {
    enabled: { value: 0.0 },
    shape: { value: 0.0 }, // 0 = rectangle, 1 = circle
    center: { value: new THREE.Vector2() },
    halfSize: { value: new THREE.Vector2(0.001, 0.001) },
    rotation: { value: 0.0 },
    radius: { value: 0.001 }
  };
  cachedPavingMaterial.userData.spaClipUniforms = spaClipUniforms;
  cachedPavingMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      pavingSpaClipEnabled: spaClipUniforms.enabled,
      pavingSpaClipShape: spaClipUniforms.shape,
      pavingSpaClipCenter: spaClipUniforms.center,
      pavingSpaClipHalfSize: spaClipUniforms.halfSize,
      pavingSpaClipRotation: spaClipUniforms.rotation,
      pavingSpaClipRadius: spaClipUniforms.radius
    });

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vPavingWorldPosition;'
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvPavingWorldPosition = worldPosition.xyz;'
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vPavingWorldPosition;
         uniform float pavingSpaClipEnabled;
         uniform float pavingSpaClipShape;
         uniform vec2 pavingSpaClipCenter;
         uniform vec2 pavingSpaClipHalfSize;
         uniform float pavingSpaClipRotation;
         uniform float pavingSpaClipRadius;`
      )
      .replace(
        '#include <dithering_fragment>',
        `if (pavingSpaClipEnabled > 0.5) {
           vec2 delta = vPavingWorldPosition.xy - pavingSpaClipCenter;
           float c = cos(-pavingSpaClipRotation);
           float s = sin(-pavingSpaClipRotation);
           vec2 local = vec2(c * delta.x - s * delta.y, s * delta.x + c * delta.y);
           bool insideSpa = pavingSpaClipShape > 0.5
             ? length(local) <= pavingSpaClipRadius
             : all(lessThanEqual(abs(local), pavingSpaClipHalfSize));
           if (insideSpa) discard;
         }
         #include <dithering_fragment>`
      );
  };
  cachedPavingMaterial.customProgramCacheKey = () => 'paving-spa-channel-void-v3';
  return cachedPavingMaterial;
}

function applyPlanarPavingUVs(geometry, tileSize = PAVING_TILE_SIZE) {
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  if (!pos || !uv) return;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / tileSize, pos.getY(i) / tileSize);
  }
  uv.needsUpdate = true;
  geometry.setAttribute('uv2', new THREE.BufferAttribute(new Float32Array(uv.array), 2));
}

function getCopingTopWorldZ(poolGroup) {
  const coping = getAllPoolCopingMeshes(poolGroup);
  let top = -Infinity;
  for (const mesh of coping) {
    mesh.updateMatrixWorld?.(true);
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) continue;
    // A selected wall may lift or hide its own coping segment. Paving always
    // stays at the pool's normal coping datum, never at the extra wall height.
    // baseZ is authored by every segmented coping builder before wall edits.
    const baseZ = Number(mesh.userData?.baseZ);
    const localZ = Number(mesh.position?.z);
    const baseTop = Number.isFinite(baseZ) && Number.isFinite(localZ)
      ? box.max.z + (baseZ - localZ)
      : box.max.z;
    top = Math.max(top, baseTop);
  }
  return Number.isFinite(top) ? top : 0.051;
}

function updatePavingSpaClip(material, spaGroup, poolGroup = null) {
  const uniforms = material?.userData?.spaClipUniforms;
  if (!uniforms) return;

  if (!spaGroup || spaGroup.visible === false) {
    uniforms.enabled.value = 0.0;
    return;
  }

  spaGroup.updateMatrixWorld?.(true);
  const spaCenter = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  spaGroup.matrixWorld.decompose(spaCenter, quaternion, scale);

  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
  const length = Math.max(0.05, Number(spaGroup.userData?.spaLength) || 2.0) * Math.abs(scale.x || 1);
  const width = Math.max(0.05, Number(spaGroup.userData?.spaWidth) || 2.0) * Math.abs(scale.y || 1);
  const shape = spaGroup.userData?.spaShape || 'square';
  const channelEnabled = !!(spaGroup.userData?.channelEnabled || spaGroup.userData?.isHalfwayInWall);

  // The paving must be removed to the OUTER edge of the spa channel, not just
  // to the spa shell. getSpaChannelMargins() already accounts for the channel
  // side connected to the pool and for asymmetric halfway-in-wall layouts.
  const margins = channelEnabled
    ? getSpaChannelMargins(spaGroup, poolGroup)
    : { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  const minX = Math.max(0, Number(margins?.minX) || 0) * Math.abs(scale.x || 1);
  const maxX = Math.max(0, Number(margins?.maxX) || 0) * Math.abs(scale.x || 1);
  const minY = Math.max(0, Number(margins?.minY) || 0) * Math.abs(scale.y || 1);
  const maxY = Math.max(0, Number(margins?.maxY) || 0) * Math.abs(scale.y || 1);

  // Asymmetric margins shift the channel footprint away from the spa centre.
  const localShift = new THREE.Vector3(
    (maxX - minX) * 0.5,
    (maxY - minY) * 0.5,
    0
  ).applyQuaternion(quaternion);
  const channelCenter = spaCenter.clone().add(localShift);

  const channelHalfX = length * 0.5 + (minX + maxX) * 0.5;
  const channelHalfY = width * 0.5 + (minY + maxY) * 0.5;

  // Pull the paving cutout 50 mm inward from the outside face of the spa
  // channel so the paving finishes neatly at the back edge of the coping.
  const clearance = -0.05;
  uniforms.enabled.value = 1.0;
  uniforms.center.value.set(channelCenter.x, channelCenter.y);
  uniforms.rotation.value = euler.z;

  if (shape === 'circular') {
    // A circular spa must always cut a circular paving void. The pool-side
    // connection is already removed by the main pool paving footprint, so an
    // asymmetric channel margin must not convert this into a rectangular void.
    const outerRadius = Math.max(length, width) * 0.5 + Math.max(minX, maxX, minY, maxY);
    const clipRadius = Math.max(0.05, outerRadius + clearance);
    uniforms.shape.value = 1.0;
    uniforms.center.value.set(spaCenter.x, spaCenter.y);
    uniforms.radius.value = clipRadius;
    uniforms.halfSize.value.set(clipRadius, clipRadius);
  } else {
    uniforms.shape.value = 0.0;
    uniforms.halfSize.value.set(
      Math.max(0.05, channelHalfX + clearance),
      Math.max(0.05, channelHalfY + clearance)
    );
    uniforms.radius.value = Math.max(channelHalfX, channelHalfY) + clearance;
  }
}


export function getPoolPavingContours(poolGroup) {
  const poolPts = getPoolFootprintWorldPts(poolGroup);
  const base = cleanClosedPolygon(poolPts);
  if (base.length < 3) return null;
  const pavingOffsets = getPoolPavingOffsets(poolGroup);
  const inner = offsetPolygon(base, pavingOffsets.inner);
  const outer = offsetPolygon(base, pavingOffsets.outer);
  if (inner.length < 3 || outer.length < 3 || inner.length !== outer.length) return null;
  return { inner, outer, width: PAVING_WIDTH };
}

function updatePoolPaving(ground, poolGroup, spaGroup = null) {
  const scene = ground?.parent;
  if (!scene || !poolGroup) return;

  const old = ground.userData?.poolPavingMesh;
  if (old) {
    old.parent?.remove(old);
    old.geometry?.dispose?.();
    ground.userData.poolPavingMesh = null;
  }

  const poolPts = getPoolFootprintWorldPts(poolGroup);
  const base = cleanClosedPolygon(poolPts);
  if (base.length < 3) return;

  const pavingOffsets = getPoolPavingOffsets(poolGroup);
  const inner = offsetPolygon(base, pavingOffsets.inner);
  const outer = offsetPolygon(base, pavingOffsets.outer);
  if (inner.length < 3 || outer.length < 3) return;

  // A four-sided wet edge has continuous catch tanks and deliberately has no
  // coping or entry paving around its perimeter.
  if (String(poolGroup.userData?.designShape || poolGroup.userData?.poolParams?.shape || '').toLowerCase() === 'wet-edge') return;

  const stepMeshes = [];
  poolGroup.traverse?.((object) => {
    if (object?.isMesh && object.userData?.isStep && !object.userData?.isStepAddon) stepMeshes.push(object);
  });
  if (!stepMeshes.length) return;
  const stepBounds = new THREE.Box3();
  stepMeshes.forEach(step => { step.updateWorldMatrix?.(true,false); stepBounds.union(new THREE.Box3().setFromObject(step)); });
  const stepCenter = stepBounds.getCenter(new THREE.Vector3());
  const stepSize = stepBounds.getSize(new THREE.Vector3());

  // Find the one boundary segment occupied by the entry steps. Paving is a
  // square-ended strip only on that side; it never wraps onto a second side.
  let best = null;
  const stepWall = String(poolGroup.userData?.poolParams?.stepWall || 'west').toLowerCase();
  inner.forEach((a, index) => {
    const b = inner[(index + 1) % inner.length];
    const ab = b.clone().sub(a);
    const lenSq = Math.max(1e-9, ab.lengthSq());
    const t = THREE.MathUtils.clamp(new THREE.Vector2(stepCenter.x,stepCenter.y).sub(a).dot(ab) / lenSq, 0, 1);
    const point = a.clone().addScaledVector(ab,t);
    const d2 = point.distanceToSquared(new THREE.Vector2(stepCenter.x,stepCenter.y));
    const midpoint = a.clone().add(b).multiplyScalar(0.5);
    const directional = stepWall === 'east' ? -midpoint.x
      : stepWall === 'north' ? -midpoint.y
      : stepWall === 'south' ? midpoint.y
      : midpoint.x;
    const score = directional * 1000 + d2;
    if (!best || score < best.score) best = { index,a,b,t,d2,score,length:Math.sqrt(lenSq) };
  });
  if (!best) return;
  const desiredSpan = Math.max(0.75, Math.max(stepSize.x,stepSize.y) + 0.50);
  const halfT = Math.min(0.5, desiredSpan / Math.max(0.001,best.length) * 0.5);
  const startT = THREE.MathUtils.clamp(best.t-halfT,0,1);
  const endT = THREE.MathUtils.clamp(best.t+halfT,0,1);
  const nextIndex = (best.index+1)%inner.length;
  const innerA = inner[best.index].clone().lerp(inner[nextIndex],startT);
  const innerB = inner[best.index].clone().lerp(inner[nextIndex],endT);

  // Concave L-shape notches can cause the offset routine to insert a bevel
  // vertex on only one contour, so inner/outer array indices no longer refer
  // to the same physical wall. Match the outer segment geometrically instead
  // of assuming identical indices. This keeps the entry paving strip square
  // and continuous when it sits in or beside the internal L notch.
  const innerDir=best.b.clone().sub(best.a).normalize();
  const innerMid=best.a.clone().add(best.b).multiplyScalar(0.5);
  let outerMatch=null;
  outer.forEach((a,index)=>{
    const b=outer[(index+1)%outer.length];
    const delta=b.clone().sub(a);
    const length=delta.length();
    if(length<1e-6) return;
    const dir=delta.clone().divideScalar(length);
    const parallel=Math.abs(dir.dot(innerDir));
    if(parallel<0.985) return;
    const mid=a.clone().add(b).multiplyScalar(0.5);
    const distance=mid.distanceToSquared(innerMid);
    const score=distance+(1-parallel)*100;
    if(!outerMatch||score<outerMatch.score) outerMatch={a,b,dir,score};
  });
  if(!outerMatch) return;
  // Build the entry paving as an exact rectangle behind the step wall.
  // OffsetPolygon can bevel or fan the outer contour near a curved/concave
  // corner, which previously made this paving pad taper into a wedge. Resolve
  // the real outward direction from the matched outer wall, then extrude the
  // two inner endpoints by one constant perpendicular distance. Both end faces
  // therefore remain square to the entry wall regardless of neighbouring curves.
  const outerMid=outerMatch.a.clone().add(outerMatch.b).multiplyScalar(0.5);
  let outwardNormal=new THREE.Vector2(-innerDir.y,innerDir.x);
  const towardOuter=outerMid.clone().sub(innerMid);
  if(outwardNormal.dot(towardOuter)<0) outwardNormal.multiplyScalar(-1);
  let pavingPlanDepth=Math.abs(towardOuter.dot(outwardNormal));
  if(!(pavingPlanDepth>0.05)) pavingPlanDepth=Math.max(0.05, pavingOffsets.outer-pavingOffsets.inner);
  const outerA=innerA.clone().addScaledVector(outwardNormal,pavingPlanDepth);
  const outerB=innerB.clone().addScaledVector(outwardNormal,pavingPlanDepth);
  const stripPoints = [innerA,innerB,outerB,outerA];

  const shape = new THREE.Shape(signedArea2D(stripPoints) < 0 ? stripPoints.slice().reverse() : stripPoints);
  const pavingDepth = 0.05;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: pavingDepth,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1
  });
  applyPlanarPavingUVs(geometry);

  const pavingMaterial = makePavingMaterial();
  updatePavingSpaClip(pavingMaterial, spaGroup, poolGroup);
  const paving = new THREE.Mesh(geometry, pavingMaterial);
  paving.name = 'Entry-side pool paving';
  paving.position.z = getCopingTopWorldZ(poolGroup) - pavingDepth;
  paving.receiveShadow = true;
  paving.castShadow = false;
  paving.renderOrder = 2;
  paving.userData.isPoolPaving = true;
  // If a spa edit rebuilds paving while the pool is already raised, keep the
  // standard full perimeter hidden. The raised entry platform is managed by
  // PoolApp and remains the only visible paving in this state.
  paving.visible = !(Number(poolGroup?.userData?.poolElevationApplied) > 0.001);
  paving.userData.width = PAVING_WIDTH;
  paving.userData.topAlignedToCoping = true;
  scene.add(paving);
  ground.userData.poolPavingMesh = paving;
}

// --------------------------------------------------------
// Lightweight spa drag preview
// --------------------------------------------------------
// During an XY spa drag we do NOT rebuild the ground mesh, paving geometry or
// spa-channel geometry on every pointer event. Those are comparatively expensive
// and are rebuilt once on pointer release. This preview only updates the shader /
// material clip uniforms and the pool wall/coping/water clipping planes, which
// makes the void follow the spa live while keeping drag interaction responsive.
export function updateSpaDragPreview(ground, poolGroup, spaGroup = null) {
  if (!poolGroup) return;

  poolGroup.updateWorldMatrix?.(true, true);
  spaGroup?.updateWorldMatrix?.(true, true);

  // Pool water + structural wall/coping clip planes.
  updatePoolWaterVoid(poolGroup, spaGroup);

  if (!ground) return;

  // The ground spa opening is shader-driven, so its centre/axes can move live
  // without replacing the ground ShapeGeometry.
  ensureGroundSpaClipMaterial(ground);
  updateGroundMaterialSpaClip(ground, spaGroup, poolGroup);

  // The standard paving opening is also shader-driven. Keep that cutout moving
  // with the spa while leaving the actual paving mesh untouched until release.
  const paving = ground.userData?.poolPavingMesh || null;
  if (paving?.material) {
    const mats = Array.isArray(paving.material) ? paving.material : [paving.material];
    mats.forEach((mat) => updatePavingSpaClip(mat, spaGroup, poolGroup));
  }
}

// --------------------------------------------------------
// Ground void update (cut footprint hole)
// --------------------------------------------------------
export function updateGroundVoid(ground, poolGroup, spaGroup = null) {
  if (!ground || !poolGroup || !poolGroup.userData || !poolGroup.userData.outerPts) return;

  const scene = ground.parent || null;
  purgeDetachedSpaChannelArtifacts(scene, ground?.userData?.spaChannelGroup || null, ground?.userData?.spaChannelWaterGroup || null);
  ensureGroundSpaClipMaterial(ground);

  const outerPts = poolGroup.userData.outerPts;

  // Apply poolGroup transform (so live preview scaling updates the void correctly)
  const sx = (poolGroup.scale && isFinite(poolGroup.scale.x)) ? poolGroup.scale.x : 1;
  const sy = (poolGroup.scale && isFinite(poolGroup.scale.y)) ? poolGroup.scale.y : 1;
  const px = (poolGroup.position && isFinite(poolGroup.position.x)) ? poolGroup.position.x : 0;
  const py = (poolGroup.position && isFinite(poolGroup.position.y)) ? poolGroup.position.y : 0;

  // outerPts is the internal water-side face for the authored shells.  Cutting
  // the ground at that line leaves ground coplanar with the wall/window and it
  // visibly flickers through acrylic panels.  Expand to just beyond the outside
  // shell face first, then apply the live pool transform.
  const shellThickness = Math.max(0.08, Number(poolGroup.userData.wallThickness) || 0.20);
  const shellOutline = offsetPolygon(outerPts, shellThickness + 0.015);
  const holePts = shellOutline.map((v) => new THREE.Vector2(v.x * sx + px, v.y * sy + py));

  // Circular ground centred on the current pool/spa footprint.
  // Its diameter is twice the previous adaptive rectangle's largest dimension.
  const groundCircle = computeGroundCircle(poolGroup, spaGroup);
  const groundShape = new THREE.Shape();
  groundShape.absarc(
    groundCircle.centerX,
    groundCircle.centerY,
    groundCircle.radius,
    0,
    Math.PI * 2,
    false
  );

  // Only cut the pool footprint in the ground geometry.
  // Spa cutout is handled in the ground material so overlapping/intersecting
  // spa placements do not create invalid ShapeGeometry holes across the pool.
  groundShape.holes = [new THREE.Path(holePts)];

  // Optional feature-specific openings, such as the infinity catch tank.
  // Points are supplied in the same world XY coordinate space as the pool hole.
  const extraGroundVoids = Array.isArray(ground.userData?.extraGroundVoids)
    ? ground.userData.extraGroundVoids
    : [];
  for (const entry of extraGroundVoids) {
    const points = Array.isArray(entry?.points) ? entry.points : [];
    if (points.length < 3) continue;
    const pathPoints = points.map((point) => new THREE.Vector2(Number(point.x) || 0, Number(point.y) || 0));
    groundShape.holes.push(new THREE.Path(pathPoints));
  }

  const newGeo = new THREE.ShapeGeometry(groundShape);
  ground.geometry.dispose();
  ground.geometry = newGeo;

  const fadeUniforms = ground.material?.userData?.spaClipUniforms;
  if (fadeUniforms?.groundFadeCenter && fadeUniforms?.groundFadeRadius) {
    fadeUniforms.groundFadeCenter.value.set(groundCircle.centerX, groundCircle.centerY);
    fadeUniforms.groundFadeRadius.value = groundCircle.radius;
    fadeUniforms.groundFadeWidth.value = THREE.MathUtils.clamp(
      groundCircle.radius * 0.12,
      4.0,
      12.0
    );
  }

  updateGroundMaterialSpaClip(ground, spaGroup, poolGroup);
  updateSpaChannelMeshes(ground, poolGroup, spaGroup);
  purgeDetachedSpaChannelArtifacts(scene, ground?.userData?.spaChannelGroup || null, ground?.userData?.spaChannelWaterGroup || null);

  // Pool-wall/coping/water clipping is world-space. Rebuild it whenever the
  // spa channel/ground geometry is rebuilt so the void cannot remain at the old
  // pool elevation after raising/lowering or after a curved-pool rebuild.
  updatePoolWaterVoid(poolGroup, spaGroup);
  updateSpaVoidDebug(ground?.parent, ground, poolGroup, spaGroup, holePts);
  updatePoolPaving(ground, poolGroup, spaGroup);
  updateShadowBounds(poolGroup);
}


// --------------------------------------------------------
// Update directional light shadow box to fit pool
// --------------------------------------------------------
export function updateShadowBounds(poolGroup) {
  if (!dirLight || !poolGroup) return;

  const box = new THREE.Box3().setFromObject(poolGroup);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const cam = dirLight.shadow.camera;

  // Expand a bit so wall shadows look stable and don't clip while orbiting
  const pad = 6;
  cam.left = -(size.x / 1.4 + pad);
  cam.right = (size.x / 1.4 + pad);
  cam.top = (size.y / 1.4 + pad);
  cam.bottom = -(size.y / 1.4 + pad);

  cam.near = 0.5;
  cam.far = size.z + 120;
  cam.updateProjectionMatrix();

  dirLight.target.position.copy(center);
  dirLight.target.updateMatrixWorld();
}

// --------------------------------------------------------
// Update spa void uniforms on water shader
// and clip any pool geometry that passes through the spa volume.
// --------------------------------------------------------
function getSpaWallThroatClipBox(poolGroup, spaGroup, pad = 0.01) {
  if (!poolGroup || !spaGroup) return null;

  const oriented = makeOrientedThroatVolume(poolGroup, spaGroup, pad);
  if (oriented) return oriented;

  const bounds = getPoolFootprintBoundsWorld(poolGroup);
  if (!bounds) return null;

  spaGroup.updateMatrixWorld?.(true);
  const center = new THREE.Vector3();
  spaGroup.getWorldPosition(center);

  const halfX = Math.max(0.005, (spaGroup.userData?.spaLength || 0.01) * 0.5);
  const halfY = Math.max(0.005, (spaGroup.userData?.spaWidth || 0.01) * 0.5);
  const snapSide = spaGroup?.userData?.snapSide || null;

  const insidePad = (0.05 + pad) * 3.0 + 0.30;
  const outsideDepth = (0.21 + pad) * 3.0;
  const alongPad = SPA_THROAT_ALONG_PAD;
  const extraAlongWall = SPA_THROAT_WIDTH_EXTRA;

  let minX = center.x - halfX;
  let maxX = center.x + halfX;
  let minY = center.y - halfY;
  let maxY = center.y + halfY;

  if (snapSide === 'left') {
    minX = bounds.minX - outsideDepth;
    maxX = bounds.minX + insidePad;
    minY = center.y - halfY - alongPad - extraAlongWall;
    maxY = center.y + halfY + alongPad + extraAlongWall;
  } else if (snapSide === 'right') {
    minX = bounds.maxX - insidePad;
    maxX = bounds.maxX + outsideDepth;
    minY = center.y - halfY - alongPad - extraAlongWall;
    maxY = center.y + halfY + alongPad + extraAlongWall;
  } else if (snapSide === 'front') {
    minY = bounds.minY - outsideDepth;
    maxY = bounds.minY + insidePad;
    minX = center.x - halfX - alongPad - extraAlongWall;
    maxX = center.x + halfX + alongPad + extraAlongWall;
  } else if (snapSide === 'back') {
    minY = bounds.maxY - insidePad;
    maxY = bounds.maxY + outsideDepth;
    minX = center.x - halfX - alongPad - extraAlongWall;
    maxX = center.x + halfX + alongPad + extraAlongWall;
  } else {
    return null;
  }

  return { minX, maxX, minY, maxY };
}

function getSpaClipVolumes(poolGroup, spaGroup, pad = 0.01) {
  const throat = getSpaWallThroatClipBox(poolGroup, spaGroup, pad);
  if (!throat) return null;

  const poolTopZ = getPoolCopingTopZ(poolGroup, spaGroup) ?? 0.0;
  const copingUnderZ = getPoolCopingUndersideZ(poolGroup, spaGroup) ?? (poolTopZ - 0.05);

  const blueClipBoxBase0 = shrinkThroatBoxAlongWall(throat, spaGroup, SPA_THROAT_BLUE_LENGTH_SHRINK) || throat;
  const blueClipBoxBase = extendThroatBoxAlongWall(blueClipBoxBase0, spaGroup, SPA_THROAT_BLUE_LENGTH_EXTRA) || blueClipBoxBase0;
  const yellowClipBoxBase = shrinkThroatBoxAlongWall(blueClipBoxBase, spaGroup, SPA_THROAT_YELLOW_LENGTH_SHRINK) || { ...blueClipBoxBase };

  const yellowMinZ = copingUnderZ - 0.02;
  const yellowMaxZ = poolTopZ + 0.02;

  // Restore the original blue structural-wall void vertical behaviour. The
  // blue box is intentionally shallow: 250mm below the coping underside and
  // lifted 100mm, rather than extending through the full spa depth. Horizontal
  // alignment/width is responsible for removing the wall through the spa throat.
  const blueMinZ = copingUnderZ
    - SPA_THROAT_DEBUG_BLUE_DEPTH
    - SPA_THROAT_DEBUG_BLUE_BOTTOM_PAD
    + SPA_THROAT_DEBUG_BLUE_Z_LIFT;
  const blueMaxZ = copingUnderZ
    + SPA_THROAT_DEBUG_BLUE_TOP_PAD
    + SPA_THROAT_DEBUG_BLUE_Z_LIFT;

  const yellowOriented = Number.isFinite(yellowClipBoxBase?.halfAlong) ? yellowClipBoxBase : null;
  const blueOriented = Number.isFinite(blueClipBoxBase?.halfAlong) ? blueClipBoxBase : null;

  const yellowClipBox = yellowOriented ? makeAabbFromOrientedVolume(yellowOriented) : yellowClipBoxBase;
  const blueClipBox = blueOriented ? makeAabbFromOrientedVolume(blueOriented) : blueClipBoxBase;

  return {
    throat,
    poolTopZ,
    copingUnderZ,
    yellowClipBox,
    blueClipBox,
    yellowMinZ,
    yellowMaxZ,
    blueMinZ,
    blueMaxZ,
    yellowOriented,
    blueOriented,
    yellowPlanes: yellowOriented ? makeClipPlanesFromOrientedVolume(yellowOriented, yellowMinZ, yellowMaxZ) : null,
    bluePlanes: blueOriented ? makeClipPlanesFromOrientedVolume(blueOriented, blueMinZ, blueMaxZ) : null
  };
}

export function updatePoolWaterVoid(poolGroup, spaGroup) {
  if (!poolGroup) return;

  // All clipping volumes below are authored in world coordinates. Keep them
  // synchronized even when this is called from pointermove, elevation changes
  // or immediately after geometry rebuilds (before the next renderer frame).
  poolGroup.updateWorldMatrix?.(true, true);
  spaGroup?.updateWorldMatrix?.(true, true);

  const poolWater = poolGroup.userData?.waterMesh || null;
  const mat = poolWater?.material || null;
  const uniforms = mat ? mat.uniforms : null;

  const applyClipToMaterial = (material, planes) => {
    if (!material) return;

    const previousPlaneCount = Array.isArray(material.clippingPlanes) ? material.clippingPlanes.length : 0;
    const previousIntersection = !!material.clipIntersection;
    const nextSpaPlanes = planes ? [...planes] : [];
    const sectionPlane = material.userData?.__sectionVoidPlane || null;
    const sectionActive = !!(sectionPlane && material.userData?.__sectionVoidPrevClipping);

    // When section view is active, PoolApp adds its own section plane after the
    // material's normal clipping planes. Do not overwrite that plane when the
    // spa yellow/blue voids refresh; update the stored base planes instead and
    // then append the section plane back on top.
    let nextPlanes = null;
    if (sectionActive) {
      material.userData.__sectionVoidPrevClipping = [...nextSpaPlanes];
      nextPlanes = [...nextSpaPlanes, sectionPlane];
    } else {
      nextPlanes = planes;
    }

    material.clippingPlanes = nextPlanes;
    material.clipIntersection = !!nextSpaPlanes.length;

    // Plane coordinates are uniforms and can change without recompiling the
    // material. Only flag a shader/program update when the number of active
    // clipping planes (or clip-intersection mode) changes. This is essential for
    // smooth live spa dragging.
    const nextPlaneCount = Array.isArray(nextPlanes) ? nextPlanes.length : 0;
    if (previousPlaneCount !== nextPlaneCount || previousIntersection !== material.clipIntersection) {
      material.needsUpdate = true;
    }
  };

  const applyOrangeClipToPoolWater = (box) => {
    if (typeof poolWater?.userData?.setOrangeClipBox === "function") {
      poolWater.userData.setOrangeClipBox(box);
    }
  };

  const updatePoolGeometryClip = (spa) => {
    if (!poolGroup) return;

    // Orange is an independent spa-interior safety void. It must never depend
    // on the yellow/blue throat calculation succeeding. During drag/resnap or
    // a shape rebuild the throat frame can be temporarily unavailable, but the
    // orange volume still has a valid spa transform and must continue clearing
    // pool geometry inside the spa.
    const interiorBox = getSpaInteriorClearBox(spa);

    let yellowPlanes = null; // coping void
    let bluePlanes = null;   // pool wall void
    let copingMeshSet = spa ? buildBulletproofCopingMeshSet(poolGroup) : null;

    if (spa) {
      const orangeOnlyVoidMode = !!spa.userData?.orangeOnlyVoidMode;
      if (!orangeOnlyVoidMode) {
        const volumes = getSpaClipVolumes(poolGroup, spa, 0.01);

        // The throat volumes are additive to the orange interior void. If a
        // transient frame cannot be resolved, leave yellow/blue disabled for
        // that refresh rather than aborting the orange clip entirely.
        if (volumes) {
          yellowPlanes = volumes.yellowPlanes || [
          new THREE.Plane(new THREE.Vector3(-1, 0, 0), volumes.yellowClipBox.minX),
          new THREE.Plane(new THREE.Vector3( 1, 0, 0), -volumes.yellowClipBox.maxX),
          new THREE.Plane(new THREE.Vector3( 0,-1, 0), volumes.yellowClipBox.minY),
          new THREE.Plane(new THREE.Vector3( 0, 1, 0), -volumes.yellowClipBox.maxY),
          new THREE.Plane(new THREE.Vector3( 0, 0,-1), volumes.yellowMinZ),
          new THREE.Plane(new THREE.Vector3( 0, 0, 1), -volumes.yellowMaxZ)
        ];

          bluePlanes = volumes.bluePlanes || [
            new THREE.Plane(new THREE.Vector3(-1, 0, 0), volumes.blueClipBox.minX),
            new THREE.Plane(new THREE.Vector3( 1, 0, 0), -volumes.blueClipBox.maxX),
            new THREE.Plane(new THREE.Vector3( 0,-1, 0), volumes.blueClipBox.minY),
            new THREE.Plane(new THREE.Vector3( 0, 1, 0), -volumes.blueClipBox.maxY),
            new THREE.Plane(new THREE.Vector3( 0, 0,-1), volumes.blueMinZ),
            new THREE.Plane(new THREE.Vector3( 0, 0, 1), -volumes.blueMaxZ)
          ];
        }
      }
    }

    poolGroup.traverse((obj) => {
      if (!obj?.isMesh) return;
      if (obj === poolWater) return;
      if (obj.userData?.isSpaWater) return;
      if (obj.userData?.isSpaWall) return;
      if (obj.userData?.isSpaChannel) return;
      if (obj.userData?.isSpaChannelWater) return;
      if (obj.userData?.waterUniforms) return;
      if (typeof obj.userData?.setSimParams === "function") return;

      const isPoolCoping = !!copingMeshSet?.has(obj);
      const isPoolWall = !!obj.userData?.isWall;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

      if (!isPoolCoping && !isPoolWall) {
        mats.forEach((m) => {
          applyClipToMaterial(m, null);
          setOrangeInteriorClipOnMaterial(m, interiorBox);
        });
        return;
      }

      const planes = isPoolCoping ? yellowPlanes : bluePlanes;
      mats.forEach((m) => {
        applyClipToMaterial(m, planes);
        if (!isPoolCoping) {
          setOrangeInteriorClipOnMaterial(m, interiorBox);
        } else {
          setOrangeInteriorClipOnMaterial(m, null);
        }
      });
    });
  };

  // Clear void if no spa provided
  if (!spaGroup) {
    if (uniforms?.spaSize?.value) uniforms.spaSize.value.set(0, 0);
    if (uniforms?.spaRadius) uniforms.spaRadius.value = 0.0;
    applyOrangeClipToPoolWater(null);
    updatePoolGeometryClip(null);
    return;
  }

  // World-space bounds (shader uses vWorld.xy)
  const spaBoxWorld = new THREE.Box3().setFromObject(spaGroup);
  const spaCenterWorld = spaBoxWorld.getCenter(new THREE.Vector3());
  const spaSizeWorld = spaBoxWorld.getSize(new THREE.Vector3());
  const orangeOnlyVoidMode = !!spaGroup.userData?.orangeOnlyVoidMode;

  // Small padding so the cutout doesn't clip the spa walls
  const pad = 0.05;

  if (uniforms?.spaCenter?.value) uniforms.spaCenter.value.set(spaCenterWorld.x, spaCenterWorld.y);
  if (uniforms?.spaSize?.value) {
    if (orangeOnlyVoidMode) uniforms.spaSize.value.set(0, 0);
    else uniforms.spaSize.value.set(spaSizeWorld.x + pad, spaSizeWorld.y + pad);
  }

  // Rounded void + edge polish tuning (meters)
  if (uniforms?.spaRadius) {
    if (orangeOnlyVoidMode) {
      uniforms.spaRadius.value = 0.0;
    } else {
      const r = 0.15 * Math.min(spaSizeWorld.x, spaSizeWorld.y);
      uniforms.spaRadius.value = Math.max(
        0.0,
        Math.min(r, Math.min(spaSizeWorld.x, spaSizeWorld.y) * 0.5)
      );
    }
  }
  if (uniforms?.spaFeather) uniforms.spaFeather.value = 0.03;
  if (uniforms?.spaEdgeWidth) uniforms.spaEdgeWidth.value = 0.08;
  if (uniforms?.spaEdgeFoam) uniforms.spaEdgeFoam.value = 0.55;
  if (uniforms?.spaEdgeDarken) uniforms.spaEdgeDarken.value = 0.25;

  const interiorBox = getSpaInteriorClearBox(spaGroup);
  applyOrangeClipToPoolWater(interiorBox);

  updatePoolGeometryClip(spaGroup);
}

// --------------------------------------------------------
// Rebuild grass overlay after pool rebuild
// --------------------------------------------------------
export function updateGrassForPool(scene, poolGroup) {
  // Instanced grass removed — keep function for compatibility with PoolApp
  return;
}
// OPTION A: joined coping


// ===== PATCH: remove coping segments intersecting spa throat =====
function removeCopingInsideThroat(group, throatBox){
  if (!group || !throatBox) return;

  group.traverse(obj=>{
    if (!obj.isMesh) return;

    const box = new THREE.Box3().setFromObject(obj);
    if (box.intersectsBox(throatBox)){
      obj.visible = false;
    }
  });
}

window.__applyCopingFix = function(){
  if (window.__copingGroup && window.__throatBox){
    removeCopingInsideThroat(window.__copingGroup, window.__throatBox);
  }
};
