// js/materials/StoneMaterialFactory.js
import * as THREE from "https://esm.sh/three@0.158.0";
import { poolSceneAssetManager } from "../assets/PoolSceneAssetManager.js";

export const STONE_TEXTURE_FILES = Object.freeze({
  map: "StoneEmbeddedTiles_DIFF_2K.webp",
  normalMap: "StoneEmbeddedTiles_NORMAL_2K.webp",
  roughnessMap: "StoneEmbeddedTiles_ROUGH_2K.webp",
  aoMap: "StoneEmbeddedTiles_AO_2K.webp",
  displacementMap: "StoneEmbeddedTiles_DISP_2K.webp"
});

function getStoneTextureUrl(fileName) {
  return new URL(`../../textures/Coping/${fileName}`, import.meta.url).href;
}

export function hydrateStoneMaterial(material, {
  repeat = 2,
  anisotropy = 12,
  includeDisplacement = false,
  displacementScale = 0.005,
  displacementBias = 0,
  debugLabel = "Stone",
  onDiffuseReady = null
} = {}) {
  if (!material?.isMaterial) return material;

  material.userData ||= {};

  // Prevent the same material from starting duplicate asynchronous hydration.
  if (material.userData.stoneHydrationStarted) return material;
  material.userData.stoneHydrationStarted = true;

  const textureSettings = {
    repeatX: repeat,
    repeatY: repeat,
    anisotropy,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter
  };

  const assign = async (slot, fileName, colorSpace = THREE.NoColorSpace) => {
    try {
      const texture = await poolSceneAssetManager.getTexture(
        getStoneTextureUrl(fileName),
        { ...textureSettings, colorSpace }
      );

      // The owning mesh may have been disposed while the request was in flight.
      if (!material || material.userData?.disposed) return null;

      material[slot] = texture;

      if (slot === "map") {
        // The initial stone colour is only a loading fallback.
        material.color?.set?.(0xffffff);
        try { onDiffuseReady?.(material, texture); } catch (_) {}
      }

      if (slot === "displacementMap") {
        material.displacementScale = displacementScale;
        material.displacementBias = displacementBias;
      }

      material.needsUpdate = true;
      return texture;
    } catch (error) {
      console.warn(`[${debugLabel}] ${fileName} failed to load; fallback retained.`, error);
      return null;
    }
  };

  // Visible colour map first.
  void assign("map", STONE_TEXTURE_FILES.map, THREE.SRGBColorSpace);

  const supporting = [
    assign("normalMap", STONE_TEXTURE_FILES.normalMap),
    assign("roughnessMap", STONE_TEXTURE_FILES.roughnessMap),
    assign("aoMap", STONE_TEXTURE_FILES.aoMap)
  ];

  if (includeDisplacement) {
    supporting.push(assign("displacementMap", STONE_TEXTURE_FILES.displacementMap));
  }

  material.userData.stoneHydrationPromise = Promise.all(supporting).then(() => {
    material.needsUpdate = true;
    return material;
  });

  return material;
}

export function createStoneMaterial({
  repeat = 2,
  anisotropy = 12,
  includeDisplacement = false,
  displacementScale = 0.005,
  displacementBias = 0,
  color = 0xc6bfb4,
  roughness = 0.72,
  metalness = 0.0,
  envMapIntensity = 1.0,
  side = THREE.FrontSide,
  debugLabel = "Stone"
} = {}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    envMapIntensity,
    side
  });

  material.userData.isStoneMaterial = true;

  hydrateStoneMaterial(material, {
    repeat,
    anisotropy,
    includeDisplacement,
    displacementScale,
    displacementBias,
    debugLabel
  });

  return material;
}
