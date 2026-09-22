import * as THREE from "https://esm.sh/three@0.158.0";
import { RGBELoader } from "https://esm.sh/three@0.158.0/examples/jsm/loaders/RGBELoader.js";

export class PoolSceneAssetManager {
  constructor({ onLoadingStateChange = null, onError = null } = {}) {
    this.textureLoader = new THREE.TextureLoader();
    this.textureCache = new Map();
    this.inFlightTextures = new Map();
    this.textureKeys = new WeakMap();
    this.pendingLoads = new Map();
    this.nextLoadId = 1;
    this.onLoadingStateChange = onLoadingStateChange;
    this.onError = onError;
    this.environmentTexture = null;
    this.environmentSource = null;
    this.environmentPromise = null;
    this.pmremGenerator = null;
    this.disposed = false;
  }

  async getTexture(url, wrapSettings = {}) {
    this.#assertActive();
    if (typeof url !== "string" || !url.trim()) throw new TypeError("getTexture() requires a non-empty URL.");

    const settings = this.#normaliseSettings(wrapSettings);
    const key = this.#textureKey(url, settings);
    if (this.textureCache.has(key)) return this.textureCache.get(key);
    if (this.inFlightTextures.has(key)) return this.inFlightTextures.get(key);

    const promise = this.textureLoader.loadAsync(url).then((texture) => {
      texture.name = settings.name || url;
      texture.wrapS = settings.wrapS;
      texture.wrapT = settings.wrapT;
      texture.repeat.set(settings.repeatX, settings.repeatY);
      texture.offset.set(settings.offsetX, settings.offsetY);
      texture.center.set(settings.centerX, settings.centerY);
      texture.rotation = settings.rotation;
      texture.flipY = settings.flipY;
      texture.anisotropy = settings.anisotropy;
      texture.generateMipmaps = settings.generateMipmaps;
      texture.minFilter = settings.minFilter;
      texture.magFilter = settings.magFilter;
      texture.colorSpace = settings.colorSpace;
      texture.needsUpdate = true;
      this.textureCache.set(key, texture);
      this.textureKeys.set(texture, key);
      this.inFlightTextures.delete(key);
      return texture;
    }).catch((error) => {
      this.inFlightTextures.delete(key);
      this.#report(error, { operation: "getTexture", url, settings });
      throw new Error(`Unable to load texture: ${url}`, { cause: error });
    });

    this.inFlightTextures.set(key, promise);
    return promise;
  }

