// frontend/js/caustics/Caustics.js
import * as THREE from "https://esm.sh/three@0.158.0";

console.log("✅ Caustics.js shadow-rim v22 loaded");

/**
 * Poolly shadow-rim caustics (v22).
 *
 * There is exactly one caustic source: the horizontal animated water surface.
 * Every submerged receiver fragment (floor, wall, step, bench, spa surface) is
 * traced back to that same world-space water plane along the refracted sun path.
 * The shader then measures differential convergence of neighbouring refracted
 * rays to derive real caustic brightness. Receiver orientation only attenuates
 * energy; it never changes UV direction, tiling, scale or animation.
 *
 * This removes the v13 wall-smear problem while keeping the caustic scale and
 * movement locked to the exact WaterSim + normal-map field used by pool/water.js.
 */
export class CausticsSystem {
  constructor(renderer = null) {
    this.renderer = renderer || null;
    this.enabled = true;
    this.intensityMul = 1.0;
    this.sunDir = new THREE.Vector3(0.30, 0.80, 0.50).normalize();

    this.primaryGroup = null;
    this.waterHeightTex = null;
    this.waterTexel = new THREE.Vector2(1 / 256, 1 / 256);

    this._dummyHeightTex = new THREE.DataTexture(
      new Uint8Array([128, 0, 0, 255]), 1, 1,
      THREE.RGBAFormat, THREE.UnsignedByteType
    );
    this._dummyHeightTex.needsUpdate = true;
    this._dummyHeightTex.minFilter = THREE.NearestFilter;
    this._dummyHeightTex.magFilter = THREE.NearestFilter;
    this._dummyHeightTex.wrapS = this._dummyHeightTex.wrapT = THREE.ClampToEdgeWrapping;
    this._dummyHeightTex.colorSpace = THREE.NoColorSpace;

    // Neutral tangent-space normal for the short interval before the real
    // water textures have loaded.
    this._dummyNormalTex = new THREE.DataTexture(
      new Uint8Array([128, 128, 255, 255]), 1, 1,
      THREE.RGBAFormat, THREE.UnsignedByteType
    );
    this._dummyNormalTex.needsUpdate = true;
    this._dummyNormalTex.minFilter = THREE.LinearFilter;
    this._dummyNormalTex.magFilter = THREE.LinearFilter;
    this._dummyNormalTex.wrapS = this._dummyNormalTex.wrapT = THREE.RepeatWrapping;
    this._dummyNormalTex.colorSpace = THREE.NoColorSpace;

    this._overlayMaterials = new Set();
  }

  setRenderer(renderer) {
    this.renderer = renderer || null;
  }

  setEnabled(v) {
    this.enabled = !!v;
    this._overlayMaterials.forEach((m) => {
      if (m?.uniforms?.uEnabled) m.uniforms.uEnabled.value = this.enabled ? 1.0 : 0.0;
      const group = m?.userData?.causticsGroup;
      group?.traverse?.((obj) => {
        if (obj?.userData?.isCausticsOverlay) obj.visible = this.enabled;
      });
    });
  }

  setIntensity(v) {
    const n = Number(v);
    this.intensityMul = Number.isFinite(n) ? Math.max(0, n) : 1.0;
    this._overlayMaterials.forEach((m) => {
      if (m?.uniforms?.uIntensity) m.uniforms.uIntensity.value = this.intensityMul;
    });
  }

  // v14 intentionally locks caustic scale and speed to the visible water. Keep
  // these methods for existing UI/API compatibility, but do not create an
  // independent caustic transform that can drift away from the water texture.
  setSizeMultiplier(_v) {}
  setSpeedMultiplier(_v) {}

  setSunDirection(v) {
    if (v?.isVector3 && v.lengthSq() > 1e-8) this.sunDir.copy(v).normalize();
    this._overlayMaterials.forEach((m) => {
      if (m?.uniforms?.uSunDir) m.uniforms.uSunDir.value.copy(this.sunDir);
    });
  }

  setWaterHeightTexture(tex, simSize = 256) {
    this.waterHeightTex = tex || null;
    const imageW = Number(tex?.image?.width || tex?.source?.data?.width || 0);
    const s = imageW > 0 ? imageW : Math.max(1, Number(simSize) || 256);
    this.waterTexel.set(1 / s, 1 / s);
  }

