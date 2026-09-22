# Maintainability refactor

This patch deliberately avoids rewriting pool geometry.

## Added
- `frontend/js/state/PoolState.js`
  - one authoritative `poolParams` object
  - backward-compatible direct mutation through a Proxy
  - subscription, patch and snapshot API

- `frontend/js/core/ControllerRegistry.js`
  - lifecycle ownership for long-lived controllers
  - central disposal boundary

- `frontend/js/materials/StoneMaterialFactory.js`
  - one progressive texture-loading path for coping and paving
  - all stone textures now use `PoolSceneAssetManager`
  - visible fallback colour during startup
  - diffuse first; normal/roughness/AO/displacement progressively

## Migrated
- generic pool coping
- rectangular coping
- oval coping
- kidney coping
- L-shape coping
- central coping PBR material
- paving

## Intentionally not changed
- pool geometry algorithms
- step/bench algorithms
- spa snapping algorithms
- water shaders
- HDR/PMREM environment pipeline
- UI behaviour
- undo/redo behaviour

## Recommended next refactor
Split `PoolApp.js` incrementally around stable boundaries:
1. CameraController
2. SelectionController
3. DimensionController
4. SpaController
5. HistoryController

Do not move all behaviours at once.