  async applyPoolTexture(mesh, textureType, assetUrl, { wrapSettings = {}, onProgress = null } = {}) {
    this.#assertActive();
    if (!mesh?.isMesh) throw new TypeError("applyPoolTexture() requires a THREE.Mesh.");
    if (typeof textureType !== "string" || !textureType) throw new TypeError("textureType must be a material texture property.");

    const loadId = this.#beginLoad({ type: "texture", assetUrl, textureType, mesh });
    try {
      onProgress?.(0);
      const texture = await this.getTexture(assetUrl, wrapSettings);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials.filter(Boolean)) {
        material[textureType] = texture;
        material.needsUpdate = true;
      }
      onProgress?.(1);
      return texture;
    } catch (error) {
      this.#report(error, { operation: "applyPoolTexture", assetUrl, textureType, mesh });
      throw error;
    } finally {
      this.#endLoad(loadId);
    }
  }

  initEnvironment({ renderer, scene, hdriUrl, useAsBackground = false, environmentIntensity = 1 }) {
    this.#assertActive();
    if (this.environmentPromise) return this.environmentPromise;
    if (!renderer?.isWebGLRenderer || !scene?.isScene || !hdriUrl) {
      return Promise.reject(new TypeError("renderer, scene and hdriUrl are required."));
    }

    const loadId = this.#beginLoad({ type: "environment", assetUrl: hdriUrl });
    this.environmentPromise = (async () => {
      try {
        this.pmremGenerator ||= new THREE.PMREMGenerator(renderer);
        this.pmremGenerator.compileEquirectangularShader();
        const source = await new RGBELoader().setDataType(THREE.HalfFloatType).loadAsync(hdriUrl);
        source.mapping = THREE.EquirectangularReflectionMapping;
        const target = this.pmremGenerator.fromEquirectangular(source);
        this.environmentSource?.dispose?.();
        this.environmentTexture?.dispose?.();
        this.environmentSource = source;
        this.environmentTexture = target.texture;
        scene.environment = this.environmentTexture;
        if ("environmentIntensity" in scene) scene.environmentIntensity = environmentIntensity;
        if (useAsBackground) scene.background = this.environmentTexture;
        return this.environmentTexture;
      } catch (error) {
        this.environmentPromise = null;
        this.#report(error, { operation: "initEnvironment", hdriUrl });
        throw new Error(`Unable to load HDR environment: ${hdriUrl}`, { cause: error });
      } finally {
        this.#endLoad(loadId);
      }
    })();
    return this.environmentPromise;
  }

  disposeUnused(activeRoots) {
    this.#assertActive();
    const roots = (Array.isArray(activeRoots) ? activeRoots : [activeRoots]).filter(Boolean);
    const activeTextures = new Set();
    for (const root of roots) {
      root.traverse?.((object) => {
        if (!object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          for (const value of Object.values(material || {})) if (value?.isTexture) activeTextures.add(value);
        }
      });
    }

    let disposedTextures = 0;
    for (const [key, texture] of this.textureCache) {
      if (!activeTextures.has(texture)) {
        texture.dispose();
        this.textureCache.delete(key);
        this.textureKeys.delete(texture);
        disposedTextures += 1;
      }
    }
    return { disposedTextures, retainedTextures: this.textureCache.size };
  }

  dispose() {
    if (this.disposed) return;
    for (const texture of this.textureCache.values()) texture.dispose();
    this.textureCache.clear();
    this.inFlightTextures.clear();
    this.environmentTexture?.dispose?.();
    this.environmentSource?.dispose?.();
    this.pmremGenerator?.dispose?.();
    this.pendingLoads.clear();
    this.disposed = true;
    this.#emitLoadingState();
  }

  getStats() {
    return {
      cachedTextures: this.textureCache.size,
      inFlightTextures: this.inFlightTextures.size,
      pendingLoads: this.pendingLoads.size,
      hasEnvironment: Boolean(this.environmentTexture)
    };
  }

  #normaliseSettings(settings) {
    return {
      name: settings.name || "",
      wrapS: settings.wrapS ?? THREE.RepeatWrapping,
      wrapT: settings.wrapT ?? THREE.RepeatWrapping,
      repeatX: settings.repeatX ?? settings.repeat?.x ?? 1,
      repeatY: settings.repeatY ?? settings.repeat?.y ?? 1,
      offsetX: settings.offsetX ?? settings.offset?.x ?? 0,
      offsetY: settings.offsetY ?? settings.offset?.y ?? 0,
      centerX: settings.centerX ?? settings.center?.x ?? 0,
      centerY: settings.centerY ?? settings.center?.y ?? 0,
      rotation: settings.rotation ?? 0,
      flipY: settings.flipY ?? true,
      anisotropy: settings.anisotropy ?? 12,
      generateMipmaps: settings.generateMipmaps ?? true,
      minFilter: settings.minFilter ?? THREE.LinearMipmapLinearFilter,
      magFilter: settings.magFilter ?? THREE.LinearFilter,
      colorSpace: settings.colorSpace ?? THREE.NoColorSpace
    };
  }

  #textureKey(url, settings) {
    const { name, ...cacheSettings } = settings;
    return JSON.stringify({ url, ...cacheSettings });
  }

  #beginLoad(details) {
    const id = this.nextLoadId++;
    this.pendingLoads.set(id, details);
    this.#emitLoadingState();
    return id;
  }

  #endLoad(id) {
    this.pendingLoads.delete(id);
    this.#emitLoadingState();
  }

  #emitLoadingState() {
    try {
      this.onLoadingStateChange?.({
        isLoading: this.pendingLoads.size > 0,
        pendingCount: this.pendingLoads.size,
        operations: [...this.pendingLoads.values()]
      });
    } catch (error) {
      console.warn("[PoolSceneAssetManager] Loading callback failed", error);
    }
  }

  #report(error, context) {
    try {
      if (this.onError) this.onError(error, context);
      else console.error("[PoolSceneAssetManager]", error, context);
    } catch (callbackError) {
      console.error("[PoolSceneAssetManager] Error callback failed", callbackError);
    }
  }

  #assertActive() {
    if (this.disposed) throw new Error("PoolSceneAssetManager has been disposed.");
  }
}

export const poolSceneAssetManager = new PoolSceneAssetManager();

/*
 * KTX2/Basis upgrade path:
 * Replace textureLoader with a configured KTX2Loader:
 * const loader = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
 * The cache and assignment API can remain unchanged.
 */