  setPrimaryGroup(group) {
    if (!group) return;
    this.primaryGroup = group;
    const mat = group.userData?.__causticsOverlayMaterial;
    if (mat?.isShaderMaterial) this._syncGroupMaterial(mat, group);
  }

  reset() {}

  // PBRManager compatibility. The projected caustic/shadow is an independent
  // receiver overlay; it never edits the underlying tile materials.
  addToMaterial(_mat) {}
  applyToMaterial(_mat) {}

  attachToGroup(group) {
    if (!group) return;
    group.updateWorldMatrix?.(true, true);

    if (group.userData?.waterMesh && !group.userData?.poolGroup) {
      this.primaryGroup = group;
    }

    const targets = [];
    group.traverse((obj) => {
      if (!obj?.isMesh) return;
      const data = obj.userData || {};
      if (data.isCausticsOverlay) return;

      const name = String(obj.name || "").toLowerCase();
      const internalSurface = !!(
        data.isFloor || data.isPoolFloor || data.isWall || data.isStep ||
        data.isBench || data.isAcrylicWallReplacement || data.isSpaChannel ||
        data.isSpaFloor || data.isSpaWall || data.isSpaSeat ||
        name.includes("tile-liner")
      );

      if (
        !internalSurface || data.isCoping || data.isPoolPaving ||
        data.spaChannelPart === "coping" || name.includes("coping") || name.includes("paving")
      ) return;
      targets.push(obj);
    });

    group.userData = group.userData || {};
    let overlayMaterial = group.userData.__causticsOverlayMaterial;
    if (!overlayMaterial?.isShaderMaterial || !overlayMaterial.userData?.isCausticsOverlayMaterialV22) {
      // Dispose only a previous caustics overlay material. Never touch a pool
      // surface material owned by the PBR system.
      if (overlayMaterial?.userData?.isCausticsOverlayMaterial) {
        this._overlayMaterials.delete(overlayMaterial);
        overlayMaterial.dispose?.();
      }
      overlayMaterial = this._createOverlayMaterial(group);
      group.userData.__causticsOverlayMaterial = overlayMaterial;
      this._overlayMaterials.add(overlayMaterial);
    }

    overlayMaterial.userData.causticsGroup = group;
    this._syncGroupMaterial(overlayMaterial, group);

    let created = 0;
    targets.forEach((mesh) => {
      if (this._ensureOverlayForMesh(mesh, overlayMaterial)) created++;
    });

    if (created > 0) {
      console.log(`✅ [Caustics v22] ${created} shadow-rim receiver overlays attached`);
    }
  }

  update(_dt, lightPosOrNull) {
    if (lightPosOrNull?.isVector3 && lightPosOrNull.lengthSq() > 1e-8) {
      this.sunDir.copy(lightPosOrNull).normalize();
    }

    // Water animation runs immediately before this call in PoolApp, so copying
    // uniforms here keeps caustic movement frame-for-frame locked to the visible
    // water surface rather than advancing a second clock.
    this._overlayMaterials.forEach((mat) => {
      const group = mat?.userData?.causticsGroup;
      if (group) this._syncGroupMaterial(mat, group);
    });
  }

  _createOverlayMaterial(group) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uEnabled: { value: this.enabled ? 1.0 : 0.0 },
        uIntensity: { value: this.intensityMul },
        uWaterlineZ: { value: 0.0 },
        uPoolMin: { value: new THREE.Vector2(0, 0) },
        uPoolSize: { value: new THREE.Vector2(1, 1) },
        uSunDir: { value: this.sunDir.clone() },

        uHeightTex: { value: this._dummyHeightTex },
        uHeightTexValid: { value: 0.0 },
        uWaterTexel: { value: this.waterTexel.clone() },
        uNormalMap1: { value: this._dummyNormalTex },
        uNormalMap2: { value: this._dummyNormalTex },
        uNormalMap3: { value: this._dummyNormalTex },

        // Defaults mirror pool/water.js and are overwritten from the actual
        // water material every frame.
        uWaterTime: { value: 0.0 },
        uNormalScale: { value: 2.8 },
        uMicroStrength: { value: 0.020 },
        uMicroScale: { value: 11.5 },
        uMicroSpeed: { value: 0.28 },
        uNormalMapStrength: { value: 0.62 },
        uNormalMap3Strength: { value: 0.18 },
        uNormalTiling1: { value: 0.285 },
        uNormalTiling2: { value: 0.435 },
        uNormalTiling3: { value: 0.135 },
        uNormalSpeed1: { value: 0.010 },
        uNormalSpeed2: { value: 0.015 },
        uNormalOrbit3: { value: 0.020 },
        uNormalAngularSpeed3: { value: 0.060 }
      },
      vertexShader: `
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        precision highp float;

        uniform float uEnabled;
        uniform float uIntensity;
        uniform float uWaterlineZ;
        uniform vec2 uPoolMin;
        uniform vec2 uPoolSize;
        uniform vec3 uSunDir;

        uniform sampler2D uHeightTex;
        uniform float uHeightTexValid;
        uniform vec2 uWaterTexel;
        uniform sampler2D uNormalMap1;
        uniform sampler2D uNormalMap2;
        uniform sampler2D uNormalMap3;

        uniform float uWaterTime;
        uniform float uNormalScale;
        uniform float uMicroStrength;
        uniform float uMicroScale;
        uniform float uMicroSpeed;
        uniform float uNormalMapStrength;
        uniform float uNormalMap3Strength;
        uniform float uNormalTiling1;
        uniform float uNormalTiling2;
        uniform float uNormalTiling3;
        uniform float uNormalSpeed1;
        uniform float uNormalSpeed2;
        uniform float uNormalOrbit3;
        uniform float uNormalAngularSpeed3;

        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        const float ETA_AIR_TO_WATER = 1.0 / 1.333;
        const vec3 WATER_UP = vec3(0.0, 0.0, 1.0);

        float microH(vec2 p, float t) {
          float a = sin(p.x + t * uMicroSpeed) * cos(p.y * 1.17 - t * uMicroSpeed * 1.2);
          float b = sin(p.x * 1.9 - t * uMicroSpeed * 0.8) * cos(p.y * 2.3 + t * uMicroSpeed * 1.1);
          float c = sin(p.x * 3.1 + t * uMicroSpeed * 0.6) * cos(p.y * 2.7 - t * uMicroSpeed * 0.7);
          return a + 0.5 * b + 0.25 * c;
        }

        vec2 flowWarp(vec2 p, float t) {
          float w1 = sin(p.x * 0.9 + t * 0.8) * cos(p.y * 1.1 - t * 0.6);
          float w2 = sin(p.x * 1.7 - t * 0.35) * cos(p.y * 1.3 + t * 0.55);
          return vec2(w1 + 0.6 * w2, w2 - 0.4 * w1);
        }

        vec2 simUvForWorld(vec2 worldXY) {
          return clamp((worldXY - uPoolMin) / max(uPoolSize, vec2(0.001)), 0.001, 0.999);
        }

        float simHeight(vec2 uv) {
          if (uHeightTexValid < 0.5) return 0.5;
          return texture2D(uHeightTex, clamp(uv, 0.001, 0.999)).r;
        }

        // This is the SAME world-space water field used by the visible water.
        // For v22 we deliberately smooth the highest-frequency detail a little
        // so the projected pattern reads larger and less dense while remaining
        // locked to the exact animated water field.
        vec2 waterSurfaceSlope(vec2 worldXY) {
          vec2 simUV = simUvForWorld(worldXY);

          float hL = simHeight(simUV - vec2(uWaterTexel.x, 0.0));
          float hR = simHeight(simUV + vec2(uWaterTexel.x, 0.0));
          float hD = simHeight(simUV - vec2(0.0, uWaterTexel.y));
          float hU = simHeight(simUV + vec2(0.0, uWaterTexel.y));

          float dx = (hR - hL) * uNormalScale;
          float dy = (hU - hD) * uNormalScale;

          float ang = 0.63;
          mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
          vec2 p = rot * (worldXY * uMicroScale + vec2(13.7, 9.2));
          float epsMicro = 0.015;
          float mC = microH(p, uWaterTime);
          float mX = microH(p + vec2(epsMicro, 0.0), uWaterTime);
          float mY = microH(p + vec2(0.0, epsMicro), uWaterTime);
          dx += ((mX - mC) / epsMicro) * uMicroStrength * 0.10;
          dy += ((mY - mC) / epsMicro) * uMicroStrength * 0.10;

          float hC = simHeight(simUV);
          vec2 warp = (hC - 0.5) * vec2(0.08, 0.06);

          vec2 uv1 = worldXY * uNormalTiling1 + warp
            + vec2(uWaterTime * uNormalSpeed1, uWaterTime * uNormalSpeed1 * 0.65)
            + flowWarp(worldXY * 0.35, uWaterTime) * 0.045;

          vec2 uv2 = worldXY * uNormalTiling2 - warp
            + vec2(uWaterTime * uNormalSpeed2, uWaterTime * uNormalSpeed2 * 0.92)
            + flowWarp(worldXY * 0.55 + 7.3, uWaterTime) * 0.03;

          float orbitPhase = uWaterTime * uNormalAngularSpeed3;
          vec2 orbit3 = vec2(cos(orbitPhase), sin(orbitPhase)) * uNormalOrbit3;
          vec2 uv3 = worldXY * uNormalTiling3 + orbit3
            + flowWarp(worldXY * 0.42 + 3.1, uWaterTime * 0.20) * 0.006;

          vec3 n1 = texture2D(uNormalMap1, uv1).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uNormalMap2, uv2).xyz * 2.0 - 1.0;
          vec3 n3 = texture2D(uNormalMap3, uv3).xyz * 2.0 - 1.0;

          // Mirror pool/water.js exactly: combine the same three animated normal
          // maps before applying the normalMapStrength. Do not rotate or rebuild
          // this field for walls/floors; it exists only on the horizontal water plane.
          vec2 nm12 = n1.xy + n2.xy;
          vec2 nm3 = n3.xy * uNormalMap3Strength;
          vec2 nm = nm12 + nm3;
          float nmLen = length(nm);
          if (nmLen > 0.0001) nm /= nmLen;

          dx += nm.x * uNormalMapStrength * 0.28;
          dy += nm.y * uNormalMapStrength * 0.28;

          // Optical amplitude only. Spatial scale, UVs, movement and flow warp
          // remain exactly linked to the visible water surface.
          return vec2(dx, dy) * 0.31;
        }

        vec3 waterSurfaceNormal(vec2 worldXY) {
          vec2 slope = waterSurfaceSlope(worldXY);
          return normalize(vec3(-slope.x, -slope.y, 1.0));
        }

        vec3 lightToSun() {
          vec3 L = normalize(uSunDir);
          if (L.z < 0.0) L = -L;
          return L;
        }

        vec3 flatWaterRay() {
          vec3 ray = refract(-lightToSun(), WATER_UP, ETA_AIR_TO_WATER);
          if (ray.z > -0.03) {
            vec3 L = lightToSun();
            ray = normalize(vec3(-L.xy, -max(abs(L.z), 0.25)));
          }
          return ray;
        }

        vec3 refractedWaterRay(vec2 surfaceXY) {
          vec3 ray = refract(-lightToSun(), waterSurfaceNormal(surfaceXY), ETA_AIR_TO_WATER);
          if (ray.z > -0.03) ray = flatWaterRay();
          return ray;
        }

        // Back-project every submerged receiver point to ONE horizontal water
        // plane using the flat-water refracted light direction. The source map
        // itself then supplies the real animated normals used for focusing. This
        // stable inverse keeps floor-to-wall continuity and avoids feedback where
        // a strongly bent ray can make the projected pattern stretch into blobs.
        vec2 sourcePointForReceiver(vec3 receiverWorldPos) {
          float depth = max(uWaterlineZ - receiverWorldPos.z, 0.0);
          vec3 ray = flatWaterRay();
          float travel = depth / max(-ray.z, 0.05);
          return receiverWorldPos.xy - ray.xy * travel;
        }

        vec2 landingAtDepth(vec2 sourceXY, float depth) {
          vec3 ray = refractedWaterRay(sourceXY);
          float travel = depth / max(-ray.z, 0.05);
          return sourceXY + ray.xy * travel;
        }

        // Differential-area caustics. For v22 we keep the same water-linked basis
        // but sample over a slightly larger footprint so the pattern becomes
        // broader and less busy, then bias it toward darker shadow bodies with
        // thin bright rims instead of broad white washout.
        float causticFocus(vec2 sourceXY, float depth) {
          // 30 mm finite-difference step: small enough to resolve the existing
          // water texture while remaining stable under minification on walls.
          float e = 0.040;
          vec2 p0 = landingAtDepth(sourceXY, depth);
          vec2 px = landingAtDepth(sourceXY + vec2(e, 0.0), depth);
          vec2 py = landingAtDepth(sourceXY + vec2(0.0, e), depth);

          vec2 jx = (px - p0) / e;
          vec2 jy = (py - p0) / e;
          float area = abs(jx.x * jy.y - jx.y * jy.x);
          area = clamp(area, 0.18, 4.8);
          return 1.0 / area;
        }

        void main() {
          if (uEnabled < 0.5) discard;
          if (vWorldPos.z >= uWaterlineZ - 0.004) discard;

          float depth = uWaterlineZ - vWorldPos.z;
          float waterlineFade = smoothstep(0.018, 0.09, depth);
          if (waterlineFade <= 0.001) discard;

          vec2 sourceXY = sourcePointForReceiver(vWorldPos);

          // Do not clip the normal-map field at the pool edge. The visible water
          // normal textures are world-space/repeating, so allowing the same field
          // to extend slightly past the plan boundary keeps caustics present on
          // every submerged wall. WaterSim itself remains safely clamped.
          float focus = causticFocus(sourceXY, depth);

          // Shadow-led response: darker submerged bands with thin white rims.
          // This keeps the look closer to a projected shadow of the surface
          // texture instead of a white overlay wash.
          float aa = max(fwidth(focus) * 0.90, 0.020);
          float spread = 1.0 / max(focus, 0.001);

          float shadow = smoothstep(1.10 - aa, 1.60 + aa, spread);

          float rimOuter = smoothstep(0.98 - aa, 1.08 + aa, spread);
          float rimInner = smoothstep(1.12 - aa, 1.26 + aa, spread);
          float rim = clamp(rimOuter - rimInner, 0.0, 1.0);

          float sparkle = smoothstep(1.32 - aa, 1.65 + aa, focus) * 0.18;

          if (shadow < 0.020 && rim < 0.018 && sparkle < 0.010) discard;

          // Receiver normal affects only energy, never texture direction/UVs.
          vec3 receiverN = normalize(vWorldNormal);
          vec3 ray = flatWaterRay();
          float incidence = abs(dot(receiverN, -ray));
          float receiverStrength = mix(0.42, 1.0, smoothstep(0.08, 0.82, incidence));

          // Slight attenuation in very deep water; focusing itself already
          // changes naturally with depth through the ray projection above.
          float depthAtten = mix(1.0, 0.76, clamp(depth / 2.8, 0.0, 1.0));

          vec3 shadowColour = vec3(0.09, 0.17, 0.24);
          vec3 rimColour = vec3(0.96, 0.985, 1.0);
          float mixTotal = max(shadow + rim + sparkle, 0.0001);
          vec3 colour = (shadowColour * shadow + rimColour * (rim + sparkle)) / mixTotal;

          float alpha = (shadow * 0.24 + rim * 0.13 + sparkle * 0.05)
            * max(uIntensity, 0.0)
            * waterlineFade
            * receiverStrength
            * depthAtten;
          alpha = clamp(alpha, 0.0, 0.22);
          if (alpha < 0.002) discard;

          gl_FragColor = vec4(colour, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      toneMapped: true
    });

    material.name = "PoollyShadowRimCausticsV22";
    material.userData.isCausticsOverlayMaterial = true;
    material.userData.isCausticsOverlayMaterialV22 = true;
    material.userData.causticsGroup = group || null;
    return material;
  }

  _ensureOverlayForMesh(sourceMesh, overlayMaterial) {
    if (!sourceMesh?.isMesh || !sourceMesh.geometry || !overlayMaterial) return null;
    sourceMesh.userData = sourceMesh.userData || {};

    let overlay = sourceMesh.userData.__causticsOverlayMesh;
    const needsRebuild = !overlay?.isMesh || overlay.parent !== sourceMesh || !overlay.userData?.isCausticsOverlayV22;

    if (needsRebuild) {
      if (overlay?.parent === sourceMesh) sourceMesh.remove(overlay);
      overlay = new THREE.Mesh(sourceMesh.geometry, overlayMaterial);
      overlay.name = "__PoollyShadowRimCausticsV22";
      overlay.userData.isCausticsOverlay = true;
      overlay.userData.isCausticsOverlayV22 = true;
      overlay.userData.preserveMaterial = true;
      overlay.userData.ignoreRaycast = true;
      overlay.renderOrder = 40;
      overlay.frustumCulled = sourceMesh.frustumCulled;
      overlay.raycast = () => {};
      sourceMesh.add(overlay);
      sourceMesh.userData.__causticsOverlayMesh = overlay;
    } else {
      overlay.geometry = sourceMesh.geometry;
      overlay.material = overlayMaterial;
    }

    overlay.visible = this.enabled;
    return overlay;
  }

  _syncGroupMaterial(mat, group) {
    if (!mat?.uniforms || !group) return;
    group.updateWorldMatrix?.(true, true);

    const waterMesh = group.userData?.waterMesh || group.userData?.spaWaterMesh || null;
    const wu = waterMesh?.material?.uniforms || null;

    let waterline = 0.0;
    if (waterMesh?.isMesh) {
      waterline = waterMesh.getWorldPosition(new THREE.Vector3()).z;
    } else {
      const b = new THREE.Box3().setFromObject(group);
      if (!b.isEmpty()) waterline = b.max.z;
    }

    const u = mat.uniforms;
    u.uEnabled.value = this.enabled ? 1.0 : 0.0;
    u.uIntensity.value = this.intensityMul;
    u.uWaterlineZ.value = waterline;
    u.uSunDir.value.copy(this.sunDir);

    // Prefer the exact world-space domain used by the water shader. Fallback to
    // the water mesh bounds only during initial construction.
    if (wu?.poolMin?.value?.isVector2 && wu?.poolSize?.value?.isVector2) {
      u.uPoolMin.value.copy(wu.poolMin.value);
      u.uPoolSize.value.copy(wu.poolSize.value);
    } else if (waterMesh?.isMesh) {
      const b = new THREE.Box3().setFromObject(waterMesh);
      if (!b.isEmpty()) {
        u.uPoolMin.value.set(b.min.x, b.min.y);
        u.uPoolSize.value.set(
          Math.max(0.001, b.max.x - b.min.x),
          Math.max(0.001, b.max.y - b.min.y)
        );
      }
    }

    const heightTex = wu?.heightTex?.value || this.waterHeightTex || this._dummyHeightTex;
    u.uHeightTex.value = heightTex;
    u.uHeightTexValid.value = (wu?.heightTex?.value || this.waterHeightTex) ? 1.0 : 0.0;

    const imageW = Number(heightTex?.image?.width || heightTex?.source?.data?.width || 0);
    const texel = imageW > 0 ? 1 / imageW : this.waterTexel.x;
    u.uWaterTexel.value.set(texel, texel);

    u.uNormalMap1.value = wu?.normalMap1?.value || this._dummyNormalTex;
    u.uNormalMap2.value = wu?.normalMap2?.value || this._dummyNormalTex;
    u.uNormalMap3.value = wu?.normalMap3?.value || this._dummyNormalTex;

    const copyNumber = (uniformName, waterName, fallback) => {
      const value = Number(wu?.[waterName]?.value);
      u[uniformName].value = Number.isFinite(value) ? value : fallback;
    };

    copyNumber("uWaterTime", "uTime", 0.0);
    copyNumber("uNormalScale", "normalScale", 2.8);
    copyNumber("uMicroStrength", "microStrength", 0.020);
    copyNumber("uMicroScale", "microScale", 11.5);
    copyNumber("uMicroSpeed", "microSpeed", 0.28);
    copyNumber("uNormalMapStrength", "normalMapStrength", 0.62);
    copyNumber("uNormalMap3Strength", "normalMap3Strength", 0.18);
    copyNumber("uNormalTiling1", "normalTiling1", 0.285);
    copyNumber("uNormalTiling2", "normalTiling2", 0.435);
    copyNumber("uNormalTiling3", "normalTiling3", 0.135);
    copyNumber("uNormalSpeed1", "normalSpeed1", 0.010);
    copyNumber("uNormalSpeed2", "normalSpeed2", 0.015);
    copyNumber("uNormalOrbit3", "normalOrbit3", 0.020);
    copyNumber("uNormalAngularSpeed3", "normalAngularSpeed3", 0.060);
  }

  dispose() {
    this._overlayMaterials.forEach((m) => m?.dispose?.());
    this._overlayMaterials.clear();
    this._dummyHeightTex?.dispose?.();
    this._dummyNormalTex?.dispose?.();
  }
}
