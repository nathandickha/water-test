// js/app/PoolApp.js
import * as THREE from "https://esm.sh/three@0.158.0";
import {
  initScene,
  updateGroundVoid,
  updatePoolWaterVoid,
  updateSpaDragPreview,
  updateGrassForPool,
  purgeDetachedSpaChannelArtifacts,
  getPoolPavingContours
} from "../scene.js?v=20260911-reference-water-v1";

import { createPoolGroup, previewUpdateDepths } from "../pool/pool.js?v=20260911-reference-water-v1";
import { createPoolWater, createWaterFeatureMaterial } from "../pool/water.js?v=20260911-reference-water-v1";
import { EditablePolygon } from "../pool/editing/polygon.js";

import {
  createSpa,
  spas,
  setSelectedSpa,
  setSpaTopOffset,
  getSpaTopOffsetConstraints,
  updateSpa,
  snapToPool,
  disposeSpa
} from "../pool/spa.js?v=20260911-reference-water-v1";

import { PoolEditor } from "../pool/pool-editor.js?v=20260830-feature-v16l";

import { setupSidePanels } from "../ui/UI.js";
import { PBRManager } from "../pbr/PBR.js?v=20260902-tile-size-v1";
import { CausticsSystem } from "../caustics/Caustics.js?v=20260913-shadow-rim-v22";
import { createRectanglePool } from "../pool/shapes/rectanglePool.js?v=20260911-reference-water-v1";
import { createOvalPool } from "../pool/shapes/ovalPool.js?v=20260911-reference-water-v1";
import { createKidneyPool } from "../pool/shapes/kidneyPool.js?v=20260911-reference-water-v1";
import { createLShapePool } from "../pool/shapes/lshapePool.js?v=20260911-reference-water-v1";
import { createPoolState } from "../state/PoolState.js";
import { ControllerRegistry } from "../core/ControllerRegistry.js";


const RAISED_POOL_HEIGHT = 0.7;

const STARTER_POOL_PRESETS = [
  {
    id: "rectangle-classic",
    title: "Rectangle Pool",
    description: "6 x 4 m rectangle starter with a 2 m rounded corner, bench seat and Arctic Blue tile.",
    preview: "rectangle",
    previewCamera: { direction: [1, 1, 0.75], target: "bounds" },
    params: {
      shape: "rectangular",
      length: 6,
      width: 4,
      shallow: 1.2,
      deep: 1.8,
      shallowFlat: 1,
      deepFlat: 1,
      stepCount: 3,
      stepDepth: 0.25,
      stepWidth: 0.9,
      stepExtension: 0.3,
      bench2Extension: 0.6,
      stepBenchMode: "bench",
      stepWall: "west",
      stepPosition: "left",
      stepShape: "radius",
      tileColor: "Arctic Blue"
    },
    customFootprint: { type: "rounded-corner-rectangle", radius: 2, corner: "back-right" },
    tileColor: "Arctic Blue",
    spa: null
  },
  {
    id: "rectangle-square-spa",
    title: "Rectangle + Square Spa",
    description: "Rectangle pool with a square spa ready to reposition.",
    preview: "rectangle",
    params: { shape: "rectangular", length: 9, width: 4.5, shallow: 1.2, deep: 1.8, shallowFlat: 1, deepFlat: 1, stepCount: 3, stepDepth: 0.25 },
    spa: { shape: "square", width: 2.0, length: 2.0, topHeight: 0 }
  },
  {
    id: "rectangle-circular-spa",
    title: "Rectangle + Circular Spa",
    description: "Rectangle pool with a circular spa preset.",
    preview: "rectangle",
    params: { shape: "rectangular", length: 9, width: 4.5, shallow: 1.2, deep: 1.8, shallowFlat: 1, deepFlat: 1, stepCount: 3, stepDepth: 0.25 },
    spa: { shape: "circular", width: 2.0, length: 2.0, topHeight: 0 }
  },
  {
    id: "l-shape",
    title: "L-Shape Pool",
    description: "L-shape starter using the notch length and width controls.",
    preview: "lshape",
    params: { shape: "L", length: 10, width: 5.5, shallow: 1.2, deep: 1.8, shallowFlat: 1, deepFlat: 1, stepCount: 3, stepDepth: 0.25, notchLengthX: 0.4, notchWidthY: 0.45 },
    spa: null
  },
  {
    id: "l-shape-spa",
    title: "L-Shape + Spa",
    description: "L-shape pool with a square spa preset.",
    preview: "lshape",
    params: { shape: "L", length: 10, width: 5.5, shallow: 1.2, deep: 1.8, shallowFlat: 1, deepFlat: 1, stepCount: 3, stepDepth: 0.25, notchLengthX: 0.4, notchWidthY: 0.45 },
    spa: { shape: "square", width: 2.0, length: 2.0, topHeight: 0 }
  },
  {
    id: "oval",
    title: "Oval Pool",
    description: "Soft oval pool starter for rounded designs.",
    preview: "oval",
    params: { shape: "oval", length: 8, width: 4, shallow: 1.2, deep: 1.8, shallowFlat: 1, deepFlat: 1, stepCount: 3, stepDepth: 0.25 },
    spa: null
  },
  {
    id: "kidney",
    title: "Kidney Pool",
    description: "Kidney-shaped starter with editable kidney settings.",
    preview: "oval",
    params: { shape: "kidney", length: 9, width: 4.8, shallow: 1.2, deep: 1.8, shallowFlat: 1, deepFlat: 1, stepCount: 3, stepDepth: 0.25, kidneyLeftRadius: 2.0, kidneyRightRadius: 3.0, kidneyOffset: 1.0 },
    spa: null
  },
  {
    id: "lap-pool",
    title: "Lap Pool",
    description: "Long narrow pool preset for lap-style layouts.",
    preview: "lap",
    params: { shape: "rectangular", length: 14, width: 3, shallow: 1.2, deep: 1.8, shallowFlat: 1, deepFlat: 1, stepCount: 3, stepDepth: 0.25 },
    spa: null
  },
  {
    id: "plunge-pool",
    title: "Plunge Pool",
    description: "Compact starter pool for small-space concepts.",
    preview: "plunge",
    params: { shape: "rectangular", length: 5, width: 3, shallow: 1.2, deep: 1.8, shallowFlat: 1, deepFlat: 1, stepCount: 2, stepDepth: 0.25 },
    spa: null
  }
];


export class PoolApp {
    constructor() {
    this.controllers = new ControllerRegistry();

    this.poolParams = createPoolState({
      length: 10,
      width: 5,
      shallow: 1.2,
      deep: 2.5,
      shape: "rectangular",
      shallowFlat: 2,
      deepFlat: 2,
      stepCount: 3,
      stepDepth: 0.25,
      stepWidth: 0.9,
      bench2Extension: 0.6,
      diagonalStepSize: 0.45,
      stepWall: "west",
      stepPosition: "center",
      stepShape: "rectangle",
      stepBenchMode: "bench",

      notchLengthX: 0.4,
      notchWidthY: 0.45,

      kidneyLeftRadius: 2.0,
      kidneyRightRadius: 3.0,
      kidneyOffset: 1.0,
      raised: false,
      poolElevation: 0
    });

    this.tileSize = 0.3;
    this.tileFaceSize = 48;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.ground = null;
    this.controls = null;
    this.clock = null;

    this.editablePolygon = null;
    this.poolGroup = null;

    this.clearSpaHoverHighlight();
    this.clearSpaSelectedHighlight();
    this.spa = null;
    this.transformControls = null;
    this.selectedSpa = null;
    this.hoveredSpa = null;
    this.hoverSpaHighlight = null;
    this.selectedSpaHighlight = null;
    this.spaDrag = { active: false, offset: new THREE.Vector3(), plane: new THREE.Plane(), moved: false, previewRaf: 0, previewLastTs: 0, previewPending: false, previewState: null };

    this.poolEditor = null;
    this.pbrManager = null;
    this.caustics = null;

    this.sectionViewEnabled = false;
    this.sectionViewClipPlane = null;
    this.sectionViewSavedCamera = null;
    this.sectionViewOverlay = null;
    this.sectionViewRendererLocalClippingPrev = null;
    this.sectionViewSignature = "";
    this.sectionViewVoidBox = null;
    this.sectionViewRefreshSeq = 0;

    // Step interaction state
    this.selectedStep = null;
    this.hoveredStep = null;
    this.hoverHighlightMesh = null;
    this.selectedHighlightMesh = null;

    // Wall interaction state
    this.selectedWall = null;
    this.hoveredWall = null;
    this.hoverWallHighlightMesh = null;
    this.selectedWallHighlightMesh = null;

    this.customizeMode = false;
    this.customizeWallSelections = [];
    this.customizeSelectionHighlightMeshes = [];
    this.customizePreview = null;
    this.customizePreviewLine = null;
    this.customizeEditEdgeIndex = null;
    this.customizeRadius = 1.0;
    this.customizeRadiusBounds = { min: 1.0, max: 4.0 };

    this.undoStack = [];
    this.redoStack = [];
    this.undoLimit = 50;
    this.wallRaiseBySourceEdge = {};
    this.__buildTag = "confirm-undo-patched";

    this.baseShapeType = this.poolParams.shape;
    this.isCustomShape = false;

    this.dimensionHandles = {
      container: null,
      items: {},
      drag: null
    };
    this.spaDimensionHandles = {
      meshes: {},
      drag: null,
      raycaster: null,
      mouse: null
    };
    this.sectionDimensionHandles = {
      meshes: {},
      drag: null,
      raycaster: null,
      mouse: null
    };
    // Optional pool features controlled by the external Design Controls panel.
    this.poolFeatures = new Set();
    this.poolFeatureGroup = null;
    this.barStoolPlacements = null;
    this.barStoolDrag = null;
    this.raisedWallWaterFeaturePlacements = {};
    this.raisedWallWaterFeatureDrag = null;
    this.acrylicWindowState = { length: 1.8, height: 0.8, placement: null };
    this.bladeLength = 1.2;
    this.acrylicWindowDrag = null;
    this._acrylicWindowCut = null;

    // Oval infinity-edge arc controls. Angles are stored in radians and are
    // shared by the coping cut, lowered wall, overflow water and catch tank.
    this.ovalInfinityArc = null;
    this.ovalInfinityHandles = { meshes: {}, drag: null, raycaster: null, mouse: null };
    // L-shape infinity controls use continuous distance around the ordered wall perimeter.
    this.lInfinityRange = null;
    this.lInfinityHandles = { meshes: {}, drag: null, raycaster: null, mouse: null };
    // Rectangle + freeform infinity controls use a start/end distance along the
    // active straight pool edge.  The geometry is rebuilt from this range so
    // the handles control the spill wall, tank, returns, coping and water as one system.
    this.straightInfinityRange = null;
    this.straightInfinityHandles = { meshes: {}, drag: null, raycaster: null, mouse: null };
    this._straightInfinityFrameState = null;

    // Scene-handle reveal state. Handles remain at 50% opacity by default and
    // become fully opaque only while the pointer is over that handle or it is
    // being dragged.
    this.handleHoverReveal = { pool: false, spa: false, infinity: false };
    this.handleHoverTarget = null;


    // -----------------------------
    // Live preview + debounced rebuild (performance)
    // -----------------------------
    this._live = {
      dragging: false,
      // throttle preview to ~20fps by default
      previewFps: 20,
      lastPreviewTs: 0,
      previewRaf: 0,
      lastInputTs: 0,
      previewStreamMs: 200,
      // debounce rebuild (ms)
      rebuildDebounceMs: 200,
      rebuildTimer: 0,
      // accurate live rebuilds for shapes whose topology changes during drag
      accuratePreviewFps: 12,
      lastAccuratePreviewTs: 0,
      accuratePreviewInFlight: false,
      accuratePreviewQueued: false,
      // dirty params since last preview/rebuild
      dirty: new Set(),
      // snapshot of params at time poolGroup was (last) rebuilt
      baseParams: null,
      // true whenever slider input has changed real geometry and an
      // accurate rebuild still needs to be committed on release
      commitNeeded: false
    };
  }


  


// -----------------------------
  // Dimension drag handles (freeform-style scene handles)
  // -----------------------------
  _markPoolParamDirty(id) {
    this._live.dirty.add(id);
    this._live.commitNeeded = true;
    this._live.lastInputTs = performance.now ? performance.now() : Date.now();
    this._schedulePreviewTick();
    this._scheduleRebuildDebounced();
  }

  _getHandleAxisInfo(key) {
    const k = String(key || "").toLowerCase();
    if (k.includes("elevation") || (k.includes("shallow") && !k.includes("flat"))) return { axis: "z", vector: new THREE.Vector3(0, 0, 1), label: "Z" };
    if (k.includes("deep") && !k.includes("flat")) return { axis: "z", vector: new THREE.Vector3(0, 0, 1), label: "Z" };
    if (k.includes("top") || k.includes("bottom") || k.includes("width")) return { axis: "y", vector: new THREE.Vector3(0, 1, 0), label: "Y" };
    return { axis: "x", vector: new THREE.Vector3(1, 0, 0), label: "X" };
  }

  _makeDimensionHandleMesh(key, arrow = "↔") {
    const axisInfo = this._getHandleAxisInfo(key);
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    // Smaller, quieter Poolly-style handle. The sprite material controls the
    // reveal opacity so the canvas itself can stay crisp when hovered.
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.5, size * 0.30, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(70,70,70,0.28)";
    ctx.stroke();

    ctx.fillStyle = "rgba(30,30,30,0.90)";
    ctx.font = "500 38px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(arrow, size * 0.5, size * 0.515);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
      depthWrite: false
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.36, 0.36, 0.36);
    sprite.renderOrder = 2100;
    sprite.frustumCulled = false;
    sprite.userData.handleKey = key;
    sprite.userData.handleAxis = axisInfo.axis;
    sprite.userData.handleAxisVector = axisInfo.vector;
    sprite.userData.isDimensionHandle = true;
    sprite.userData.handleActive = false;
    return sprite;
  }

  _setDimensionHandleActive(mesh, active) {
    if (!mesh) return;
    mesh.userData.handleActive = !!active;
    const scale = active ? 0.41 : 0.36;
    mesh.scale.set(scale, scale, scale);
    if (mesh.material && active) mesh.material.opacity = 1;
  }

  _handleRevealCategory(mesh) {
    const key = String(mesh?.userData?.handleKey || '').toLowerCase();
    if (key.includes('infinity')) return 'infinity';
    if (key.startsWith('spa')) return 'spa';
    return 'pool';
  }

  _allSceneDimensionHandles() {
    const sets = [
      this.dimensionHandles?.meshes,
      this.spaDimensionHandles?.meshes,
      this.sectionDimensionHandles?.meshes,
      this.ovalInfinityHandles?.meshes,
      this.lInfinityHandles?.meshes,
      this.straightInfinityHandles?.meshes
    ];
    return sets.flatMap(set => Object.values(set || {})).filter(Boolean);
  }

  _updateHandleRevealOpacity() {
    this._allSceneDimensionHandles().forEach((mesh) => {
      if (!mesh?.material) return;
      const target = mesh.userData?.handleActive || this.handleHoverTarget === mesh ? 1 : 0.5;
      // Fast fade-in, softer fade back to the 50% resting state.
      const current = Number.isFinite(mesh.material.opacity) ? mesh.material.opacity : 0.5;
      const factor = target > current ? 0.42 : 0.24;
      mesh.material.opacity = current + (target - current) * factor;
    });
  }

  _setupHandleHoverReveal() {
    if (this._handleHoverRevealSetup || !this.renderer?.domElement || !this.camera) return;
    this._handleHoverRevealSetup = true;
    const dom = this.renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    this._boundHandleRevealPointerMove = (event) => {
      const activeDrag = this.ovalInfinityHandles?.drag
        || this.lInfinityHandles?.drag
        || this.straightInfinityHandles?.drag
        || this.spaDimensionHandles?.drag
        || this.dimensionHandles?.drag
        || this.sectionDimensionHandles?.drag;
      if (activeDrag?.handle) {
        this.handleHoverTarget = activeDrag.handle;
        return;
      }

      const rect = dom.getBoundingClientRect();
      mouse.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, this.camera);

      const handleHits = raycaster.intersectObjects(this._allSceneDimensionHandles().filter(h => h?.visible), false);
      this.handleHoverTarget = handleHits[0]?.object || null;
    };

    this._boundHandleRevealPointerLeave = () => { this.handleHoverTarget = null; };
    dom.addEventListener('pointermove', this._boundHandleRevealPointerMove, { passive: true });
    dom.addEventListener('pointerleave', this._boundHandleRevealPointerLeave, { passive: true });
  }

  _orientDimensionHandleToCamera(mesh, worldPoint) {
    if (!mesh?.material || !worldPoint || !this.camera) return;
    const axis = mesh.userData?.handleAxisVector;
    if (!axis?.isVector3) return;
    const a = this._projectWorldToScreen(worldPoint);
    const b = this._projectWorldToScreen(worldPoint.clone().addScaledVector(axis, 0.75));
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) + Math.abs(dy) < 0.001) return;
    mesh.material.rotation = Math.atan2(-dy, dx);
  }

  _getHandleScreenAxisMetrics(mesh, worldPoint) {
    const axis = mesh?.userData?.handleAxisVector;
    if (!axis?.isVector3 || !worldPoint) return null;
    const a = this._projectWorldToScreen(worldPoint);
    const b = this._projectWorldToScreen(worldPoint.clone().add(axis));
    if (!a || !b) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const pixelsPerWorld = Math.hypot(dx, dy);
    if (pixelsPerWorld < 0.001) return null;
    return { x: dx / pixelsPerWorld, y: dy / pixelsPerWorld, pixelsPerWorld };
  }


  _normaliseAngle(angle) {
    const twoPi = Math.PI * 2;
    let value = Number(angle) % twoPi;
    if (value < 0) value += twoPi;
    return value;
  }

  _positiveAngleSweep(start, end) {
    return this._normaliseAngle(end - start);
  }

  _getOvalInfinityArc(side) {
    const canonicalSide = ({ east:'right', west:'left', north:'back', south:'front' })[side] || side;
    const centerAngle = canonicalSide === 'right' ? 0
      : canonicalSide === 'back' ? Math.PI * 0.5
      : canonicalSide === 'left' ? Math.PI
      : -Math.PI * 0.5;
    const previous = this.ovalInfinityArc;
    if (!previous || Math.abs(this._normaliseAngle(previous.centerAngle - centerAngle)) > 0.001) {
      this.ovalInfinityArc = {
        centerAngle,
        startAngle: centerAngle - Math.PI * 0.25,
        endAngle: centerAngle + Math.PI * 0.25
      };
    }
    return this.ovalInfinityArc;
  }

  _kidneyBoundarySampleAtAngle(angle) {
    const points = Array.isArray(this.poolGroup?.userData?.outerPts)
      ? this.poolGroup.userData.outerPts.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
      : [];
    if (points.length < 3) return null;
    const direction = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    const cross = (a, b) => a.x * b.y - a.y * b.x;
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i], b = points[(i + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    const ccw = area > 0;
    let best = null;
    for (let i = 0; i < points.length; i += 1) {
      const a = new THREE.Vector2(points[i].x, points[i].y);
      const b = new THREE.Vector2(points[(i + 1) % points.length].x, points[(i + 1) % points.length].y);
      const segment = b.clone().sub(a);
      const denominator = cross(direction, segment);
      if (Math.abs(denominator) < 1e-9) continue;
      const rayDistance = cross(a, segment) / denominator;
      const segmentT = cross(a, direction) / denominator;
      if (rayDistance < 0 || segmentT < -1e-7 || segmentT > 1 + 1e-7) continue;
      if (best && rayDistance >= best.rayDistance) continue;
      const tangent = segment.normalize();
      const normal = ccw
        ? new THREE.Vector2(tangent.y, -tangent.x)
        : new THREE.Vector2(-tangent.y, tangent.x);
      best = {
        point: direction.clone().multiplyScalar(rayDistance),
        normal: normal.normalize(),
        tangent,
        rayDistance,
        segmentIndex: i,
        segmentT
      };
    }
    return best;
  }

  setupOvalInfinityHandles() {
    if (this.ovalInfinityHandles?.meshes && Object.keys(this.ovalInfinityHandles.meshes).length) return;
    if (!this.scene || !this.renderer) return;
    const start = this._makeDimensionHandleMesh('ovalInfinityStart', '↔');
    const end = this._makeDimensionHandleMesh('ovalInfinityEnd', '↔');
    start.userData.infinityArcEnd = 'start';
    end.userData.infinityArcEnd = 'end';
    start.userData.handleAxisVector = new THREE.Vector3(1, 0, 0);
    end.userData.handleAxisVector = new THREE.Vector3(1, 0, 0);
    this.scene.add(start, end);
    this.ovalInfinityHandles = {
      meshes: { start, end }, drag: null,
      raycaster: new THREE.Raycaster(), mouse: new THREE.Vector2()
    };
    this._boundOvalInfinityPointerDown = (event) => this._onOvalInfinityPointerDown(event);
    this._boundOvalInfinityPointerMove = (event) => this._onOvalInfinityPointerMove(event);
    this._boundOvalInfinityPointerUp = () => this._onOvalInfinityPointerUp();
    this.renderer.domElement.addEventListener('pointerdown', this._boundOvalInfinityPointerDown);
    window.addEventListener('pointermove', this._boundOvalInfinityPointerMove);
    window.addEventListener('pointerup', this._boundOvalInfinityPointerUp);
    window.addEventListener('pointercancel', this._boundOvalInfinityPointerUp);
  }

  _ovalInfinityHandleVisible() {
    const shape = this.isCustomShape ? 'freeform' : String(this.poolParams?.shape || '').toLowerCase();
    return !!(this.poolGroup && (shape === 'oval' || shape === 'kidney') && this.poolParams?.raised && this.poolFeatures?.has('infinity-edge'));
  }

  _updateOvalInfinityHandles() {
    const handles = this.ovalInfinityHandles?.meshes || {};
    const visible = this._ovalInfinityHandleVisible();
    Object.values(handles).forEach((mesh) => { if (mesh) mesh.visible = visible; });
    if (!visible) return;
    const entry = this._getEntryStepInfo(Number(this.poolParams.length || 8), Number(this.poolParams.width || 4));
    const side = this._oppositeSide(entry.side);
    const arcState = this._getOvalInfinityArc(side);
    const a = Math.max(0.3, Number(this.poolParams.length || 8) * 0.5);
    const b = Math.max(0.3, Number(this.poolParams.width || 4) * 0.5);
    const wallThickness = 0.20;
    const z = this._getInfinityHandleWorldZ();
    const place = (mesh, angle) => {
      const kidneySample = String(this.poolParams?.shape || '').toLowerCase() === 'kidney'
        ? this._kidneyBoundarySampleAtAngle(angle)
        : null;
      const boundary = kidneySample?.point || new THREE.Vector2(a * Math.cos(angle), b * Math.sin(angle));
      const normal = kidneySample?.normal || new THREE.Vector2(Math.cos(angle) / a, Math.sin(angle) / b).normalize();
      const point = boundary.addScaledVector(normal, wallThickness + 0.03);
      const worldPoint = this.poolGroup
        ? this.poolGroup.localToWorld(new THREE.Vector3(point.x, point.y, 0))
        : new THREE.Vector3(point.x, point.y, 0);
      worldPoint.z = z;
      mesh.position.copy(worldPoint);
      const tangent = kidneySample?.tangent
        ? new THREE.Vector3(kidneySample.tangent.x, kidneySample.tangent.y, 0).normalize()
        : new THREE.Vector3(-a * Math.sin(angle), b * Math.cos(angle), 0).normalize();
      mesh.userData.handleAxisVector.copy(tangent);
      this._orientDimensionHandleToCamera(mesh, mesh.position);
    };
    place(handles.start, arcState.startAngle);
    place(handles.end, arcState.endAngle);
  }

  _onOvalInfinityPointerDown(event) {
    if (event.button !== 0 || !this._ovalInfinityHandleVisible()) return;
    const state = this.ovalInfinityHandles;
    const ndc = this._pointerToNDC(event);
    state.mouse.set(ndc.x, ndc.y);
    state.raycaster.setFromCamera(state.mouse, this.camera);
    const hits = state.raycaster.intersectObjects(Object.values(state.meshes).filter(m => m?.visible), false);
    if (!hits.length) return;
    const handle = hits[0].object;
    event.preventDefault(); event.stopPropagation();
    this.captureUndoState?.('Resize oval infinity edge');
    state.drag = { handle, end: handle.userData.infinityArcEnd };
    this.controls && (this.controls.enabled = false);
    this._setDimensionHandleActive(handle, true);
  }

  _onOvalInfinityPointerMove(event) {
    const drag = this.ovalInfinityHandles?.drag;
    if (!drag || !this.poolGroup) return;
    const point = this._screenToPlanePoint(event.clientX, event.clientY, this.getPoolElevation());
    if (!point) return;
    const a = Math.max(0.3, Number(this.poolParams.length || 8) * 0.5);
    const b = Math.max(0.3, Number(this.poolParams.width || 4) * 0.5);
    let angle = String(this.poolParams?.shape || '').toLowerCase() === 'kidney'
      ? Math.atan2(point.y, point.x)
      : Math.atan2(point.y / b, point.x / a);
    const snap = THREE.MathUtils.degToRad(5);
    angle = Math.round(angle / snap) * snap;
    const arc = this.ovalInfinityArc;
    if (!arc) return;
    const minSweep = THREE.MathUtils.degToRad(30);
    const maxSweep = THREE.MathUtils.degToRad(270);
    if (drag.end === 'start') {
      const proposedSweep = this._positiveAngleSweep(angle, arc.endAngle);
      if (proposedSweep < minSweep) angle = arc.endAngle - minSweep;
      else if (proposedSweep > maxSweep) angle = arc.endAngle - maxSweep;
      arc.startAngle = angle;
    } else {
      const proposedSweep = this._positiveAngleSweep(arc.startAngle, angle);
      if (proposedSweep < minSweep) angle = arc.startAngle + minSweep;
      else if (proposedSweep > maxSweep) angle = arc.startAngle + maxSweep;
      arc.endAngle = angle;
    }
    const now = performance.now ? performance.now() : Date.now();
    if (!this._lastOvalInfinityRebuild || now - this._lastOvalInfinityRebuild > 45) {
      this._lastOvalInfinityRebuild = now;
      this.rebuildPoolFeatures();
    }
    this._updateOvalInfinityHandles();
    this._updateLInfinityHandles?.();
    this._updateStraightInfinityHandles?.();
  }

  _onOvalInfinityPointerUp() {
    const drag = this.ovalInfinityHandles?.drag;
    if (!drag) return;
    this._setDimensionHandleActive(drag.handle, false);
    this.ovalInfinityHandles.drag = null;
    if (this.controls) this.controls.enabled = true;
    this.rebuildPoolFeatures();
    this._notifyDesignerStateChanged?.();
  }


  _straightInfinityShapeSupported() {
    const shape=String(this.poolParams?.shape||'').toLowerCase();
    // Rectangle now uses the same closed-perimeter infinity controller as the
    // L-shape so its handles can travel around corners onto adjoining walls.
    // Keep the older straight-edge controller only for freeform for now.
    return shape==='freeform';
  }

  _getStraightInfinityRange(span,key='straight') {
    const safeSpan=Math.max(0.6,Number(span)||0.6);
    const min=-safeSpan*0.5, max=safeSpan*0.5;
    const previous=this.straightInfinityRange;
    if(!previous||previous.key!==key){
      // Freeform drag already snaps each endpoint 100 mm inside the selected
      // source edge when it approaches a corner. Do the same on first add or
      // reload instead of initially building the 300 mm tank walls from the raw
      // edge vertices. This keeps the rebuilt position identical to the dragged
      // face-aligned position without changing any interactive behavior.
      const snapInset=Math.min(0.10,Math.max(0,(safeSpan-0.60)*0.5));
      this.straightInfinityRange={start:min+snapInset,end:max-snapInset,span:safeSpan,key};
      return this.straightInfinityRange;
    }
    // Preserve the user's edited range while dimensions change, but never let
    // an endpoint leave the currently-authored edge.
    previous.span=safeSpan;
    previous.start=Math.max(min,Math.min(max-0.6,Number(previous.start)));
    previous.end=Math.min(max,Math.max(min+0.6,Number(previous.end)));
    if(previous.end-previous.start<0.6){
      const mid=Math.max(min+0.3,Math.min(max-0.3,(previous.start+previous.end)*0.5));
      previous.start=mid-0.3; previous.end=mid+0.3;
    }
    return previous;
  }

  setupStraightInfinityHandles(){
    if(this.straightInfinityHandles?.meshes&&Object.keys(this.straightInfinityHandles.meshes).length)return;
    const start=this._makeDimensionHandleMesh('straightInfinityStart','↔');
    const end=this._makeDimensionHandleMesh('straightInfinityEnd','↔');
    start.userData.straightInfinityEnd='start'; end.userData.straightInfinityEnd='end';
    start.userData.isStraightInfinity=true; end.userData.isStraightInfinity=true;
    this.scene.add(start,end);
    this.straightInfinityHandles={meshes:{start,end},drag:null,raycaster:new THREE.Raycaster(),mouse:new THREE.Vector2()};
    this._boundStraightInfinityPointerDown=e=>this._onStraightInfinityPointerDown(e);
    this._boundStraightInfinityPointerMove=e=>this._onStraightInfinityPointerMove(e);
    this._boundStraightInfinityPointerUp=()=>this._onStraightInfinityPointerUp();
    this.renderer.domElement.addEventListener('pointerdown',this._boundStraightInfinityPointerDown);
    window.addEventListener('pointermove',this._boundStraightInfinityPointerMove);
    window.addEventListener('pointerup',this._boundStraightInfinityPointerUp);
    window.addEventListener('pointercancel',this._boundStraightInfinityPointerUp);
  }

  _straightInfinityHandleVisible(){
    return !!(this.poolGroup&&this._straightInfinityShapeSupported()&&this.poolParams?.raised&&this.poolFeatures?.has('infinity-edge')&&this._straightInfinityFrameState);
  }

  _updateStraightInfinityHandles(){
    const meshes=this.straightInfinityHandles?.meshes||{};
    const visible=this._straightInfinityHandleVisible();
    Object.values(meshes).forEach(m=>{if(m)m.visible=visible;});
    if(!visible)return;
    const state=this._straightInfinityFrameState, range=this.straightInfinityRange;
    if(!state||!range)return;
    const z=this._getInfinityHandleWorldZ();
    const start=state.center.clone().addScaledVector(state.tangent,range.start);
    const end=state.center.clone().addScaledVector(state.tangent,range.end);
    const startWorld=this.poolGroup?this.poolGroup.localToWorld(new THREE.Vector3(start.x,start.y,0)):new THREE.Vector3(start.x,start.y,0);
    const endWorld=this.poolGroup?this.poolGroup.localToWorld(new THREE.Vector3(end.x,end.y,0)):new THREE.Vector3(end.x,end.y,0);
    startWorld.z=z; endWorld.z=z;
    if(meshes.start)meshes.start.position.copy(startWorld);
    if(meshes.end)meshes.end.position.copy(endWorld);
  }

  _onStraightInfinityPointerDown(event){
    if(event.button!==0||!this._straightInfinityHandleVisible())return;
    const state=this.straightInfinityHandles, ndc=this._pointerToNDC(event);
    state.mouse.set(ndc.x,ndc.y); state.raycaster.setFromCamera(state.mouse,this.camera);
    const hits=state.raycaster.intersectObjects(Object.values(state.meshes).filter(m=>m?.visible),false);
    if(!hits.length)return;
    const handle=hits[0].object; event.preventDefault(); event.stopPropagation();
    this.captureUndoState?.('Resize infinity edge');
    state.drag={handle,end:handle.userData.straightInfinityEnd};
    if(this.controls)this.controls.enabled=false;
    this._setDimensionHandleActive(handle,true);
  }

  _onStraightInfinityPointerMove(event){
    const drag=this.straightInfinityHandles?.drag;
    const frame=this._straightInfinityFrameState;
    const range=this.straightInfinityRange;
    if(!drag||!frame||!range||!this.poolGroup)return;
    const p=this._screenToPlanePoint(event.clientX,event.clientY,this.getPoolElevation());
    if(!p)return;
    const v=new THREE.Vector2(p.x-frame.center.x,p.y-frame.center.y);
    let d=v.dot(frame.tangent);
    d=Math.round(d/0.1)*0.1;
    const min=-frame.span*0.5, max=frame.span*0.5, minOpening=0.6;
    // Match the L-shape 400 mm proximity snap.  The 100 mm inset is half the
    // 200 mm rectangle wall thickness and puts the tank-side wall on the corner face.
    const snapDistance=0.40;
    const snapInset=Math.min(0.10,Math.max(0,frame.span*0.5-0.30));
    if(drag.end==='start'){
      d=Math.max(min,Math.min(range.end-minOpening,d));
      if(Math.abs(d-min)<=snapDistance)d=min+snapInset;
      range.start=Math.min(d,range.end-minOpening);
    }else{
      d=Math.min(max,Math.max(range.start+minOpening,d));
      if(Math.abs(max-d)<=snapDistance)d=max-snapInset;
      range.end=Math.max(d,range.start+minOpening);
    }
    const now=performance.now?performance.now():Date.now();
    if(!this._lastStraightInfinityRebuild||now-this._lastStraightInfinityRebuild>45){
      this._lastStraightInfinityRebuild=now; this.rebuildPoolFeatures();
    }
    this._updateStraightInfinityHandles();
  }

  _onStraightInfinityPointerUp(){
    const drag=this.straightInfinityHandles?.drag;if(!drag)return;
    this._setDimensionHandleActive(drag.handle,false);
    this.straightInfinityHandles.drag=null;
    if(this.controls)this.controls.enabled=true;
    this.rebuildPoolFeatures();
    this._updateStraightInfinityHandles();
    this._notifyDesignerStateChanged?.();
  }

  _getLInfinityPath() {
    const length = Math.max(1.2, Number(this.poolParams?.length || 8));
    const width = Math.max(1.2, Number(this.poolParams?.width || 4));
    const hx=length*0.5, hy=width*0.5;
    const shape=String(this.poolParams?.shape||'').toLowerCase();
    let points;

    // Rectangle uses the identical closed-perimeter distance model as the
    // L-shape. The handle can therefore cross a corner and continue along the
    // adjoining wall instead of being trapped on one straight side.
    if(shape==='rectangular'||shape==='rectangle'||shape==='rect'){
      points=[
        new THREE.Vector2(-hx,-hy), new THREE.Vector2(hx,-hy),
        new THREE.Vector2(hx,hy), new THREE.Vector2(-hx,hy)
      ];
    }else{
      const fracL = THREE.MathUtils.clamp(Number(this.poolParams?.notchLength ?? this.poolParams?.notchLengthX ?? 0.4), 0.08, 0.92);
      const fracW = THREE.MathUtils.clamp(Number(this.poolParams?.notchWidth ?? this.poolParams?.notchWidthY ?? 0.5), 0.08, 0.92);
      const notchL = THREE.MathUtils.clamp(length * fracL, 0.6, Math.max(0.6, length - 0.6));
      const notchW = THREE.MathUtils.clamp(width * fracW, 0.6, Math.max(0.6, width - 0.6));
      points=[
        new THREE.Vector2(-hx,-hy), new THREE.Vector2(hx,-hy), new THREE.Vector2(hx,hy),
        new THREE.Vector2(hx-notchL,hy), new THREE.Vector2(hx-notchL,hy-notchW), new THREE.Vector2(-hx,hy-notchW)
      ];
    }
    const segments=[]; let total=0;
    for(let i=0;i<points.length;i++){
      const a=points[i], b=points[(i+1)%points.length], len=a.distanceTo(b);
      segments.push({a:a.clone(),b:b.clone(),length:len,start:total,end:total+len,index:i}); total+=len;
    }
    return {points,segments,total,key:(shape==='rectangular'||shape==='rectangle'||shape==='rect')?'rectangle':'L'};
  }

  _getLInfinityRange() {
    const path=this._getLInfinityPath();
    const entry=this._getEntryStepInfo(Number(this.poolParams?.length||8),Number(this.poolParams?.width||4));
    const entryPoint=new THREE.Vector2(Number(entry?.center?.x)||0,Number(entry?.center?.y)||0);
    const targetSegment=path.segments.reduce((best,segment)=>{
      const midpoint=segment.a.clone().add(segment.b).multiplyScalar(0.5);
      const score=midpoint.distanceToSquared(entryPoint);
      return !best||score>best.score?{segment,score}:best;
    },null)?.segment || path.segments[0];
    const desiredPathKey=`${path.key}:opposite:${targetSegment?.index??0}`;
    const previous=this.lInfinityRange;
    if(!previous || previous.pathKey!==desiredPathKey || Math.abs((previous.total||0)-path.total)>0.01){
      const available=Math.max(0.6,(targetSegment?.length||1)-0.20);
      // The catch tank is authored between the inside faces of its two 200 mm
      // return walls. Use the complete selected pool wall (less 100 mm at each
      // corner for those returns) so a newly added tank reads as the same width
      // as the pool instead of the old 62% partial-width default.
      const extent=available;
      const centeredStart=(targetSegment?.start||0)+0.10;

      // First-add/reload must use the same endpoint normalization as dragging.
      // Both L-shape and rectangle use this closed-perimeter controller, and a
      // raw endpoint exactly on a perimeter vertex can build the 300 mm return
      // before the 100 mm face snap has ever run. Normalize BOTH default ends
      // through the existing proven snap routine so rebuilt geometry starts in
      // the same place as geometry the user has dragged into position.
      const initialStart = this._snapLInfinityEndpointToWallFace(centeredStart, 'start', 0.40);
      const initialEnd = this._snapLInfinityEndpointToWallFace(centeredStart+extent, 'end', 0.40);
      this.lInfinityRange={start:initialStart,end:initialEnd,total:path.total,pathKey:desiredPathKey};
    }
    this.lInfinityRange.total=path.total;
    this.lInfinityRange.pathKey=desiredPathKey;
    return this.lInfinityRange;
  }

  _pointOnLPath(distance) {
    const path=this._getLInfinityPath();
    let d=((Number(distance)||0)%path.total+path.total)%path.total;
    for(const seg of path.segments){ if(d<=seg.end+1e-8){ const t=seg.length?THREE.MathUtils.clamp((d-seg.start)/seg.length,0,1):0; return {point:seg.a.clone().lerp(seg.b,t),segment:seg,t,distance:d}; } }
    const seg=path.segments[path.segments.length-1]; return {point:seg.b.clone(),segment:seg,t:1,distance:d};
  }

  _nearestDistanceOnLPath(point) {
    const path=this._getLInfinityPath(); let best=null;
    for(const seg of path.segments){
      const ab=seg.b.clone().sub(seg.a); const len2=ab.lengthSq();
      const t=len2?THREE.MathUtils.clamp(point.clone().sub(seg.a).dot(ab)/len2,0,1):0;
      const q=seg.a.clone().addScaledVector(ab,t); const dist=q.distanceToSquared(point);
      if(!best||dist<best.dist) best={dist,distance:seg.start+seg.length*t};
    }
    return best?.distance ?? 0;
  }

  _lInfinitySweep(start,end,total){ let v=(end-start)%total; if(v<0)v+=total; return v; }

  _snapLInfinityEndpointToWallFace(distance, endName, snapDistance = 0.40) {
    const path = this._getLInfinityPath();
    if (!path?.segments?.length || !Number.isFinite(distance)) return distance;

    // The L-shape tank side wall is 200 mm thick and is currently authored from
    // the active infinity endpoint toward one side of the perimeter tangent. To
    // make its INSIDE face coincide with the OUTSIDE face of the adjoining
    // pool/infinity wall, the endpoint must sit half a wall thickness either
    // side of the actual pool-wall centreline vertex. This is deliberately a
    // face-to-face snap, not a centreline-to-centreline snap.
    const halfWall = 0.10;
    const wrap = (v) => ((v % path.total) + path.total) % path.total;
    const circularDistance = (a, b) => {
      const raw = Math.abs(wrap(a - b));
      return Math.min(raw, path.total - raw);
    };

    // L-shape keeps its proven axis-specific snap correction. A rectangle has
    // no concave/asymmetric corners, so all four sides must use the same closed-
    // perimeter rule.  In rectangle mode, the start endpoint always lands
    // +100 mm after the corner and the end endpoint -100 mm before it, regardless
    // of whether the active wall runs in X or Y.
    const isRectanglePath = path.key === 'rectangle';
    const dWrapped = wrap(distance);
    let activeSegment = path.segments[path.segments.length - 1];
    for (const seg of path.segments) {
      const segEnd = seg.start + seg.length;
      if (dWrapped >= seg.start - 1e-9 && dWrapped <= segEnd + 1e-9) {
        activeSegment = seg;
        break;
      }
    }
    const activeAxis = activeSegment.b.clone().sub(activeSegment.a).normalize();
    const isYDirection = Math.abs(activeAxis.y) > Math.abs(activeAxis.x);

    // Rectangle endpoints must resolve independently.  Previously the endpoint
    // ROLE forced the corner side: start was always +100 mm after a vertex and
    // end was always -100 mm before it.  When one handle crossed a corner that
    // rule could push it back onto the same axis as the opposite handle, so both
    // 300 mm tank returns inherited the same wall orientation.
    //
    // For rectangles, keep the handle on the wall it is actually travelling on:
    // snap 100 mm INSIDE the nearest end of that active segment.  The endpoint
    // builder below already derives tangent/outward per endpoint, so this alone
    // allows one return to remain on X while the other rotates onto Y.
    if (isRectanglePath) {
      const startCorner = activeSegment.start;
      const endCorner = activeSegment.end;
      const gapToStart = circularDistance(distance, startCorner);
      const gapToEnd = circularDistance(distance, endCorner);

      let best = null;
      if (gapToStart <= snapDistance + 1e-9) {
        best = {
          gap: gapToStart,
          target: wrap(activeSegment.start + halfWall)
        };
      }
      if (gapToEnd <= snapDistance + 1e-9 && (!best || gapToEnd < best.gap)) {
        best = {
          gap: gapToEnd,
          target: wrap(activeSegment.end - halfWall)
        };
      }
      return best ? best.target : distance;
    }

    // L-shape start endpoint keeps the established axis-specific behaviour.
    //
    // The right/end endpoint needs to resolve from the LOCAL wall it is actually
    // travelling on.  The previous end-role rule could choose the opposite side
    // of an adjacent L corner, so the 300 mm end wall could never reach that
    // neighbouring pool-wall face while the left/start wall remained snapped.
    // Keep this fix isolated to the L-shape end endpoint: when it enters the
    // 400 mm snap zone, stay on the active segment and land 100 mm inside the
    // nearest end of that segment. Rectangle behaviour above is untouched.
    if (endName === 'end') {
      const startCorner = activeSegment.start;
      const endCorner = activeSegment.end;
      const gapToStart = circularDistance(distance, startCorner);
      const gapToEnd = circularDistance(distance, endCorner);
      let best = null;
      if (gapToStart <= snapDistance + 1e-9) {
        best = { gap: gapToStart, target: wrap(activeSegment.start + halfWall) };
      }
      if (gapToEnd <= snapDistance + 1e-9 && (!best || gapToEnd < best.gap)) {
        best = { gap: gapToEnd, target: wrap(activeSegment.end - halfWall) };
      }
      return best ? best.target : distance;
    }

    // Preserve the existing tested start-endpoint and Y-axis mirror behaviour.
    let best = null;
    for (const seg of path.segments) {
      const vertexDistance = seg.start;
      const gap = circularDistance(distance, vertexDistance);
      const baseSign = 1;
      const axisSign = isYDirection ? -baseSign : baseSign;
      const target = wrap(vertexDistance + axisSign * halfWall);
      if (gap <= snapDistance + 1e-9 && (!best || gap < best.gap)) {
        best = { gap, target };
      }
    }
    return best ? best.target : distance;
  }

  setupLInfinityHandles(){
    if(this.lInfinityHandles?.meshes && Object.keys(this.lInfinityHandles.meshes).length) return;
    if(!this.scene||!this.renderer) return;
    const start=this._makeDimensionHandleMesh('lInfinityStart','↔'); const end=this._makeDimensionHandleMesh('lInfinityEnd','↔');
    start.userData.lInfinityEnd='start'; end.userData.lInfinityEnd='end'; this.scene.add(start,end);
    this.lInfinityHandles={meshes:{start,end},drag:null,raycaster:new THREE.Raycaster(),mouse:new THREE.Vector2()};
    this._boundLInfinityPointerDown=e=>this._onLInfinityPointerDown(e); this._boundLInfinityPointerMove=e=>this._onLInfinityPointerMove(e); this._boundLInfinityPointerUp=()=>this._onLInfinityPointerUp();
    this.renderer.domElement.addEventListener('pointerdown',this._boundLInfinityPointerDown);
    window.addEventListener('pointermove',this._boundLInfinityPointerMove); window.addEventListener('pointerup',this._boundLInfinityPointerUp); window.addEventListener('pointercancel',this._boundLInfinityPointerUp);
  }
  _lInfinityHandleVisible(){
    const shape=String(this.poolParams?.shape||'').toLowerCase();
    const perimeterShape=this.poolParams?.shape==='L'||shape==='rectangular'||shape==='rectangle'||shape==='rect';
    return !!(this.poolGroup && perimeterShape && this.poolParams?.raised && this.poolFeatures?.has('infinity-edge'));
  }
  _updateLInfinityHandles(){
    const meshes=this.lInfinityHandles?.meshes||{}, visible=this._lInfinityHandleVisible(); Object.values(meshes).forEach(m=>{if(m)m.visible=visible;}); if(!visible)return;
    const range=this._getLInfinityRange(), z=this._getInfinityHandleWorldZ();
    const place=(mesh,d)=>{ const hit=this._pointOnLPath(d), tangent=hit.segment.b.clone().sub(hit.segment.a).normalize(); const outward=new THREE.Vector2(tangent.y,-tangent.x); const p=hit.point.clone().addScaledVector(outward,0.28); const worldPoint=this.poolGroup?this.poolGroup.localToWorld(new THREE.Vector3(p.x,p.y,0)):new THREE.Vector3(p.x,p.y,0); worldPoint.z=z; mesh.position.copy(worldPoint); mesh.userData.handleAxisVector.set(tangent.x,tangent.y,0); this._orientDimensionHandleToCamera(mesh,mesh.position); };
    place(meshes.start,range.start); place(meshes.end,range.end);
  }
  _onLInfinityPointerDown(event){
    if(event.button!==0||!this._lInfinityHandleVisible())return; const state=this.lInfinityHandles, ndc=this._pointerToNDC(event); state.mouse.set(ndc.x,ndc.y); state.raycaster.setFromCamera(state.mouse,this.camera);
    const hits=state.raycaster.intersectObjects(Object.values(state.meshes).filter(m=>m?.visible),false); if(!hits.length)return;
    const handle=hits[0].object; event.preventDefault(); event.stopPropagation(); this.captureUndoState?.('Resize L-shape infinity edge'); state.drag={handle,end:handle.userData.lInfinityEnd}; if(this.controls)this.controls.enabled=false; this._setDimensionHandleActive(handle,true);
  }
  _onLInfinityPointerMove(event){
    const drag=this.lInfinityHandles?.drag; if(!drag||!this.poolGroup)return; const p=this._screenToPlanePoint(event.clientX,event.clientY,this.getPoolElevation()); if(!p)return;
    const path=this._getLInfinityPath(), range=this._getLInfinityRange(); let d=this._nearestDistanceOnLPath(new THREE.Vector2(p.x,p.y)); d=Math.round(d/0.1)*0.1;
    const min=1.0,max=path.total*0.75;
    if(drag.end==='start'){
      let sw=this._lInfinitySweep(d,range.end,path.total);
      if(sw<min)d=range.end-min; else if(sw>max)d=range.end-max;
      d=this._snapLInfinityEndpointToWallFace(d,'start',0.40);
      // Re-validate after snapping so the 400 mm magnet never breaks the allowed
      // infinity-wall extent.
      sw=this._lInfinitySweep(d,range.end,path.total);
      if(sw>=min-1e-8 && sw<=max+1e-8) range.start=((d%path.total)+path.total)%path.total;
    }
    else {
      let sw=this._lInfinitySweep(range.start,d,path.total);
      if(sw<min)d=range.start+min; else if(sw>max)d=range.start+max;
      d=this._snapLInfinityEndpointToWallFace(d,'end',0.40);
      sw=this._lInfinitySweep(range.start,d,path.total);
      if(sw>=min-1e-8 && sw<=max+1e-8) range.end=((d%path.total)+path.total)%path.total;
    }
    const now=performance.now?performance.now():Date.now(); if(!this._lastLInfinityRebuild||now-this._lastLInfinityRebuild>45){this._lastLInfinityRebuild=now;this.rebuildPoolFeatures();} this._updateLInfinityHandles();
  }
  _onLInfinityPointerUp(){ const drag=this.lInfinityHandles?.drag;if(!drag)return;this._setDimensionHandleActive(drag.handle,false);this.lInfinityHandles.drag=null;if(this.controls)this.controls.enabled=true;this.rebuildPoolFeatures();this._notifyDesignerStateChanged?.(); }

  _splitLPathByRange(){
    const path=this._getLInfinityPath(), range=this._getLInfinityRange(), cuts=[range.start,range.end]; const pieces=[];
    for(const seg of path.segments){
      const local=[seg.start,seg.end,...cuts.filter(c=>c>seg.start+1e-8&&c<seg.end-1e-8)].sort((a,b)=>a-b);
      for(let i=0;i<local.length-1;i++){ const d0=local[i],d1=local[i+1],mid=(d0+d1)/2; const p0=this._pointOnLPath(d0).point,p1=this._pointOnLPath(d1).point; const selected=this._lInfinitySweep(range.start,mid,path.total)<=this._lInfinitySweep(range.start,range.end,path.total)+1e-8; pieces.push({p0,p1,selected,d0,d1}); }
    }
    return {path,range,pieces};
  }

  _createLShapeInfinityEdge(group){
    // L-shape infinity edge: the handles only select the active perimeter range.
    // Geometry follows the same construction rules as the rectangle infinity tank:
    // 200 mm pool wall, 300 mm full-height wall returns, open pool-side catch tank,
    // 200 mm tank walls, 250 mm coping and tank water 100 mm below ground/top.
    const {path,range,pieces}=this._splitLPathByRange();
    const elevation=this.getPoolElevation();
    const depth=Math.max(0.4,Number(this.poolParams?.deepDepth||this.poolParams?.depth||1.8));
    const groundTopZ=this._getGroundTopLocalZ();
    const wallT=0.20;
    const copingW=0.25;
    const copingH=0.05;
    const loweredTop=-0.10;
    const tankDepth=0.60;
    const tankClearWidth=0.72;
    const poolWallExtension=0.30;
    const tankWallTop=groundTopZ;
    const tankCopingTop=tankWallTop+copingH;
    const tankFloorZ=tankWallTop-tankDepth;
    const tankWaterTop=tankWallTop-0.10;
    // Keep the falling sheet clear of the tiled spillway face, then make both
    // horizontal water surfaces terminate on that exact same curve. Sharing one
    // seam prevents both dry gaps and coplanar water overlap.
    const spillSheetClearance=0.012;

    // Pool shapes expose authored wall/coping metadata in different forms.
    // L-shape uses arrays, while rectangle stores coping segments in a
    // north/south/east/west object. Normalise both forms before the shared
    // infinity builder reads or spreads them so feature rebuilds cannot throw
    // "... is not iterable".
    const meshList=(value)=>{
      if(!value)return [];
      if(Array.isArray(value))return value.filter(Boolean);
      if(value?.isObject3D)return [value];
      if(typeof value==='object')return Object.values(value).filter(Boolean);
      return [];
    };
    const authoredWallMeshes=meshList(this.poolGroup?.userData?.wallMeshes);
    const authoredCopingMeshes=[
      ...meshList(this.poolGroup?.userData?.copingSegments),
      ...meshList(this.poolGroup?.userData?.copingMesh)
    ];

    const tileSource=authoredWallMeshes[0]?.material || this.poolGroup?.children?.find(o=>o.userData?.isWall)?.material;
    const copingSource=authoredCopingMeshes[0]?.material || this.poolGroup?.children?.find(o=>o.userData?.isCoping)?.material;
    const tileMat=(Array.isArray(tileSource)?tileSource[0]:tileSource) || new THREE.MeshStandardMaterial({color:0xffffff,side:THREE.DoubleSide});
    const copingMat=(Array.isArray(copingSource)?copingSource[0]:copingSource) || tileMat;
    if(tileMat.side!==THREE.DoubleSide){tileMat.side=THREE.DoubleSide;tileMat.needsUpdate=true;}

    // Hide the authored L-shell walls/coping and rebuild the perimeter from the
    // same path. This is required only because an L infinity opening may start or
    // finish midway along a wall. The tank itself is built independently below.
    const authoredMeshes=[...authoredWallMeshes,...authoredCopingMeshes];
    for(const o of authoredMeshes){
      if(!o)continue;
      if(!this._infinityHiddenCoping)this._infinityHiddenCoping=[];
      if(!this._infinityHiddenCoping.includes(o))this._infinityHiddenCoping.push(o);
      o.visible=false;o.userData.infinitySuppressed=true;
    }
    this.poolGroup?.traverse?.(o=>{
      if((o?.userData?.isWall||o?.userData?.isCoping)&&o!==group){
        if(!this._infinityHiddenCoping)this._infinityHiddenCoping=[];
        if(!this._infinityHiddenCoping.includes(o))this._infinityHiddenCoping.push(o);
        o.visible=false;
      }
    });

    const lineIntersection2D=(p1,d1,p2,d2)=>{
      const cross=d1.x*d2.y-d1.y*d2.x;
      if(Math.abs(cross)<1e-9)return null;
      const q=p2.clone().sub(p1);
      const t=(q.x*d2.y-q.y*d2.x)/cross;
      return p1.clone().addScaledVector(d1,t);
    };
    const offsetPointOnClosedPath=(distance,offset)=>{
      const d=((distance%path.total)+path.total)%path.total;
      const hit=this._pointOnLPath(d);
      const vertexIndex=path.segments.findIndex(seg=>Math.abs(d-seg.start)<1e-7);
      if(vertexIndex<0){
        const tangent=hit.segment.b.clone().sub(hit.segment.a).normalize();
        return hit.point.clone().addScaledVector(new THREE.Vector2(tangent.y,-tangent.x),offset);
      }
      const prev=path.segments[(vertexIndex-1+path.segments.length)%path.segments.length];
      const next=path.segments[vertexIndex];
      const tPrev=prev.b.clone().sub(prev.a).normalize();
      const tNext=next.b.clone().sub(next.a).normalize();
      const nPrev=new THREE.Vector2(tPrev.y,-tPrev.x);
      const nNext=new THREE.Vector2(tNext.y,-tNext.x);
      const base=next.a.clone();
      const a=base.clone().addScaledVector(nPrev,offset);
      const b=base.clone().addScaledVector(nNext,offset);
      const miter=lineIntersection2D(a,tPrev,b,tNext);
      if(miter&&miter.distanceTo(base)<=Math.max(1.0,Math.abs(offset)*6))return miter;
      return a;
    };
    const splitPiecePlan=(pc,inset,outset)=>[
      offsetPointOnClosedPath(pc.d0,inset),offsetPointOnClosedPath(pc.d1,inset),
      offsetPointOnClosedPath(pc.d1,outset),offsetPointOnClosedPath(pc.d0,outset)
    ];

    // At an infinity opening the coping on the neighbouring full-height wall must
    // retain the same section as the authored L-shape coping: 250 mm total,
    // comprising the 200 mm wall plus a 50 mm overhang into the pool, with the
    // outside edge flush to the back of the wall. If the opening starts/ends at
    // a pool corner, using the normal closed-path miter incorrectly pulls that
    // coping end toward the missing infinity-side coping. Square the section at
    // the active opening boundary instead, while retaining normal miters at all
    // other L-shape corners.
    const circularDistance=(a,b)=>{
      const raw=Math.abs((((a-b)%path.total)+path.total)%path.total);
      return Math.min(raw,path.total-raw);
    };
    const isInfinityBoundary=(d)=>
      circularDistance(d,range.start)<1e-6 || circularDistance(d,range.end)<1e-6;
    const copingPiecePlan=(pc,inset,outset)=>{
      const tangent=pc.p1.clone().sub(pc.p0);
      if(tangent.lengthSq()<1e-10)return splitPiecePlan(pc,inset,outset);
      tangent.normalize();
      const outward=new THREE.Vector2(tangent.y,-tangent.x);
      const spillwayEndOverhang=0.05;
      const endpoint=(d,p,offset,isPieceStart)=>{
        if(!isInfinityBoundary(d))return offsetPointOnClosedPath(d,offset);
        const q=p.clone().addScaledVector(outward,offset);
        // Keep the normal 50 mm coping projection longitudinally into the
        // infinity opening as well as the 50 mm projection into the pool.
        // A remaining coping piece that starts at range.end projects backward
        // into the spillway; one that ends at range.start projects forward.
        if(isPieceStart && circularDistance(d,range.end)<1e-6){
          q.addScaledVector(tangent,-spillwayEndOverhang);
        }else if(!isPieceStart && circularDistance(d,range.start)<1e-6){
          q.addScaledVector(tangent,spillwayEndOverhang);
        }
        return q;
      };
      return [
        endpoint(pc.d0,pc.p0,inset,true),endpoint(pc.d1,pc.p1,inset,false),
        endpoint(pc.d1,pc.p1,outset,false),endpoint(pc.d0,pc.p0,outset,true)
      ];
    };

    // Rebuild only the NON-infinity parts of the pool shell here. The selected
    // infinity wall is rebuilt later from the physically trimmed spillCentre so
    // it genuinely terminates against the full-height 200 mm end returns rather
    // than continuing underneath them as overlapping geometry.
    for(const pc of pieces){
      if(pc.p0.distanceTo(pc.p1)<0.01||pc.selected)continue;
      const wallPlan=splitPiecePlan(pc,-wallT*0.5,wallT*0.5);
      const wall=this._addFeatureMesh(group,this._createPlanPrismGeometry(wallPlan,-depth,0),tileMat,{x:0,y:0,z:0},null,'infinity-l-remaining-wall');
      wall.userData.isWall=true;wall.userData.forceVerticalUV=true;
      try{this.updateScaledBoxTilingUVs(wall);}catch(_){ }

      // Match the normal L-shape pool coping exactly: 150 mm from the
      // centreline toward the pool (100 mm wall half-thickness + 50 mm
      // overhang) and 100 mm outward, flush with the outside wall face.
      const capPlan=copingPiecePlan(pc,-0.15,0.10);
      const cap=this._addFeatureMesh(group,this._createPlanPrismGeometry(capPlan,0,copingH),copingMat,{x:0,y:0,z:0},null,'infinity-l-remaining-coping');
      cap.userData.isCoping=true;
    }

    // Build one ordered centreline through the selected L-shape range. The two
    // endpoint pull handles continue to control this range exactly as before.
    const sweep=this._lInfinitySweep(range.start,range.end,path.total);
    const unwrappedEnd=range.start+sweep;
    const distances=[range.start];
    for(const seg of path.segments){
      for(let k=-1;k<=2;k++){
        const d=seg.end+k*path.total;
        if(d>range.start+1e-7&&d<unwrappedEnd-1e-7)distances.push(d);
      }
    }
    distances.push(unwrappedEnd);distances.sort((a,b)=>a-b);
    const centre=distances.map(d=>this._pointOnLPath(d).point.clone());
    if(centre.length<2)return;

    const offsetOpenPolyline=(points,offset)=>{
      const tangents=[],normals=[];
      for(let i=0;i<points.length-1;i++){
        const t=points[i+1].clone().sub(points[i]).normalize();
        tangents.push(t);normals.push(new THREE.Vector2(t.y,-t.x));
      }
      return points.map((p,i)=>{
        if(i===0)return p.clone().addScaledVector(normals[0],offset);
        if(i===points.length-1)return p.clone().addScaledVector(normals[normals.length-1],offset);
        const a=p.clone().addScaledVector(normals[i-1],offset);
        const b=p.clone().addScaledVector(normals[i],offset);
        const hit=lineIntersection2D(a,tangents[i-1],b,tangents[i]);
        if(hit&&hit.distanceTo(p)<=Math.max(1.5,Math.abs(offset)*4))return hit;
        const n=normals[i-1].clone().add(normals[i]);
        if(n.lengthSq()<1e-8)return a;
        n.normalize();
        const denom=Math.max(0.2,Math.abs(n.dot(normals[i])));
        return p.clone().addScaledVector(n,offset/denom);
      });
    };
    const stripPolygon=(inner,outer)=>[...inner.map(p=>p.clone()),...outer.slice().reverse().map(p=>p.clone())];

    // Keep a tiled 500 mm guard on the pool-interior side of both tank junctions.
    // These thin skins follow the actual perimeter (including corners) and sit
    // 1 mm proud of the structural wall, preventing the endpoint face from
    // disappearing through depth precision or return-wall orientation changes.
    const endpointGuardPath=(startDistance,endDistance)=>{
      const distances=[startDistance,endDistance];
      for(const segment of path.segments){
        for(let turn=-2;turn<=2;turn+=1){
          const d=segment.start+turn*path.total;
          if(d>startDistance+1e-7&&d<endDistance-1e-7)distances.push(d);
        }
      }
      distances.sort((a,b)=>a-b);
      return distances.map(distance=>this._pointOnLPath(distance).point.clone());
    };
    const endpointGuardLength=0.50;
    [
      endpointGuardPath(range.start-endpointGuardLength,range.start),
      endpointGuardPath(range.end,range.end+endpointGuardLength)
    ].forEach((guardPath,index)=>{
      if(guardPath.length<2)return;
      const guardBack=offsetOpenPolyline(guardPath,-wallT*0.5-0.004);
      const guardFront=offsetOpenPolyline(guardPath,-wallT*0.5+0.001);
      const guardPlan=stripPolygon(guardBack,guardFront);
      if(guardPlan.length<4)return;
      const guard=this._addFeatureMesh(
        group,
        this._createPlanPrismGeometry(guardPlan,-depth,0),
        tileMat.clone?.()||tileMat,
        {x:0,y:0,z:0},null,
        `infinity-pool-endpoint-tile-guard-${index?'b':'a'}`
      );
      guard.userData.isWall=true;
      guard.userData.forceVerticalUV=true;
      guard.userData.isInfinityEndpointTileGuard=true;
      try{this.updateScaledBoxTilingUVs(guard);}catch(_){}
    });

    // Build a sub-polyline by travelling measured distances along the selected
    // infinity centreline.  This lets the full-height end return occupy the
    // required 200 mm end zone(s) of the spillway while the lowered infinity wall/water
    // starts immediately after that return, including when a handle is near an
    // L-shape corner.
    const subOpenPolylineByDistance=(points,d0,d1)=>{
      if(!Array.isArray(points)||points.length<2)return [];
      const cumulative=[0];
      for(let i=1;i<points.length;i++)cumulative.push(cumulative[i-1]+points[i].distanceTo(points[i-1]));
      const total=cumulative[cumulative.length-1];
      const a=Math.max(0,Math.min(total,d0));
      const b=Math.max(a,Math.min(total,d1));
      const pointAt=(d)=>{
        if(d<=0)return points[0].clone();
        if(d>=total)return points[points.length-1].clone();
        for(let i=0;i<points.length-1;i++){
          if(d<=cumulative[i+1]+1e-9){
            const span=Math.max(1e-9,cumulative[i+1]-cumulative[i]);
            return points[i].clone().lerp(points[i+1],(d-cumulative[i])/span);
          }
        }
        return points[points.length-1].clone();
      };
      const result=[pointAt(a)];
      for(let i=1;i<points.length-1;i++){
        if(cumulative[i]>a+1e-7&&cumulative[i]<b-1e-7)result.push(points[i].clone());
      }
      const endPoint=pointAt(b);
      if(result[result.length-1].distanceToSquared(endPoint)>1e-12)result.push(endPoint);
      return result;
    };

    // Selected spill geometry continues to use the authored perimeter path.
    // Rectangle authored coordinates are the INNER pool-wall face (not the
    // centreline), so the catch-tank footprint may need an endpoint correction
    // when a long wall is face-snapped to an adjoining wall.  That correction
    // is calculated below after the snapped endpoint state is known.
    const selectedLength=centre.slice(1).reduce((sum,p,i)=>sum+p.distanceTo(centre[i]),0);

    // Rectangle mixed-axis endpoint face rule.
    //
    // When both endpoints are on the same axis, preserve the existing tested
    // rectangle behaviour exactly.  When one endpoint has wrapped around a
    // corner, the two 300 mm raised tank walls can legitimately be on different
    // axes.  In that mixed-axis case only the Y-axis RAISED wall needs its
    // 200 mm thickness face mirrored.  A Y-axis raised wall is produced by an
    // X-running spill tangent (isYSpillTangent === false).  The X-axis raised
    // wall (Y-running spill tangent) keeps the existing sign unchanged.
    const endpointTangentAt=(index)=>
      (index===0?centre[1].clone().sub(centre[0]):centre[index].clone().sub(centre[index-1])).normalize();
    const startEndpointTangent=endpointTangentAt(0);
    const endEndpointTangent=endpointTangentAt(centre.length-1);
    const startIsYSpillTangent=Math.abs(startEndpointTangent.y)>Math.abs(startEndpointTangent.x);
    const endIsYSpillTangent=Math.abs(endEndpointTangent.y)>Math.abs(endEndpointTangent.x);
    const rectangleMixedEndpointAxes=path.key==='rectangle' && startIsYSpillTangent!==endIsYSpillTangent;
    const rectangleOppositeParallelEndpoints=path.key==='rectangle'
      && startIsYSpillTangent===endIsYSpillTangent
      && startEndpointTangent.dot(endEndpointTangent)<-0.5;

    // When two rectangle endpoints are on opposite (+/-) parallel walls, the
    // perimeter tangents point in opposite world directions.  Using the fixed
    // start/end outsideSign in that case can make BOTH 200 mm thickness shifts
    // point to the same world side, offsetting both 300 mm raised walls from the
    // exterior pool-wall faces.  Resolve only this configuration from the actual
    // corner each snapped endpoint is nearest to: near a segment start the wall
    // thickness continues backwards (-tangent); near a segment end it continues
    // forwards (+tangent).
    const rectangleOppositeSideFaceSign=(index)=>{
      const distance=index===0?range.start:range.end;
      const hit=this._pointOnLPath(distance);
      if(!hit?.segment)return null;
      const distanceToStart=Math.abs(hit.distance-hit.segment.start);
      const distanceToEnd=Math.abs(hit.segment.end-hit.distance);
      return distanceToStart<=distanceToEnd?-1:1;
    };

    const endpointWallFaceSign=(index,outsideSign,tangent)=>{
      const isYSpillTangent=Math.abs(tangent.y)>Math.abs(tangent.x);
      if(path.key==='rectangle'){
        // Preserve every existing rectangle case except opposite +/- parallel
        // walls.  Those endpoints must independently continue through their own
        // nearest corner so each 300 mm wall lands on that pool wall's exterior
        // face rather than sharing one global thickness direction.
        if(rectangleOppositeParallelEndpoints){
          const localCornerSign=rectangleOppositeSideFaceSign(index);
          if(localCornerSign!==null)return localCornerSign;
        }
        // Mixed-axis rectangle corners must also resolve from the ACTUAL local
        // corner when the endpoint is face-snapped.  Using the global start/end
        // handle role here breaks the -X/-Y corner: the left (-X) return is on
        // a segment END and must continue +tangent through that corner, while
        // the adjoining -Y return is on a segment START and must continue
        // -tangent.  Only use this local-corner rule at the 100 mm snap position;
        // unsnapped mixed-axis movement retains the existing behaviour.
        if(rectangleMixedEndpointAxes){
          const distance=index===0?range.start:range.end;
          const hit=this._pointOnLPath(distance);
          if(hit?.segment){
            const distanceToStart=Math.abs(hit.distance-hit.segment.start);
            const distanceToEnd=Math.abs(hit.segment.end-hit.distance);
            const snapTolerance=0.115; // 100 mm snap + numerical tolerance
            if(Math.min(distanceToStart,distanceToEnd)<=snapTolerance){
              const localCornerSign=distanceToStart<=distanceToEnd?-1:1;
              return localCornerSign;
            }
          }
        }
        // Preserve the established mixed-axis behaviour away from snapped corners.
        return rectangleMixedEndpointAxes && !isYSpillTangent ? -outsideSign : outsideSign;
      }
      // L-shape: keep the established behaviour everywhere except the
      // right/end endpoint when it is magnetically face-snapped at a corner.
      // The end handle now stays on its actual local segment, so the 300 mm
      // raised wall must use that same local corner to choose its 200 mm
      // thickness direction.  Near a segment start continue -tangent; near a
      // segment end continue +tangent.  This lets the right wall rotate onto
      // the adjacent corner without changing the left/start endpoint.
      if(index===centre.length-1){
        const distance=range.end;
        const hit=this._pointOnLPath(distance);
        if(hit?.segment){
          const distanceToStart=Math.abs(hit.distance-hit.segment.start);
          const distanceToEnd=Math.abs(hit.segment.end-hit.distance);
          const snapTolerance=0.115;
          if(Math.min(distanceToStart,distanceToEnd)<=snapTolerance){
            return distanceToStart<=distanceToEnd?-1:1;
          }
        }
      }
      // All other L-shape endpoint orientations retain the established rule.
      return isYSpillTangent ? -outsideSign : outsideSign;
    };

    // Tested orientation rule: keep the existing return decision, but make it
    // consume the exact same endpoint face sign as the raised/tank side wall
    // construction below so a rotated endpoint and its coping cannot disagree.
    const endpointReturnNeed=(index,outsideSign)=>{
      const tangent=endpointTangentAt(index);
      const wallFaceSign=endpointWallFaceSign(index,outsideSign,tangent);
      const thicknessShift=tangent.clone().multiplyScalar(wallFaceSign*wallT);
      const intoInfinityDir=(index===0?tangent.clone():tangent.clone().multiplyScalar(-1));
      return thicknessShift.dot(intoInfinityDir)>1e-8;
    };
    // Keep the tested orientation rule, but also recognise the exact 100 mm
    // face-snap position used when a tank side wall is magnetically aligned to
    // an adjoining pool wall. In that snapped/aligned case the full-height
    // 200 mm return is required even if the general orientation test would
    // otherwise omit it; without it the lowered infinity wall reaches the
    // aligned tank wall and leaves the visible discontinuity.
    const orientationNeedsStartReturn=endpointReturnNeed(0,-1);
    const orientationNeedsEndReturn=endpointReturnNeed(centre.length-1,1);
    const isFaceSnappedEndpoint=(distance)=>{
      const wrap=(v)=>((v%path.total)+path.total)%path.total;
      const circularDistance=(a,b)=>{
        const raw=Math.abs(wrap(a-b));
        return Math.min(raw,path.total-raw);
      };
      let nearest=Infinity;
      for(const seg of path.segments)nearest=Math.min(nearest,circularDistance(distance,seg.start));
      return Math.abs(nearest-wallT*0.5)<=0.0125;
    };
    const snappedStartReturn=isFaceSnappedEndpoint(range.start);
    const snappedEndReturn=isFaceSnappedEndpoint(range.end);

    // Rectangle tank-end alignment: preserve the user-confirmed X-axis raised
    // tank wall behaviour and use that same endpoint reference for the rotated
    // Y-axis raised tank walls.  The working X-axis raised-wall case already
    // uses the snapped perimeter endpoint directly, with NO additional tangent
    // correction.  Applying a separate +300 mm correction only when the spill
    // wall runs in X is what offsets the Y-axis raised tank walls.  Therefore
    // rectangle tank ends now use the snapped endpoint directly in both
    // orientations.  L-shape geometry is unaffected by this rectangle-only rule.
    const rectangleTankEndpointCorrection=(index,outsideSign,isSnapped)=>{
      if(path.key!=='rectangle'||!isSnapped)return new THREE.Vector2(0,0);
      return new THREE.Vector2(0,0);
    };
    const startTankCorrection=rectangleTankEndpointCorrection(0,-1,snappedStartReturn);
    const endTankCorrection=rectangleTankEndpointCorrection(centre.length-1,1,snappedEndReturn);
    const tankCentre=centre.map((p,i)=>{
      if(i===0)return p.clone().add(startTankCorrection);
      if(i===centre.length-1)return p.clone().add(endTankCorrection);
      return p.clone();
    });
    const poolOuter=offsetOpenPolyline(tankCentre,wallT*0.5);
    // The main pool ground hole already reaches 15 mm beyond the outside shell
    // face. Start the separate tank opening another 10 mm beyond that datum so
    // the two ShapeGeometry holes never overlap (overlapping holes can cause the
    // ground triangulation to fill the pool itself). The narrow retained strip
    // remains fully concealed beneath the 200 mm infinity wall.
    const tankGroundInner=offsetOpenPolyline(tankCentre,wallT+0.025);

    // MERGED KNOWN-GOOD BEHAVIOUR:
    // Return geometry follows the previously-tested orientation rule only.
    // Entering the 400 mm face-snap zone must NOT create a return on the
    // opposite orientation, because that is what caused the extra wall/coping
    // projection.  The snap flags are still retained below solely so an
    // already-required 200 mm return can use the correct 50 mm tank-side
    // coping overhang when aligned.
    const needsStartReturn=orientationNeedsStartReturn;
    const needsEndReturn=orientationNeedsEndReturn;
    const maxReturn=Math.min(wallT,Math.max(0,(selectedLength-0.02)*0.5));
    const startReturnIntoInfinity=needsStartReturn?maxReturn:0;
    const endReturnIntoInfinity=needsEndReturn?maxReturn:0;
    const spillCentre=subOpenPolylineByDistance(
      centre,
      startReturnIntoInfinity,
      Math.max(startReturnIntoInfinity,selectedLength-endReturnIntoInfinity)
    );
    const spillPoolInner=spillCentre.length>=2?offsetOpenPolyline(spillCentre,-wallT*0.5):[];
    const spillPoolOuter=spillCentre.length>=2?offsetOpenPolyline(spillCentre, wallT*0.5):[];
    const spillWaterJoin=spillCentre.length>=2?offsetOpenPolyline(spillCentre,wallT*0.5+spillSheetClearance):[];

    // Physically rebuild the lowered infinity wall ONLY across the trimmed
    // spillway. Its start/end planes are therefore exactly the same planes as
    // the inside faces of the full-height returns constructed below.
    const loweredInfinityPlan=spillPoolInner.length>=2&&spillPoolOuter.length>=2?stripPolygon(spillPoolInner,spillPoolOuter):[];
    if(loweredInfinityPlan.length>=4){
      const loweredWall=this._addFeatureMesh(group,this._createPlanPrismGeometry(loweredInfinityPlan,-depth,loweredTop),tileMat,{x:0,y:0,z:0},null,'infinity-l-lowered-wall');
      loweredWall.userData.isWall=true;
      loweredWall.userData.forceVerticalUV=true;
      loweredWall.userData.isInfinityCatchSurface=true;
      try{this.updateScaledBoxTilingUVs(loweredWall);}catch(_){ }
    }
    const outerWallInner=offsetOpenPolyline(tankCentre,wallT*0.5+tankClearWidth);
    const outerWallOuter=offsetOpenPolyline(tankCentre,wallT*0.5+tankClearWidth+wallT);
    const outerCopingInner=offsetOpenPolyline(tankCentre,wallT*0.5+tankClearWidth-0.05);
    const outerCopingOuter=outerWallOuter.map(p=>p.clone());

    const waterMeshes=[];
    // The spillway is trimmed 200 mm only at endpoint(s) that need a separate
    // full-height return. No horizontal overflow water or
    // falling sheet is generated underneath them.
    const overflowPlan=spillPoolInner.length>=2&&spillWaterJoin.length>=2?stripPolygon(spillPoolInner,spillWaterJoin):[];
    if(overflowPlan.length>=4){
      const ow=createPoolWater(this._createPlanPrismGeometry(overflowPlan,loweredTop+0.002,loweredTop+0.012));
      ow.name='infinity-horizontal-water';ow.userData.isInfinityWater=true;group.add(ow);waterMeshes.push(ow);
    }

    // Open pool-side catch tank, identical in principle to the rectangle tank.
    const tankPlan=stripPolygon(poolOuter,outerWallInner);
    const tankWaterThickness=0.025;
    const tankWaterSurfaceZ=tankWaterTop+tankWaterThickness*0.5;
    if(tankPlan.length>=4){
      const floor=this._addFeatureMesh(group,this._createPlanPrismGeometry(tankPlan,tankFloorZ,tankFloorZ+0.10),tileMat,{x:0,y:0,z:0},null,'infinity-catch-floor');
      floor.userData.isFloor=true;floor.userData.isInfinityCatchSurface=true;floor.userData.isInfinityTankGroundFixed=true;floor.userData.infinityTankBaseZ=elevation;
      const tankWaterInner=offsetOpenPolyline(tankCentre,wallT*0.5+spillSheetClearance);
      const tankWaterPlan=stripPolygon(tankWaterInner,outerWallInner);
      const water=createPoolWater(this._createPlanPrismGeometry(tankWaterPlan,tankWaterTop-tankWaterThickness*0.5,tankWaterSurfaceZ));
      water.name='infinity-catch-water';water.userData.isInfinityWater=true;water.userData.isInfinityTankGroundFixed=true;water.userData.infinityTankBaseZ=elevation;group.add(water);waterMeshes.push(water);
    }

    const outerWallPlan=stripPolygon(outerWallInner,outerWallOuter);
    if(outerWallPlan.length>=4){
      const wall=this._addFeatureMesh(group,this._createPlanPrismGeometry(outerWallPlan,tankFloorZ,tankWallTop),tileMat,{x:0,y:0,z:0},null,'infinity-catch-wall-outer');
      wall.userData.isWall=true;wall.userData.forceVerticalUV=true;wall.userData.isInfinityCatchSurface=true;wall.userData.isInfinityTankGroundFixed=true;wall.userData.infinityTankBaseZ=elevation;
    }
    const outerCapPlan=stripPolygon(outerCopingInner,outerCopingOuter);
    if(outerCapPlan.length>=4){
      const cap=this._addFeatureMesh(group,this._createPlanPrismGeometry(outerCapPlan,tankWallTop,tankCopingTop),copingMat,{x:0,y:0,z:0},null,'infinity-catch-coping-outer');
      cap.userData.isCoping=true;cap.userData.isInfinityTankGroundFixed=true;cap.userData.infinityTankBaseZ=elevation;
    }

    // Falling water uses the outside face of the 200 mm pool wall and terminates
    // exactly at the catch-tank water level, as on the rectangle implementation.
    if(spillWaterJoin.length>=2){
      const sheet=createPoolWater(this._createIndexedVerticalArcGeometry(spillWaterJoin,tankWaterSurfaceZ,loweredTop));
      sheet.name='infinity-water-sheet';sheet.userData.isInfinitySpillover=true;
      if(sheet.geometry?.attributes?.position){
        const positions=sheet.geometry.attributes.position,bottomIndices=[];
        for(let i=0;i<positions.count;i++)if(Math.abs(positions.getZ(i)-tankWaterSurfaceZ)<1e-5)bottomIndices.push(i);
        sheet.userData.infinitySheetBottomFixedZ=tankWaterSurfaceZ+elevation;
        sheet.userData.infinitySheetBottomVertexIndices=bottomIndices;
      }
      group.add(sheet);waterMeshes.push(sheet);
    }

    // Close each spillway end with a full-height return extending 200 mm into
    // the selected infinity opening. The lowered infinity wall has already been
    // physically trimmed to the return's inside face above, so these meshes meet
    // face-to-face with no hidden overlap.
    if(startReturnIntoInfinity>0.001||endReturnIntoInfinity>0.001){
      const endReturnPaths=[
        startReturnIntoInfinity>0.001?subOpenPolylineByDistance(centre,0,startReturnIntoInfinity):null,
        endReturnIntoInfinity>0.001?subOpenPolylineByDistance(centre,Math.max(0,selectedLength-endReturnIntoInfinity),selectedLength):null
      ];
      endReturnPaths.forEach((returnPath,ri)=>{
        if(!returnPath||returnPath.length<2)return;
        const returnInner=offsetOpenPolyline(returnPath,-wallT*0.5);
        const returnOuter=offsetOpenPolyline(returnPath, wallT*0.5);
        const returnPlan=stripPolygon(returnInner,returnOuter);
        if(returnPlan.length<4)return;
        const returnWall=this._addFeatureMesh(group,this._createPlanPrismGeometry(returnPlan,tankFloorZ,0),tileMat,{x:0,y:0,z:0},null,`infinity-pool-wall-end-return-${ri===0?'a':'b'}`);
        returnWall.userData.isWall=true;
        returnWall.userData.forceVerticalUV=true;
        returnWall.userData.isInfinityCatchSurface=true;
        returnWall.userData.isInfinityPoolWallExtension=true;
        if(returnWall.geometry?.attributes?.position){
          const positions=returnWall.geometry.attributes.position,bottomIndices=[];
          for(let vi=0;vi<positions.count;vi++)if(Math.abs(positions.getZ(vi)-tankFloorZ)<1e-5)bottomIndices.push(vi);
          returnWall.userData.infinityPoolWallBottomFixedZ=tankFloorZ+elevation;
          returnWall.userData.infinityPoolWallBottomVertexIndices=bottomIndices;
        }

        // Continuous 250 mm coping over the full-height return: 50 mm into the
        // pool, 200 mm over the wall, outside edge flush. At the spillway-facing
        // end it also projects 50 mm longitudinally toward the infinity opening,
        // matching the coping rule used everywhere else on the L-shape pool.
        const capPath=returnPath.map(p=>p.clone());
        if(capPath.length>=2){
          const overhang=0.05;
          if(ri===0){
            const t=capPath[capPath.length-1].clone().sub(capPath[capPath.length-2]).normalize();
            capPath[capPath.length-1].addScaledVector(t,overhang);
          }else{
            const t=capPath[1].clone().sub(capPath[0]).normalize();
            capPath[0].addScaledVector(t,-overhang);
          }
          // When this 200 mm full-height return is at the exact face-snapped
          // alignment with the tank wall, put the coping's extra 50 mm on the
          // TANK side rather than the pool side.  The return wall itself remains
          // 200 mm thick: snapped = 100 mm toward pool / 150 mm toward tank;
          // non-snapped keeps the previously-correct 150 mm toward pool /
          // 100 mm toward tank profile.
          const alignedWithTankWall=ri===0?snappedStartReturn:snappedEndReturn;
          const capInner=offsetOpenPolyline(capPath,alignedWithTankWall?-0.10:-0.15);
          const capOuter=offsetOpenPolyline(capPath,alignedWithTankWall?0.15:0.10);
          const returnCapPlan=capInner.length>=2&&capOuter.length>=2?stripPolygon(capInner,capOuter):[];
          if(returnCapPlan.length>=4){
            const returnCap=this._addFeatureMesh(group,this._createPlanPrismGeometry(returnCapPlan,0,copingH),copingMat,{x:0,y:0,z:0},null,`infinity-pool-wall-end-return-coping-${ri===0?'a':'b'}`);
            returnCap.userData.isCoping=true;
          }
        }
      });
    }

    // Rectangle-style end construction at both L-shape handle positions:
    // first 300 mm is a full-height pool-wall continuation, remainder is a
    // ground-fixed tank side wall. Both are exactly 200 mm thick and collinear.
    const endpointDefs=[
      {index:0,outsideSign:-1,name:'a'},
      {index:centre.length-1,outsideSign:1,name:'b'}
    ];
    for(const def of endpointDefs){
      const i=def.index;
      const tangent=(i===0?centre[1].clone().sub(centre[0]):centre[i].clone().sub(centre[i-1])).normalize();
      const outward=new THREE.Vector2(tangent.y,-tangent.x).normalize();
      // L-shape retains its proven Y-axis thickness correction. Rectangle
      // corners are symmetric, so the side-wall thickness must follow perimeter
      // direction only: start extends backward, end extends forward on every
      // side. This makes short and long rectangle walls behave identically.
      const isYWall=Math.abs(tangent.y)>Math.abs(tangent.x);
      const isRectanglePath=path.key==='rectangle';
      const wallFaceSign=endpointWallFaceSign(i,def.outsideSign,tangent);
      const thicknessShift=tangent.clone().multiplyScalar(wallFaceSign*wallT);
      const tankSideDirection=tangent.clone().multiplyScalar(-wallFaceSign);

      // Start from the corrected tank endpoint.  On a snapped rectangle long
      // wall this is one wall thickness farther along the tangent; everywhere
      // else it is exactly the existing centre endpoint, preserving all tested
      // short-wall and L-shape behaviour.
      const tankEndpoint=tankCentre[i].clone();
      const wallFaceStart=tankEndpoint.clone().addScaledVector(outward,wallT*0.5);

      // The 300 mm full-height continuation is retained in every orientation.
      // Whether a separate 200 mm infinity end-return is required is handled
      // independently above; never suppress this 300 mm raised extension.
      const effectivePoolWallExtension=poolWallExtension;
      const raisedEnd=wallFaceStart.clone().addScaledVector(outward,effectivePoolWallExtension);
      const outerFaceEnd=tankEndpoint.clone().addScaledVector(outward,wallT*0.5+tankClearWidth+wallT);

      if(effectivePoolWallExtension>0.001){
        const raisedPlan=[wallFaceStart,raisedEnd,raisedEnd.clone().add(thicknessShift),wallFaceStart.clone().add(thicknessShift)];
        const raised=this._addFeatureMesh(group,this._createPlanPrismGeometry(raisedPlan,tankFloorZ,0),tileMat,{x:0,y:0,z:0},null,`infinity-pool-wall-extension-${def.name}`);
        raised.userData.isWall=true;raised.userData.forceVerticalUV=true;raised.userData.isInfinityCatchSurface=true;raised.userData.isInfinityPoolWallExtension=true;
        if(raised.geometry?.attributes?.position){
          const positions=raised.geometry.attributes.position,bottomIndices=[];
          for(let vi=0;vi<positions.count;vi++)if(Math.abs(positions.getZ(vi)-tankFloorZ)<1e-5)bottomIndices.push(vi);
          raised.userData.infinityPoolWallBottomFixedZ=tankFloorZ+elevation;
          raised.userData.infinityPoolWallBottomVertexIndices=bottomIndices;
        }

        // 250 mm pool-extension coping: 200 mm wall coverage + 50 mm toward tank,
        // with the rear edge flush to the back face of the raised wall.
        // When this endpoint also carries the 200 mm full-height infinity end-return,
        // the local wall-thickness orientation is reversed relative to the normal
        // 300 mm extension.  In that one orientation, mirror ONLY the coping
        // overhang direction so the visible 50 mm projection remains on the
        // catch-tank side.  All other coping orientations stay unchanged.
        // Coping orientation must not change merely because the endpoint has
        // entered the 400 mm face-snap zone. The user-confirmed coping profile
        // is correct when the wall is moved back, so preserve that orientation
        // rule and let the snap-only 200 mm return affect wall/spill geometry
        // only.
        const hasInfinityEndReturn=def.name==='a'?orientationNeedsStartReturn:orientationNeedsEndReturn;
        const raisedCopingTankDir=hasInfinityEndReturn?tankSideDirection.clone().multiplyScalar(-1):tankSideDirection;
        let raisedCapPlan;
        if(hasInfinityEndReturn){
          // In the return orientation, build the coping directly from the two
          // actual faces of the 200 mm raised wall.  The back edge is exactly
          // flush with the wall's back face, while the tank-facing edge projects
          // 50 mm into the catch tank.  This gives a true 250 mm section:
          // 200 mm wall coverage + 50 mm tank-side overhang, with no rear overhang.
          const thicknessDir=thicknessShift.clone().normalize();
          const tankDir=raisedCopingTankDir.clone().normalize();
          const tankIsShiftedFace=tankDir.dot(thicknessDir)>0;
          const startBase=wallFaceStart.clone();
          const endBase=raisedEnd.clone();
          const startShifted=wallFaceStart.clone().add(thicknessShift);
          const endShifted=raisedEnd.clone().add(thicknessShift);
          const tankStart=(tankIsShiftedFace?startShifted:startBase).clone().addScaledVector(tankDir,0.05);
          const tankEnd=(tankIsShiftedFace?endShifted:endBase).clone().addScaledVector(tankDir,0.05);
          const backStart=(tankIsShiftedFace?startBase:startShifted).clone();
          const backEnd=(tankIsShiftedFace?endBase:endShifted).clone();
          raisedCapPlan=[tankStart,tankEnd,backEnd,backStart];
        }else{
          // Preserve every other coping orientation exactly as before.
          raisedCapPlan=[
            wallFaceStart.clone().addScaledVector(raisedCopingTankDir,0.05),
            raisedEnd.clone().addScaledVector(raisedCopingTankDir,0.05),
            raisedEnd.clone().add(thicknessShift),
            wallFaceStart.clone().add(thicknessShift)
          ];
        }
        const raisedCap=this._addFeatureMesh(group,this._createPlanPrismGeometry(raisedCapPlan,0,copingH),copingMat,{x:0,y:0,z:0},null,`infinity-pool-wall-extension-coping-${def.name}`);
        raisedCap.userData.isCoping=true;
      }

      const tankRun=Math.max(0,outerFaceEnd.distanceTo(raisedEnd));
      if(tankRun>0.001){
        const tankSidePlan=[raisedEnd,outerFaceEnd,outerFaceEnd.clone().add(thicknessShift),raisedEnd.clone().add(thicknessShift)];
        const sideWall=this._addFeatureMesh(group,this._createPlanPrismGeometry(tankSidePlan,tankFloorZ,tankWallTop),tileMat,{x:0,y:0,z:0},null,`infinity-catch-side-wall-${def.name}`);
        sideWall.userData.isWall=true;sideWall.userData.forceVerticalUV=true;sideWall.userData.isInfinityCatchSurface=true;sideWall.userData.isInfinityTankGroundFixed=true;sideWall.userData.infinityTankBaseZ=elevation;

        const sideCapPlan=[
          raisedEnd.clone().addScaledVector(tankSideDirection,0.05),
          outerFaceEnd.clone().addScaledVector(tankSideDirection,0.05),
          outerFaceEnd.clone().add(thicknessShift),
          raisedEnd.clone().add(thicknessShift)
        ];
        const sideCap=this._addFeatureMesh(group,this._createPlanPrismGeometry(sideCapPlan,tankWallTop,tankCopingTop),copingMat,{x:0,y:0,z:0},null,`infinity-catch-side-coping-${def.name}`);
        sideCap.userData.isCoping=true;sideCap.userData.isInfinityTankGroundFixed=true;sideCap.userData.infinityTankBaseZ=elevation;
      }
    }

    // Trim the ground to the complete rectangle-style catch-tank footprint.
    const ground=this.ground||this.scene?.userData?.ground;
    if(ground&&poolOuter.length>=2&&outerWallOuter.length>=2){
      const groundPolygon=[...tankGroundInner.map(p=>p.clone()),...outerWallOuter.slice().reverse().map(p=>p.clone())];
      const existing=Array.isArray(ground.userData.extraGroundVoids)?ground.userData.extraGroundVoids.filter(e=>e?.name!=='infinity-catch-tank'):[];
      ground.userData.extraGroundVoids=[...existing,{name:'infinity-catch-tank',points:groundPolygon}];
    }

    if(!Array.isArray(this.poolGroup?.userData?.animatables))this.poolGroup.userData.animatables=[];
    this.poolGroup.userData.animatables.push(...waterMeshes);
  }

  setupDimensionHandles() {
    if (this.dimensionHandles?.meshes && Object.keys(this.dimensionHandles.meshes).length) return;
    if (!this.scene || !this.renderer) return;

    const meshes = {
      top: this._makeDimensionHandleMesh("top", "↕"),
      bottom: this._makeDimensionHandleMesh("bottom", "↕"),
      left: this._makeDimensionHandleMesh("left", "↔"),
      right: this._makeDimensionHandleMesh("right", "↔"),
      notchLength: this._makeDimensionHandleMesh("notchLength", "↔"),
      notchWidth: this._makeDimensionHandleMesh("notchWidth", "↕")
    };

    Object.values(meshes).forEach((mesh) => this.scene.add(mesh));

    this.dimensionHandles = {
      meshes,
      drag: null,
      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2()
    };

    this._boundDimensionHandlePointerDown = (event) => this._onDimensionHandlePointerDown(event);
    this._boundDimensionHandlePointerMove = (event) => this._onDimensionHandlePointerMove(event);
    this._boundDimensionHandlePointerUp = () => this._onDimensionHandlePointerUp();

    this.renderer.domElement.addEventListener("pointerdown", this._boundDimensionHandlePointerDown);
    this._setupHandleHoverReveal();
    this._boundExternalPanelFocusPointerDown = (event) => {
      if (event.button !== 0 || !this.poolGroup || !this.camera) return;
      const ndc = this._pointerToNDC(event);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.camera);
      if (this.spa) {
        const spaHits = ray.intersectObjects(this.getSpaSelectionMeshes?.() || [], true);
        if (spaHits.length) { this._notifyDesignerInteraction?.("spa"); return; }
      }
      const poolMeshes = [];
      this.poolGroup.traverse((obj) => {
        const ud = obj?.userData || {};
        if (obj?.isMesh && (ud.isWall || ud.isFloor || ud.isCoping || ud.isStep || ud.isBench)) poolMeshes.push(obj);
      });
      if (poolMeshes.length && ray.intersectObjects(poolMeshes, true).length) this._notifyDesignerInteraction?.("pool");
    };
    this.renderer.domElement.addEventListener("pointerdown", this._boundExternalPanelFocusPointerDown, true);
    window.addEventListener("pointermove", this._boundDimensionHandlePointerMove);
    window.addEventListener("pointerup", this._boundDimensionHandlePointerUp);
    window.addEventListener("pointercancel", this._boundDimensionHandlePointerUp);
  }

  destroyDimensionHandles() {
    if (this._boundDimensionHandlePointerDown && this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener("pointerdown", this._boundDimensionHandlePointerDown);
      this._boundDimensionHandlePointerDown = null;
    }
    if (this._boundExternalPanelFocusPointerDown && this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener("pointerdown", this._boundExternalPanelFocusPointerDown, true);
      this._boundExternalPanelFocusPointerDown = null;
    }
    if (this._boundDimensionHandlePointerMove) {
      window.removeEventListener("pointermove", this._boundDimensionHandlePointerMove);
      this._boundDimensionHandlePointerMove = null;
    }
    if (this._boundDimensionHandlePointerUp) {
      window.removeEventListener("pointerup", this._boundDimensionHandlePointerUp);
      window.removeEventListener("pointercancel", this._boundDimensionHandlePointerUp);
      this._boundDimensionHandlePointerUp = null;
    }

    const meshes = this.dimensionHandles?.meshes || {};
    Object.values(meshes).forEach((mesh) => {
      if (!mesh) return;
      mesh.parent?.remove?.(mesh);
      mesh.material?.map?.dispose?.();
      mesh.material?.dispose?.();
    });

    this.dimensionHandles = { meshes: {}, drag: null, raycaster: null, mouse: null };
  }

  _setDimensionHandleVisibility(visible) {
    const meshes = this.dimensionHandles?.meshes || {};
    Object.values(meshes).forEach((mesh) => {
      if (!mesh) return;
      mesh.visible = !!visible;
    });
  }

  _pointerToNDC(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1
    };
  }

  _screenToPlanePoint(clientX, clientY, planeZ = 0) {
    if (!this.camera || !this.renderer) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeZ);
    const p = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, p) ? p : null;
  }

  _projectWorldToScreen(point) {
    if (!point || !this.camera || !this.renderer) return null;
    const projected = point.clone().project(this.camera);
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || projected.z < -1 || projected.z > 1) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height,
      rect
    };
  }

  _getDimensionHandleWorldTargets() {
    if (!this.poolGroup) return null;

    const shape = this.poolParams?.shape;
    const z = this._getPoolCopingWorldTopZ() + 0.006;
    const out = 0.02;

    const source = Array.isArray(this.poolGroup?.userData?.outerPts)
      ? this.poolGroup.userData.outerPts
      : [];
    const localPts = source
      .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));

    if (localPts.length >= 3) {
      this.poolGroup.updateWorldMatrix?.(true, false);
      const worldPts = localPts.map((point) =>
        this.poolGroup.localToWorld(new THREE.Vector3(point.x, point.y, 0))
      );

      if (shape === "L" && worldPts.length >= 6) {
        const mid = (a, b) => new THREE.Vector3(
          (a.x + b.x) * 0.5,
          (a.y + b.y) * 0.5,
          z
        );
        const targets = {
          left: mid(worldPts[5], worldPts[0]),
          bottom: mid(worldPts[0], worldPts[1]),
          right: mid(worldPts[1], worldPts[2]),
          top: mid(worldPts[2], worldPts[3]),
          notchLength: mid(worldPts[3], worldPts[4]),
          notchWidth: mid(worldPts[4], worldPts[5])
        };
        targets.left.x -= out;
        targets.right.x += out;
        targets.bottom.y -= out;
        targets.top.y += out;
        targets.notchLength.x += out;
        targets.notchWidth.y += out;
        return targets;
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      worldPts.forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
      if ([minX, minY, maxX, maxY].every(Number.isFinite)) {
        const centerX = (minX + maxX) * 0.5;
        const centerY = (minY + maxY) * 0.5;
        return {
          top: new THREE.Vector3(centerX, maxY + out, z),
          bottom: new THREE.Vector3(centerX, minY - out, z),
          left: new THREE.Vector3(minX - out, centerY, z),
          right: new THREE.Vector3(maxX + out, centerY, z)
        };
      }
    }

    // Fallback for any future shape that does not expose outerPts. Filter out
    // animated water/feature geometry so wave displacement can never move the handles.
    const poolBounds = new THREE.Box3();
    let hasBounds = false;
    this.poolGroup.traverse((object) => {
      if (!object?.isMesh || object.visible === false) return;
      const data = object.userData || {};
      const name = String(object.name || '').toLowerCase();
      if (data.isPoolWater || data.isInfinityWater || data.isInfinitySpillover || data.isAutomaticPoolLight || name.includes('water')) return;
      if (!(data.isWall || data.isFloor || data.isPoolFloor || data.isCoping || data.isStep || data.isBench)) return;
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) return;
      poolBounds.union(bounds);
      hasBounds = true;
    });
    if (!hasBounds || poolBounds.isEmpty()) return null;
    const center = poolBounds.getCenter(new THREE.Vector3());
    return {
      top: new THREE.Vector3(center.x, poolBounds.max.y + out, z),
      bottom: new THREE.Vector3(center.x, poolBounds.min.y - out, z),
      left: new THREE.Vector3(poolBounds.min.x - out, center.y, z),
      right: new THREE.Vector3(poolBounds.max.x + out, center.y, z)
    };
  }

  _onDimensionHandlePointerDown(event) {
    if (event.button !== 0) return;
    if (!this.poolGroup || this.poolParams.shape === "freeform") return;
    if (!this.dimensionHandles?.meshes) return;

    const ndc = this._pointerToNDC(event);
    this.dimensionHandles.mouse.set(ndc.x, ndc.y);
    this.dimensionHandles.raycaster.setFromCamera(this.dimensionHandles.mouse, this.camera);

    const meshes = Object.values(this.dimensionHandles.meshes).filter((m) => m?.visible);
    const hits = this.dimensionHandles.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return;

    const handle = hits[0].object;
    const key = handle?.userData?.handleKey;
    if (!key) return;

    this._notifyDesignerInteraction?.("pool");
    event.preventDefault();
    event.stopPropagation();

    const planeZ = 0;
    const point = this._screenToPlanePoint(event.clientX, event.clientY, planeZ) || handle.position.clone();
    const screenAxis = this._getHandleScreenAxisMetrics(handle, handle.position);
    const verticalAxis = this._getHandleScreenAxisMetrics(
      { userData: { handleAxisVector: new THREE.Vector3(0, 0, 1) } },
      handle.position
    );
    if (!screenAxis || !verticalAxis) return;

    const affectsLength = key === "left" || key === "right";
    const affectsNotchLength = key === "notchLength";
    const affectsNotchWidth = key === "notchWidth";
    const label = affectsLength ? "length or height" : affectsNotchLength ? "notch length" : affectsNotchWidth ? "notch width" : "width or height";
    this.captureUndoState(`Drag ${label} handle`);

    if (!this._live.baseParams) {
      this._live.baseParams = { ...(this.poolGroup?.userData?.poolParams || this.poolParams) };
    }

    this.dimensionHandles.drag = {
      key,
      pointerId: event.pointerId,
      handle,
      planeZ,
      startPoint: point.clone(),
      startClientX: event.clientX,
      startClientY: event.clientY,
      screenAxis,
      verticalAxis,
      mode: (key === "notchLength" || key === "notchWidth") ? "resize" : null,
      startLength: Number(this.poolParams.length) || 0,
      startWidth: Number(this.poolParams.width) || 0,
      startNotchLengthX: Number(this.poolParams.notchLengthX) || 0,
      startNotchWidthY: Number(this.poolParams.notchWidthY) || 0,
      startElevation: this.getPoolElevation()
    };

    this._setDimensionHandleActive(handle, true);
    if (this.controls) this.controls.enabled = false;
    this._setLiveDragging(true);
  }

  _onDimensionHandlePointerMove(event) {
    const drag = this.dimensionHandles?.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const pointerDx = event.clientX - drag.startClientX;
    const pointerDy = event.clientY - drag.startClientY;
    const sizePixels = pointerDx * drag.screenAxis.x + pointerDy * drag.screenAxis.y;
    const verticalPixels = pointerDx * drag.verticalAxis.x + pointerDy * drag.verticalAxis.y;

    // Match the spa interaction: each existing length/width handle supports
    // resize along its projected wall axis or pool elevation along projected Z.
    // The first deliberate movement locks the gesture for that drag.
    if (!drag.mode && Math.hypot(pointerDx, pointerDy) >= 6) {
      drag.mode = Math.abs(verticalPixels) > Math.abs(sizePixels) * 1.15 ? "elevation" : "resize";
    }
    if (!drag.mode) return;

    if (drag.mode === "elevation") {
      const worldHeightDelta = verticalPixels / drag.verticalAxis.pixelsPerWorld;
      const nextElevation = Math.round(THREE.MathUtils.clamp(drag.startElevation + worldHeightDelta, 0.1, 1.5) / 0.1) * 0.1;
      if (Math.abs(nextElevation - this.getPoolElevation()) > 1e-4) {
        this.poolParams.raised = true;
        this.poolParams.poolElevation = nextElevation;
        this.applyPoolElevation();
        this.syncPoolRaisedControl();
        this._notifyDesignerStateChanged?.();
      }
      this.syncSlidersFromParams();
      return;
    }

    const worldDelta = sizePixels / drag.screenAxis.pixelsPerWorld;
    const minSize = 2.0;
    if (drag.key === "left" || drag.key === "right") {
      const signedDelta = drag.key === "right" ? worldDelta : -worldDelta;
      const rawLength = Math.max(minSize, drag.startLength + signedDelta * 2);
      const nextLength = Math.round(rawLength / 0.1) * 0.1;
      if (Math.abs(nextLength - this.poolParams.length) > 1e-4) {
        this.poolParams.length = nextLength;
        this._markPoolParamDirty("length");
      }
    } else if (drag.key === "top" || drag.key === "bottom") {
      const signedDelta = drag.key === "top" ? worldDelta : -worldDelta;
      const rawWidth = Math.max(minSize, drag.startWidth + signedDelta * 2);
      const nextWidth = Math.round(rawWidth / 0.1) * 0.1;
      if (Math.abs(nextWidth - this.poolParams.width) > 1e-4) {
        this.poolParams.width = nextWidth;
        this._markPoolParamDirty("width");
      }
    } else if (drag.key === "notchLength") {
      const rawFrac = drag.startNotchLengthX - (worldDelta / Math.max(0.001, drag.startLength));
      const nextFrac = Math.round(THREE.MathUtils.clamp(rawFrac, 0.1, 0.9) / 0.05) * 0.05;
      if (Math.abs(nextFrac - this.poolParams.notchLengthX) > 1e-4) {
        this.poolParams.notchLengthX = nextFrac;
        this._markPoolParamDirty("notchLengthX");
      }
    } else if (drag.key === "notchWidth") {
      const rawFrac = drag.startNotchWidthY - (worldDelta / Math.max(0.001, drag.startWidth));
      const nextFrac = Math.round(THREE.MathUtils.clamp(rawFrac, 0.1, 0.9) / 0.05) * 0.05;
      if (Math.abs(nextFrac - this.poolParams.notchWidthY) > 1e-4) {
        this.poolParams.notchWidthY = nextFrac;
        this._markPoolParamDirty("notchWidthY");
      }
    }

    this.syncSlidersFromParams();
  }

  async _onDimensionHandlePointerUp() {
    const drag = this.dimensionHandles?.drag;
    if (!drag) return;
    this._setDimensionHandleActive(drag.handle, false);
    this.dimensionHandles.drag = null;
    if (this.controls) this.controls.enabled = true;
    await this._setLiveDragging(false);
    await this._refreshSectionViewAfterGeometryEdit({ moveCamera: false, fullReset: true });
  }

  _updateDimensionHandles() {
    if (!this.dimensionHandles?.meshes || !this.camera || !this.renderer) return;

    const shouldShow =
      !!this.poolGroup &&
      !this.poolEditor &&
      !this.customizeMode &&
      !this.sectionViewEnabled &&
      this.poolParams.shape !== "freeform";

    if (!shouldShow) {
      this._setDimensionHandleVisibility(false);
      return;
    }

    const targets = this._getDimensionHandleWorldTargets();
    if (!targets) {
      this._setDimensionHandleVisibility(false);
      return;
    }

    const margin = 14;
    const isLShape = this.poolParams?.shape === "L";
    Object.entries(this.dimensionHandles.meshes).forEach(([key, mesh]) => {
      const point = targets[key];
      if (!mesh || !point || ((key === "notchLength" || key === "notchWidth") && !isLShape)) {
        if (mesh) mesh.visible = false;
        return;
      }

      mesh.position.copy(point);
      this._orientDimensionHandleToCamera(mesh, point);
      const screen = this._projectWorldToScreen(point);
      if (!screen) {
        mesh.visible = false;
        return;
      }

      mesh.visible =
        screen.x >= screen.rect.left + margin &&
        screen.x <= screen.rect.right - margin &&
        screen.y >= screen.rect.top + margin &&
        screen.y <= screen.rect.bottom - margin;
    });
  }


// -----------------------------
  // Spa dimension drag handles
  // -----------------------------
  setupSpaDimensionHandles() {
    if (this.spaDimensionHandles?.meshes && Object.keys(this.spaDimensionHandles.meshes).length) return;
    if (!this.scene || !this.renderer) return;

    const meshes = {
      top: this._makeDimensionHandleMesh("spaTop", "↕"),
      bottom: this._makeDimensionHandleMesh("spaBottom", "↕"),
      left: this._makeDimensionHandleMesh("spaLeft", "↔"),
      right: this._makeDimensionHandleMesh("spaRight", "↔")
    };

    Object.values(meshes).forEach((mesh) => this.scene.add(mesh));

    this.spaDimensionHandles = {
      meshes,
      drag: null,
      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2()
    };

    this._boundSpaHandlePointerDown = (event) => this._onSpaHandlePointerDown(event);
    this._boundSpaHandlePointerMove = (event) => this._onSpaHandlePointerMove(event);
    this._boundSpaHandlePointerUp = () => this._onSpaHandlePointerUp();

    this.renderer.domElement.addEventListener("pointerdown", this._boundSpaHandlePointerDown);
    window.addEventListener("pointermove", this._boundSpaHandlePointerMove);
    window.addEventListener("pointerup", this._boundSpaHandlePointerUp);
    window.addEventListener("pointercancel", this._boundSpaHandlePointerUp);
  }

  _getSpaHandleTargets() {
    if (!this.spa) return null;
    const cx = Number(this.spa.position.x) || 0;
    const cy = Number(this.spa.position.y) || 0;
    const spaBounds = new THREE.Box3().setFromObject(this.spa);
    if (!spaBounds || spaBounds.isEmpty()) return null;
    // Pin the existing length/width handles to the top of the spa. The same
    // handles retain their resize-or-elevation gesture and move with raised spas.
    const z = spaBounds.max.z + 0.01;
    const out = 0.01;
    const length = Math.max(0.5, Number(this.spa.userData?.spaLength) || 2);
    const width = Math.max(0.5, Number(this.spa.userData?.spaWidth) || 2);

    return {
      top: new THREE.Vector3(cx, cy + width * 0.5 + out, z),
      bottom: new THREE.Vector3(cx, cy - width * 0.5 - out, z),
      left: new THREE.Vector3(cx - length * 0.5 - out, cy, z),
      right: new THREE.Vector3(cx + length * 0.5 + out, cy, z)
    };
  }

  _updateSpaHandleSliderUI() {
    const widthSlider = document.getElementById("spaWidth");
    const lengthSlider = document.getElementById("spaLength");
    const widthOut = document.getElementById("spaWidth-val");
    const lengthOut = document.getElementById("spaLength-val");
    const width = Number(this.spa?.userData?.spaWidth) || 0;
    const length = Number(this.spa?.userData?.spaLength) || 0;
    if (widthSlider) widthSlider.value = String(width);
    if (lengthSlider) lengthSlider.value = String(length);
    if (widthOut) widthOut.textContent = width.toFixed(2) + " m";
    if (lengthOut) lengthOut.textContent = length.toFixed(2) + " m";
  }

  _onSpaHandlePointerDown(event) {
    if (event.button !== 0) return;
    if (!this.spa || !this.spaDimensionHandles?.meshes) return;

    const ndc = this._pointerToNDC(event);
    this.spaDimensionHandles.mouse.set(ndc.x, ndc.y);
    this.spaDimensionHandles.raycaster.setFromCamera(this.spaDimensionHandles.mouse, this.camera);

    const meshes = Object.values(this.spaDimensionHandles.meshes).filter((m) => m?.visible);
    const hits = this.spaDimensionHandles.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return;

    const handle = hits[0].object;
    const key = handle?.userData?.handleKey;
    if (!key) return;

    this._notifyDesignerInteraction?.("spa");
    event.preventDefault();
    event.stopImmediatePropagation();

    const point = this._screenToPlanePoint(event.clientX, event.clientY, 0) || handle.position.clone();
    const screenAxis = this._getHandleScreenAxisMetrics(handle, handle.position);
    const verticalAxis = this._getHandleScreenAxisMetrics(
      { userData: { handleAxisVector: new THREE.Vector3(0, 0, 1) } },
      handle.position
    );
    if (!screenAxis || !verticalAxis) return;

    this.captureUndoState("Spa dimension or elevation handle drag");

    const topConstraints = getSpaTopOffsetConstraints(this.spa);
    this.spaDimensionHandles.drag = {
      key,
      pointerId: event.pointerId,
      handle,
      startPoint: point.clone(),
      startClientX: event.clientX,
      startClientY: event.clientY,
      screenAxis,
      verticalAxis,
      mode: null,
      startLength: Number(this.spa.userData?.spaLength) || 2,
      startWidth: Number(this.spa.userData?.spaWidth) || 2,
      startTopOffset: Number(topConstraints?.value) || 0
    };

    this._setDimensionHandleActive(handle, true);
    if (this.controls) this.controls.enabled = false;
  }

  _refreshSpaDependentGeometry({ resnapSpa = false } = {}) {
    if (!this.poolGroup) return;

    // Pool dimension edits replace or scale the pool shell. Rebind and resnap
    // the existing spa before rebuilding its throat/void so clipping planes are
    // calculated from the new wall position rather than the previous pool size.
    if (this.spa && resnapSpa) {
      try {
        this.spa.userData.poolGroup = this.poolGroup;
        this.spa.userData.poolParams = this.poolParams;
        this.poolGroup.updateMatrixWorld?.(true);
        snapToPool(this.spa);
        updateSpa(this.spa);
        this.applyPoolElevation();
      } catch (_) {}
    }

    this._ensureAutomaticSpaLight?.();
    try {
      this.poolGroup.updateMatrixWorld?.(true);
      this.spa?.updateMatrixWorld?.(true);
      updatePoolWaterVoid(this.poolGroup,this.spa);
      updateGroundVoid(this.ground || this.scene?.userData?.ground,this.poolGroup,this.spa);
    } catch (_) {}

    // Pool/spa transforms can settle at the end of the current frame. Repeat the
    // void calculation once after matrices have propagated so a pool resize can
    // never leave the old pool wall visible inside the spa.
    requestAnimationFrame(()=>{
      if(!this.poolGroup) return;
      try {
        this.poolGroup.updateMatrixWorld?.(true);
        this.spa?.updateMatrixWorld?.(true);
        updatePoolWaterVoid(this.poolGroup,this.spa);
        updateGroundVoid(this.ground || this.scene?.userData?.ground,this.poolGroup,this.spa);
      } catch (_) {}
    });
  }

  _onSpaHandlePointerMove(event) {
    const drag = this.spaDimensionHandles?.drag;
    if (!drag || event.pointerId !== drag.pointerId || !this.spa) return;

    const pointerDx = event.clientX - drag.startClientX;
    const pointerDy = event.clientY - drag.startClientY;
    const sizePixels = pointerDx * drag.screenAxis.x + pointerDy * drag.screenAxis.y;
    const verticalPixels = pointerDx * drag.verticalAxis.x + pointerDy * drag.verticalAxis.y;

    // One contextual handle supports two operations. The first deliberate drag
    // direction locks the gesture for the rest of that pointer interaction:
    // along the projected wall axis = resize; along projected world Z = raise/lower.
    if (!drag.mode && Math.hypot(pointerDx, pointerDy) >= 6) {
      drag.mode = Math.abs(verticalPixels) > Math.abs(sizePixels) * 1.15 ? "elevation" : "resize";
    }
    if (!drag.mode) return;

    const spaShape = this.spa.userData?.spaShape || this.getSelectedSpaShape();
    const snap = (v) => Math.round(Math.max(0.5, v) / 0.1) * 0.1;

    if (drag.mode === "elevation") {
      const worldHeightDelta = verticalPixels / drag.verticalAxis.pixelsPerWorld;
      const nextTopOffset = THREE.MathUtils.clamp(
        Math.round((drag.startTopOffset + worldHeightDelta) / 0.1) * 0.1,
        Number(getSpaTopOffsetConstraints(this.spa)?.min) || 0,
        1.5
      );
      setSpaTopOffset(nextTopOffset);
      this.refreshSpaTopOffsetSlider();
    } else {
      const worldDelta = sizePixels / drag.screenAxis.pixelsPerWorld;
      if (drag.key === "spaLeft" || drag.key === "spaRight") {
        const signedDelta = drag.key === "spaRight" ? worldDelta : -worldDelta;
        const nextLength = snap(drag.startLength + signedDelta * 2);
        if (spaShape === "circular") {
          this.spa.userData.spaLength = nextLength;
          this.spa.userData.spaWidth = nextLength;
        } else {
          this.spa.userData.spaLength = nextLength;
        }
      } else {
        const signedDelta = drag.key === "spaTop" ? worldDelta : -worldDelta;
        const nextWidth = snap(drag.startWidth + signedDelta * 2);
        if (spaShape === "circular") {
          this.spa.userData.spaLength = nextWidth;
          this.spa.userData.spaWidth = nextWidth;
        } else {
          this.spa.userData.spaWidth = nextWidth;
        }
      }
    }

    updateSpa(this.spa);
    this.applyPoolElevation();
    this._refreshSpaDependentGeometry();
    this._updateSpaHandleSliderUI();
    this._notifyDesignerStateChanged?.();
  }

  async _onSpaHandlePointerUp() {
    const drag = this.spaDimensionHandles?.drag;
    if (!drag) return;
    this._setDimensionHandleActive(drag.handle, false);
    this.spaDimensionHandles.drag = null;
    if (this.controls) this.controls.enabled = true;
    if (this.spa) {
      updateSpa(this.spa);
      this.applyPoolElevation();
      await this.pbrManager?.applyTilesToSpa?.(this.spa);
      this.refreshSpaTopOffsetSlider();
      this._notifyDesignerStateChanged?.();
      this._refreshSpaDependentGeometry();
    }
    await this._refreshSectionViewAfterGeometryEdit({ moveCamera: false, fullReset: true });
  }

  _updateSpaDimensionHandles() {
    if (!this.spaDimensionHandles?.meshes || !this.camera || !this.renderer) return;

    const hideSpaHandles = () => {
      Object.values(this.spaDimensionHandles.meshes).forEach((mesh) => { if (mesh) mesh.visible = false; });
    };

    // Match the pool length/width handle behaviour: spa resize handles must not
    // appear or become clickable while section view is active. This guard is
    // intentionally inside the per-frame update so handles stay hidden after
    // rebuilds, selection changes, screenshot refreshes, and geometry edits.
    if (this.sectionViewEnabled) {
      hideSpaHandles();
      return;
    }

    if (!this.spa) {
      hideSpaHandles();
      return;
    }

    const targets = this._getSpaHandleTargets();
    if (!targets) return;

    const margin = 14;
    Object.entries(this.spaDimensionHandles.meshes).forEach(([key, mesh]) => {
      const point = targets[key.replace("spa","").toLowerCase()] || targets[key];
      if (!mesh || !point) {
        if (mesh) mesh.visible = false;
        return;
      }

      mesh.position.copy(point);
      this._orientDimensionHandleToCamera(mesh, point);
      const screen = this._projectWorldToScreen(point);
      if (!screen) {
        mesh.visible = false;
        return;
      }

      mesh.visible =
        screen.x >= screen.rect.left + margin &&
        screen.x <= screen.rect.right - margin &&
        screen.y >= screen.rect.top + margin &&
        screen.y <= screen.rect.bottom - margin;
    });
  }


// -----------------------------
  // Section dimension drag handles
  // -----------------------------
  setupSectionDimensionHandles() {
    if (this.sectionDimensionHandles?.meshes && Object.keys(this.sectionDimensionHandles.meshes).length) return;
    if (!this.scene || !this.renderer) return;

    const meshes = {
      shallow: this._makeDimensionHandleMesh("sectionShallow", "↕"),
      deep: this._makeDimensionHandleMesh("sectionDeep", "↕"),
      shallowFlat: this._makeDimensionHandleMesh("sectionShallowFlat", "↔"),
      deepFlat: this._makeDimensionHandleMesh("sectionDeepFlat", "↔")
    };

    Object.values(meshes).forEach((mesh) => this.scene.add(mesh));

    this.sectionDimensionHandles = {
      meshes,
      drag: null,
      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2()
    };

    this._boundSectionHandlePointerDown = (event) => this._onSectionHandlePointerDown(event);
    this._boundSectionHandlePointerMove = (event) => this._onSectionHandlePointerMove(event);
    this._boundSectionHandlePointerUp = () => this._onSectionHandlePointerUp();

    this.renderer.domElement.addEventListener("pointerdown", this._boundSectionHandlePointerDown);
    window.addEventListener("pointermove", this._boundSectionHandlePointerMove);
    window.addEventListener("pointerup", this._boundSectionHandlePointerUp);
    window.addEventListener("pointercancel", this._boundSectionHandlePointerUp);
  }

  destroySectionDimensionHandles() {
    if (this._boundSectionHandlePointerDown && this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener("pointerdown", this._boundSectionHandlePointerDown);
      this._boundSectionHandlePointerDown = null;
    }
    if (this._boundSectionHandlePointerMove) {
      window.removeEventListener("pointermove", this._boundSectionHandlePointerMove);
      this._boundSectionHandlePointerMove = null;
    }
    if (this._boundSectionHandlePointerUp) {
      window.removeEventListener("pointerup", this._boundSectionHandlePointerUp);
      window.removeEventListener("pointercancel", this._boundSectionHandlePointerUp);
      this._boundSectionHandlePointerUp = null;
    }

    const meshes = this.sectionDimensionHandles?.meshes || {};
    Object.values(meshes).forEach((mesh) => {
      if (!mesh) return;
      mesh.parent?.remove?.(mesh);
      mesh.material?.map?.dispose?.();
      mesh.material?.dispose?.();
    });

    this.sectionDimensionHandles = { meshes: {}, drag: null, raycaster: null, mouse: null };
  }

  _setSectionDimensionHandleVisibility(visible) {
    const meshes = this.sectionDimensionHandles?.meshes || {};
    Object.values(meshes).forEach((mesh) => {
      if (!mesh) return;
      mesh.visible = !!visible;
    });
  }

  _getSectionDimensionProfile() {
    if (!this.poolGroup) return null;

    const params = this.poolParams || {};
    const length = Math.max(0.1, Number(params.length) || 0.1);
    const clampedShallow = Math.max(0.5, Number(params.shallow) || 1.2);
    const clampedDeep = Math.max(clampedShallow, Number(params.deep) || clampedShallow);
    const floorMeta = this.poolGroup?.userData?.floorMeta || {};
    const axisStartX = Number.isFinite(floorMeta.axisStartWallX) ? Number(floorMeta.axisStartWallX) : -(length * 0.5);
    const axisEndX = Number.isFinite(floorMeta.axisEndX) ? Number(floorMeta.axisEndX) : (length * 0.5);
    const stepFoot = Number(this.poolGroup?.userData?.stepFootprintLen) || 0;
    const rawOriginX = Number.isFinite(floorMeta.originX) ? Number(floorMeta.originX) : this.poolGroup?.userData?.originX;
    const originX = Number.isFinite(rawOriginX) ? Number(rawOriginX) : (axisStartX + stepFoot);
    const fullLen = Math.max(0.01, axisEndX - originX);

    let sFlat = Math.max(0, Number(params.shallowFlat) || 0);
    let dFlat = Math.max(0, Number(params.deepFlat) || 0);
    const maxFlats = Math.max(0, fullLen - 0.01);
    if (sFlat + dFlat > maxFlats) {
      const scale = maxFlats / Math.max(sFlat + dFlat, 0.0001);
      sFlat *= scale;
      dFlat *= scale;
    }

    const x0 = axisStartX;
    const x1 = originX + sFlat;
    const x2 = axisEndX - dFlat;
    const x3 = axisEndX;

    const bounds = new THREE.Box3().setFromObject(this.poolGroup);
    if (this.spa) bounds.expandByObject(this.spa);
    const center = bounds.getCenter(new THREE.Vector3());
    const sectionY = center.y;

    return {
      sectionY,
      x0,
      x1,
      x2,
      x3,
      originX,
      fullLen,
      maxFlats,
      shallow: clampedShallow,
      deep: clampedDeep
    };
  }

  _getSectionDimensionHandleTargets() {
    if (!this.sectionViewEnabled || !this.poolGroup) return null;
    const profile = this._getSectionDimensionProfile();
    if (!profile) return null;

    const { x0, x1, x2, x3, sectionY, shallow, deep } = profile;
    const zShallow = -shallow;
    const zDeep = -deep;
    const liftZ = 0.18;

    return {
      shallow: new THREE.Vector3(THREE.MathUtils.lerp(x0, x1, 0.5), sectionY, zShallow + liftZ),
      deep: new THREE.Vector3(THREE.MathUtils.lerp(x2, x3, 0.5), sectionY, zDeep + liftZ),
      shallowFlat: new THREE.Vector3(x1, sectionY, zShallow + liftZ),
      deepFlat: new THREE.Vector3(x2, sectionY, zDeep + liftZ)
    };
  }

  _screenToSectionPlanePoint(clientX, clientY, sectionY = 0) {
    if (!this.camera || !this.renderer) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -sectionY);
    const p = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, p) ? p : null;
  }

  _syncSectionDimensionSliderUI() {
    ["shallow", "deep", "shallowFlat", "deepFlat"].forEach((id) => {
      const slider = document.getElementById(id);
      const output = document.getElementById(`${id}-val`);
      const value = Number(this.poolParams?.[id]);
      if (!slider || !Number.isFinite(value)) return;
      slider.value = String(value);
      if (output) output.textContent = value.toFixed(2) + " m";
    });
  }

  _onSectionHandlePointerDown(event) {
    if (event.button !== 0) return;
    if (!this.sectionViewEnabled || !this.poolGroup || !this.sectionDimensionHandles?.meshes) return;

    const ndc = this._pointerToNDC(event);
    this.sectionDimensionHandles.mouse.set(ndc.x, ndc.y);
    this.sectionDimensionHandles.raycaster.setFromCamera(this.sectionDimensionHandles.mouse, this.camera);

    const meshes = Object.values(this.sectionDimensionHandles.meshes).filter((m) => m?.visible);
    const hits = this.sectionDimensionHandles.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return;

    const handle = hits[0].object;
    const key = handle?.userData?.handleKey;
    const profile = this._getSectionDimensionProfile();
    if (!key || !profile) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const point = this._screenToSectionPlanePoint(event.clientX, event.clientY, profile.sectionY);
    if (!point) return;

    const labelMap = {
      sectionShallow: "shallow depth",
      sectionDeep: "deep depth",
      sectionShallowFlat: "shallow flat",
      sectionDeepFlat: "deep flat"
    };
    this.captureUndoState(`Drag ${labelMap[key] || "section"} handle`);

    if (!this._live.baseParams) {
      this._live.baseParams = { ...(this.poolGroup?.userData?.poolParams || this.poolParams) };
    }

    this.sectionDimensionHandles.drag = {
      key,
      pointerId: event.pointerId,
      handle,
      sectionY: profile.sectionY
    };

    this._setDimensionHandleActive(handle, true);
    if (this.controls) this.controls.enabled = false;
    this._setLiveDragging(true);
  }

  _onSectionHandlePointerMove(event) {
    const drag = this.sectionDimensionHandles?.drag;
    if (!drag || event.pointerId !== drag.pointerId || !this.poolGroup) return;

    const point = this._screenToSectionPlanePoint(event.clientX, event.clientY, drag.sectionY);
    if (!point) return;

    const profile = this._getSectionDimensionProfile();
    if (!profile) return;

    const snap = (v, min = 0) => Math.round(Math.max(min, v) / 0.1) * 0.1;
    const maxDepth = 4.0;

    if (drag.key === "sectionShallow") {
      const nextShallow = THREE.MathUtils.clamp(snap(-point.z, 0.5), 0.5, maxDepth);
      this.poolParams.shallow = nextShallow;
      if ((Number(this.poolParams.deep) || nextShallow) < nextShallow) {
        this.poolParams.deep = nextShallow;
        this._markPoolParamDirty("deep");
      }
      this._markPoolParamDirty("shallow");
    } else if (drag.key === "sectionDeep") {
      const minDeep = Math.max(0.5, Number(this.poolParams.shallow) || 0.5);
      const nextDeep = THREE.MathUtils.clamp(snap(-point.z, minDeep), minDeep, maxDepth);
      this.poolParams.deep = nextDeep;
      this._markPoolParamDirty("deep");
    } else if (drag.key === "sectionShallowFlat") {
      const maxShallowFlat = Math.max(0, profile.maxFlats - (Number(this.poolParams.deepFlat) || 0));
      const nextShallowFlat = THREE.MathUtils.clamp(snap(point.x - profile.originX, 0), 0, maxShallowFlat);
      this.poolParams.shallowFlat = nextShallowFlat;
      this._markPoolParamDirty("shallowFlat");
    } else if (drag.key === "sectionDeepFlat") {
      const maxDeepFlat = Math.max(0, profile.maxFlats - (Number(this.poolParams.shallowFlat) || 0));
      const nextDeepFlat = THREE.MathUtils.clamp(snap(profile.x3 - point.x, 0), 0, maxDeepFlat);
      this.poolParams.deepFlat = nextDeepFlat;
      this._markPoolParamDirty("deepFlat");
    } else {
      return;
    }

    this._syncSectionDimensionSliderUI();
  }

  async _onSectionHandlePointerUp() {
    const drag = this.sectionDimensionHandles?.drag;
    if (!drag) return;
    this._setDimensionHandleActive(drag.handle, false);
    this.sectionDimensionHandles.drag = null;
    if (this.controls) this.controls.enabled = true;
    await this._setLiveDragging(false);
    await this._refreshSectionViewAfterGeometryEdit({ moveCamera: false, fullReset: true });
  }

  _updateSectionDimensionHandles() {
    if (!this.sectionDimensionHandles?.meshes || !this.camera || !this.renderer) return;

    const allow =
      !!this.sectionViewEnabled &&
      !!this.poolGroup &&
      this.poolParams?.shape !== "freeform" &&
      !this.dimensionHandles?.drag &&
      !this.spaDimensionHandles?.drag;

    if (!allow) {
      this._setSectionDimensionHandleVisibility(false);
      return;
    }

    const targets = this._getSectionDimensionHandleTargets();
    if (!targets) {
      this._setSectionDimensionHandleVisibility(false);
      return;
    }

    const margin = 14;
    Object.entries(this.sectionDimensionHandles.meshes).forEach(([key, mesh]) => {
      const point = targets[key];
      if (!mesh || !point) {
        if (mesh) mesh.visible = false;
        return;
      }

      mesh.position.copy(point);
      this._orientDimensionHandleToCamera(mesh, point);
      const screen = this._projectWorldToScreen(point);
      if (!screen) {
        mesh.visible = false;
        return;
      }

      mesh.visible =
        screen.x >= screen.rect.left + margin &&
        screen.x <= screen.rect.right - margin &&
        screen.y >= screen.rect.top + margin &&
        screen.y <= screen.rect.bottom - margin;
    });
  }

// -----------------------------
  // Caustics controls (called by UI)
  // -----------------------------
  setCausticsEnabled(enabled) {
    this.caustics?.setEnabled?.(enabled);
    // Re-attach (in case materials were rebuilt while disabled)
    if (enabled) this.caustics?.attachToGroup?.(this.poolGroup);
  }


  _forEachSectionMaterial(root, fn) {
    if (!root?.traverse) return;
    root.traverse((obj) => {
      if (!obj?.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => mat && fn(mat, obj));
    });
  }


  _ensureSectionUnderfloorClipMaterial(material) {
    if (!material) return;
    material.userData = material.userData || {};
    if (material.userData.__sectionUnderfloorClipPatched) return;

    material.userData.__sectionUnderfloorClipPatched = true;
    material.userData.__sectionUnderfloorClipUniforms = {
      sectionUnderfloorClipEnabled: { value: 0 },
      sectionUnderfloorCutY: { value: 0 },
      sectionUnderfloorHalfWidth: { value: 0.5 },
      sectionUnderfloorMinX: { value: 0 },
      sectionUnderfloorMaxX: { value: 0 },
      sectionUnderfloorX1: { value: 0 },
      sectionUnderfloorX2: { value: 0 },
      sectionUnderfloorTopZ0: { value: 0 },
      sectionUnderfloorTopZ1: { value: 0 },
      sectionUnderfloorTopZ2: { value: 0 },
      sectionUnderfloorBottomZ: { value: -10 }
    };

    const previousOnBeforeCompile = material.onBeforeCompile;
    material.onBeforeCompile = (shader) => {
      if (typeof previousOnBeforeCompile === 'function') previousOnBeforeCompile(shader);

      Object.assign(shader.uniforms, material.userData.__sectionUnderfloorClipUniforms);

      if (!shader.vertexShader.includes('vSectionUnderfloorWorldPos')) {
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            '#include <common>\nvarying vec3 vSectionUnderfloorWorldPos;'
          )
          .replace(
            '#include <worldpos_vertex>',
            '#include <worldpos_vertex>\n  vSectionUnderfloorWorldPos = worldPosition.xyz;'
          );
      }

      if (!shader.fragmentShader.includes('sectionUnderfloorClipEnabled')) {
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            '#include <common>\nvarying vec3 vSectionUnderfloorWorldPos;\nuniform int sectionUnderfloorClipEnabled;\nuniform float sectionUnderfloorCutY;\nuniform float sectionUnderfloorHalfWidth;\nuniform float sectionUnderfloorMinX;\nuniform float sectionUnderfloorMaxX;\nuniform float sectionUnderfloorX1;\nuniform float sectionUnderfloorX2;\nuniform float sectionUnderfloorTopZ0;\nuniform float sectionUnderfloorTopZ1;\nuniform float sectionUnderfloorTopZ2;\nuniform float sectionUnderfloorBottomZ;'
          )
          .replace(
            '#include <clipping_planes_fragment>',
            `#include <clipping_planes_fragment>
  if (sectionUnderfloorClipEnabled == 1) {
    float clipDy = abs(vSectionUnderfloorWorldPos.y - sectionUnderfloorCutY);
    if (clipDy <= sectionUnderfloorHalfWidth &&
        vSectionUnderfloorWorldPos.x >= sectionUnderfloorMinX &&
        vSectionUnderfloorWorldPos.x <= sectionUnderfloorMaxX &&
        vSectionUnderfloorWorldPos.z >= sectionUnderfloorBottomZ) {
      float sectionTopZ = sectionUnderfloorTopZ0;
      if (vSectionUnderfloorWorldPos.x <= sectionUnderfloorX1) {
        sectionTopZ = sectionUnderfloorTopZ0;
      } else if (vSectionUnderfloorWorldPos.x >= sectionUnderfloorX2) {
        sectionTopZ = sectionUnderfloorTopZ2;
      } else {
        float t = (vSectionUnderfloorWorldPos.x - sectionUnderfloorX1) / max(sectionUnderfloorX2 - sectionUnderfloorX1, 1e-5);
        sectionTopZ = mix(sectionUnderfloorTopZ1, sectionUnderfloorTopZ2, clamp(t, 0.0, 1.0));
      }
      if (vSectionUnderfloorWorldPos.z <= sectionTopZ) discard;
    }
  }`
          );
      }
    };

    const previousCacheKey = material.customProgramCacheKey?.bind(material);
    material.customProgramCacheKey = () => {
      const prev = previousCacheKey ? previousCacheKey() : '';
      return `${prev}|section-underfloor-clip-v1`;
    };

    material.needsUpdate = true;
  }

  _setSectionUnderfloorClip(root, config) {
    if (!root) return;
    this._forEachSectionMaterial(root, (mat, obj) => {
      const isSectionShell = !!(
        obj.userData?.isWall ||
        obj.userData?.isFloor ||
        obj.userData?.isStep
      );
      if (!isSectionShell) return;
      this._ensureSectionUnderfloorClipMaterial(mat);
      const uniforms = mat.userData?.__sectionUnderfloorClipUniforms;
      if (!uniforms) return;
      if (config) {
        uniforms.sectionUnderfloorClipEnabled.value = 1;
        uniforms.sectionUnderfloorCutY.value = config.cutY ?? 0;
        uniforms.sectionUnderfloorHalfWidth.value = config.halfWidth ?? 0.5;
        uniforms.sectionUnderfloorMinX.value = config.minX ?? 0;
        uniforms.sectionUnderfloorMaxX.value = config.maxX ?? 0;
        uniforms.sectionUnderfloorX1.value = config.x1 ?? 0;
        uniforms.sectionUnderfloorX2.value = config.x2 ?? 0;
        uniforms.sectionUnderfloorTopZ0.value = config.topZ0 ?? 0;
        uniforms.sectionUnderfloorTopZ1.value = config.topZ1 ?? 0;
        uniforms.sectionUnderfloorTopZ2.value = config.topZ2 ?? 0;
        uniforms.sectionUnderfloorBottomZ.value = config.bottomZ ?? -10;
      } else {
        uniforms.sectionUnderfloorClipEnabled.value = 0;
      }
      mat.needsUpdate = true;
    });
  }

  _setSectionShellClip(root, plane) {
    if (!root) return;
    this._forEachSectionMaterial(root, (mat, obj) => {
      const isSectionShell = !!(
        obj.userData?.isWall ||
        obj.userData?.isCoping ||
        obj.userData?.isSpaWall ||
        obj.userData?.isFloor ||
        obj.userData?.isStep ||
        obj.userData?.isSpaFloor ||
        obj.userData?.isSpaSeat ||
        obj.userData?.isSpaSupport
      );
      if (!isSectionShell) return;

      if (plane) {
        if (!mat.userData.__sectionPrevClipping) {
          mat.userData.__sectionPrevClipping = mat.clippingPlanes ? [...mat.clippingPlanes] : [];
        }
        const prev = mat.userData.__sectionPrevClipping || [];
        mat.clippingPlanes = [...prev, plane];
        mat.clipShadows = true;
      } else if (mat.userData.__sectionPrevClipping) {
        mat.clippingPlanes = [...mat.userData.__sectionPrevClipping];
        delete mat.userData.__sectionPrevClipping;
      }
    });
  }

  _getSectionVoidClipRoots() {
    const roots = [
      this.poolGroup,
      this.spa,
      this.ground,
      this.ground?.userData?.poolPavingMesh,
      this.poolGroup?.userData?.waterMesh,
      this.spa?.userData?.waterMesh,
      this.ground?.userData?.spaChannelGroup,
      this.ground?.userData?.spaChannelWaterGroup
    ].filter(Boolean);

    // Channel meshes are sometimes rebuilt/reattached outside the ground userData
    // reference. Include any live channel meshes/groups from the scene as a fallback
    // so floor, wall, coping and water are all cut by the section void box.
    this.scene?.traverse?.((obj) => {
      if (!obj) return;
      const n = String(obj.name || '').toLowerCase();
      const ud = obj.userData || {};
      const isSectionCuttable = !!(
        ud.isWall || ud.isCoping || ud.isFloor || ud.isStep || ud.isPoolPaving ||
        ud.isSpaWall || ud.isSpaFloor || ud.isSpaSeat || ud.isSpaSupport ||
        ud.isSpaChannel || ud.isSpaChannelWater || ud.isSpaChannelFloor ||
        ud.isSpaChannelWall || ud.isSpaChannelCoping ||
        n === 'spachannelgroup' || n === 'spachannelwatergroup' ||
        n.includes('coping') || n.includes('channel')
      );
      if (isSectionCuttable) roots.push(obj);
    });

    return Array.from(new Set(roots));
  }

  _patchSectionVoidBoxMaterial(material) {
    if (!material || material.userData?.__sectionVoidBoxPatched) return;
    material.userData = material.userData || {};
    material.userData.__sectionVoidBoxPatched = true;
    material.userData.__sectionVoidBoxUniforms = {
      sectionVoidBoxClipEnabled: { value: 0 },
      sectionVoidBoxMin: { value: new THREE.Vector3() },
      sectionVoidBoxMax: { value: new THREE.Vector3() }
    };

    const prevOnBeforeCompile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      if (typeof prevOnBeforeCompile === 'function') prevOnBeforeCompile.call(material, shader, renderer);
      Object.assign(shader.uniforms, material.userData.__sectionVoidBoxUniforms);

      if (!shader.vertexShader.includes('vSectionVoidBoxWorldPos')) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vSectionVoidBoxWorldPos;'
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvSectionVoidBoxWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        );
      }

      if (!shader.fragmentShader.includes('sectionVoidBoxClipEnabled')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vSectionVoidBoxWorldPos;\nuniform int sectionVoidBoxClipEnabled;\nuniform vec3 sectionVoidBoxMin;\nuniform vec3 sectionVoidBoxMax;'
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
  if (sectionVoidBoxClipEnabled == 1 &&
      vSectionVoidBoxWorldPos.x >= sectionVoidBoxMin.x && vSectionVoidBoxWorldPos.x <= sectionVoidBoxMax.x &&
      vSectionVoidBoxWorldPos.y >= sectionVoidBoxMin.y && vSectionVoidBoxWorldPos.y <= sectionVoidBoxMax.y &&
      vSectionVoidBoxWorldPos.z >= sectionVoidBoxMin.z && vSectionVoidBoxWorldPos.z <= sectionVoidBoxMax.z) {
    discard;
  }`
        );
      }
    };

    const prevKey = material.customProgramCacheKey?.bind(material);
    material.customProgramCacheKey = () => {
      const base = prevKey ? prevKey() : '';
      return `${base}|section-void-box-clip-v1`;
    };

    material.needsUpdate = true;
  }

  _setSectionVoidClip(plane = null, boxBounds = null) {
    const roots = this._getSectionVoidClipRoots();
    roots.forEach((root) => {
      this._forEachSectionMaterial(root, (mat) => {
        if (!mat) return;
        mat.userData = mat.userData || {};
        this._patchSectionVoidBoxMaterial(mat);

        const uniforms = mat.userData.__sectionVoidBoxUniforms;
        if (uniforms) {
          if (boxBounds) {
            uniforms.sectionVoidBoxClipEnabled.value = 1;
            uniforms.sectionVoidBoxMin.value.set(boxBounds.minX, boxBounds.minY, boxBounds.minZ);
            uniforms.sectionVoidBoxMax.value.set(boxBounds.maxX, boxBounds.maxY, boxBounds.maxZ);
          } else {
            uniforms.sectionVoidBoxClipEnabled.value = 0;
          }
        }

        // Important: section mode must NOT take ownership of material.clippingPlanes.
        // The spa yellow/blue throat voids use clippingPlanes + clipIntersection to
        // create the channel and trim the coping/wall correctly. Adding the section
        // plane into that same array changes the boolean logic and breaks the spa
        // voids in section view. The section cut is therefore handled only by the
        // shader discard volume above, leaving all existing spa void material state
        // untouched.
        delete mat.userData.__sectionVoidPlane;
        delete mat.userData.__sectionVoidPrevClipping;
        delete mat.userData.__sectionVoidPrevClipShadows;

        mat.needsUpdate = true;
      });
    });
  }

  _getSectionFaceOffset() {
    // Keep the visible void-box face and all generated section caps on one
    // shared Y coordinate. This replaces the previous separate cap offsets
    // (0.003, 0.004, 0.008, etc.) that could make caps appear slightly
    // inside or in front of the actual section cut.
    return 0.02;
  }

  _getSectionFaceY(sectionCutY) {
    const cutY = Number.isFinite(sectionCutY) ? sectionCutY : 0;
    return cutY + this._getSectionFaceOffset();
  }

  _getSectionVoidBoxBounds(sectionCutY) {
    const contentBounds = new THREE.Box3();
    const contentRoots = [
      this.poolGroup,
      this.spa,
      this.ground?.userData?.spaChannelGroup,
      this.ground?.userData?.spaChannelWaterGroup
    ].filter(Boolean);

    this.scene?.traverse?.((obj) => {
      if (!obj) return;
      const n = String(obj.name || '').toLowerCase();
      const ud = obj.userData || {};
      const isSectionBoundsObject = !!(
        ud.isWall || ud.isCoping || ud.isFloor || ud.isStep || ud.isPoolPaving ||
        ud.isSpaWall || ud.isSpaFloor || ud.isSpaSeat || ud.isSpaSupport ||
        ud.isSpaChannel || ud.isSpaChannelWater || ud.isSpaChannelFloor ||
        ud.isSpaChannelWall || ud.isSpaChannelCoping ||
        n === 'spachannelgroup' || n === 'spachannelwatergroup' ||
        n.includes('coping') || n.includes('channel')
      );
      if (isSectionBoundsObject) contentRoots.push(obj);
    });

    Array.from(new Set(contentRoots)).forEach((root) => contentBounds.expandByObject(root));
    if (contentBounds.isEmpty()) return null;

    let groundBounds = null;
    if (this.ground) {
      const gb = new THREE.Box3().setFromObject(this.ground);
      if (!gb.isEmpty()) groundBounds = gb;
    }

    const minY = contentBounds.min.y;
    const maxY = this._getSectionFaceY(sectionCutY);
    const widthY = maxY - minY;
    if (!Number.isFinite(widthY) || widthY <= 1e-4) return null;

    const xPad = Math.max(1.0, contentBounds.getSize(new THREE.Vector3()).x * 0.08);
    const yPad = 0.08;
    // Keep the active section void tall/deep enough to catch raised coping,
    // channel coping and foreground wall pieces after edits/rebuilds.
    const topPad = 2.0;
    const bottomPad = 2.0;
    const sceneBottomZ = groundBounds ? Math.min(contentBounds.min.z, groundBounds.min.z) : contentBounds.min.z;
    const sceneTopZ = groundBounds ? Math.max(contentBounds.max.z, groundBounds.max.z) : contentBounds.max.z;

    return {
      minX: contentBounds.min.x - xPad,
      maxX: contentBounds.max.x + xPad,
      minY: minY - yPad,
      maxY,
      minZ: sceneBottomZ - bottomPad,
      maxZ: sceneTopZ + topPad
    };
  }

  _updateSectionVoidBox(sectionCutY) {
    this._removeSectionVoidBox();
    if (!this.scene) return;

    const bounds = this._getSectionVoidBoxBounds(sectionCutY);
    if (!bounds) return;

    const size = new THREE.Vector3(
      Math.max(0.05, bounds.maxX - bounds.minX),
      Math.max(0.05, bounds.maxY - bounds.minY),
      Math.max(0.05, bounds.maxZ - bounds.minZ)
    );
    const center = new THREE.Vector3(
      (bounds.minX + bounds.maxX) * 0.5,
      (bounds.minY + bounds.maxY) * 0.5,
      (bounds.minZ + bounds.maxZ) * 0.5
    );

    const group = new THREE.Group();
    group.name = 'SectionVoidBox';
    group.renderOrder = 999;

    const fill = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshBasicMaterial({
        color: 0xff00ff,
        transparent: true,
        opacity: 0.12,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    fill.position.copy(center);
    fill.renderOrder = 999;
    fill.visible = false; // keep section void active but hide the debug fill box
    group.add(fill);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
      new THREE.LineBasicMaterial({
        color: 0xff00ff,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
        depthWrite: false
      })
    );
    edges.position.copy(center);
    edges.renderOrder = 1000;
    edges.visible = false; // keep section void active but hide the debug outline box
    group.add(edges);

    group.userData.sectionCutY = sectionCutY;
    this.scene.add(group);
    this.sectionViewVoidBox = group;
  }

  _removeSectionVoidBox() {
    if (!this.sectionViewVoidBox) return;
    this.sectionViewVoidBox.traverse?.((obj) => {
      if (obj.geometry?.dispose) obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
      else mat?.dispose?.();
    });
    this.sectionViewVoidBox.parent?.remove?.(this.sectionViewVoidBox);
    this.sectionViewVoidBox = null;
  }

  _refreshSpaVoidsForSection() {
    try { updatePoolWaterVoid(this.poolGroup, this.spa); } catch (_) {}
    try { updateGroundVoid(this.ground || this.scene?.userData?.ground, this.poolGroup, this.spa); } catch (_) {}
    try { this.spa?.userData?.poolGroup && updatePoolWaterVoid(this.spa.userData.poolGroup, this.spa); } catch (_) {}
  }

  _enableSectionVoidClip(sectionCutY) {
    if (!this.renderer) return null;
    if (this.sectionViewRendererLocalClippingPrev === null) {
      this.sectionViewRendererLocalClippingPrev = !!this.renderer.localClippingEnabled;
    }
    this.renderer.localClippingEnabled = true;
    this.sectionViewClipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -sectionCutY);
    const sectionVoidBounds = this._getSectionVoidBoxBounds(sectionCutY);
    this._setSectionVoidClip(this.sectionViewClipPlane, sectionVoidBounds);
    this._updateSectionVoidBox(sectionCutY);
    return this.sectionViewClipPlane;
  }

  _disableSectionVoidClip() {
    this._setSectionVoidClip(null);
    this._removeSectionVoidBox();
    if (this.renderer && this.sectionViewRendererLocalClippingPrev !== null) {
      this.renderer.localClippingEnabled = this.sectionViewRendererLocalClippingPrev;
    }
    this.sectionViewRendererLocalClippingPrev = null;
    this.sectionViewClipPlane = null;
  }

  _setSectionHidden(root, hidden) {
    if (!root?.traverse) return;
    root.traverse((obj) => {
      if (!obj?.isMesh) return;
      if (hidden) {
        if (obj.userData.__sectionPrevVisible === undefined) obj.userData.__sectionPrevVisible = obj.visible;
        obj.visible = false;
      } else if (obj.userData.__sectionPrevVisible !== undefined) {
        obj.visible = obj.userData.__sectionPrevVisible;
        delete obj.userData.__sectionPrevVisible;
      }
    });
  }


  _setSectionWaterClip(root, cutY = null) {
    if (!root?.traverse) return;
    root.traverse((obj) => {
      if (!obj?.isMesh) return;
      if (typeof obj.userData?.setSectionClipY === 'function') {
        obj.userData.setSectionClipY(cutY);
      } else {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat) => {
          const uniforms = mat?.uniforms;
          if (!uniforms?.sectionClipEnabled || !uniforms?.sectionClipY) return;
          if (typeof cutY === 'number' && Number.isFinite(cutY)) {
            uniforms.sectionClipEnabled.value = 1.0;
            uniforms.sectionClipY.value = cutY;
          } else {
            uniforms.sectionClipEnabled.value = 0.0;
          }
          mat.needsUpdate = true;
        });
      }
    });
  }

  _setSectionFrontShellHidden(centerY, hidden) {
    const roots = this._getSectionVoidClipRoots ? this._getSectionVoidClipRoots() : [this.poolGroup, this.spa, this.ground?.userData?.spaChannelGroup].filter(Boolean);
    const EPS = 1e-4;
    const poolBounds = new THREE.Box3();
    if (this.poolGroup) poolBounds.expandByObject(this.poolGroup);
    const spaBounds = new THREE.Box3();
    if (this.spa) spaBounds.expandByObject(this.spa);
    const snapSide = String(this.spa?.userData?.snapSide || '').toLowerCase();
    const spaCutsPoolWall = !!(
      this.spa?.userData?.isHalfwayInWall ||
      this.spa?.userData?.channelEnabled ||
      String(this.spa?.userData?.snapVariant || '').toLowerCase() !== 'inner-flush'
    );

    roots.forEach((root) => {
      root.traverse((obj) => {
        if (!obj?.isMesh) return;
        const isSectionShell = !!(
          obj.userData?.isWall ||
          obj.userData?.isCoping ||
          obj.userData?.isSpaWall ||
          obj.userData?.isSpaChannel
        );
        if (!isSectionShell) return;

        obj.updateMatrixWorld?.(true);
        const box = new THREE.Box3().setFromObject(obj);
        if (box.isEmpty()) return;
        const size = box.getSize(new THREE.Vector3());

        const restore = () => {
          if (!hidden && obj.userData.__sectionPrevVisible !== undefined) {
            obj.visible = obj.userData.__sectionPrevVisible;
            delete obj.userData.__sectionPrevVisible;
          }
        };
        const hideNow = () => {
          if (hidden) {
            if (obj.userData.__sectionPrevVisible === undefined) obj.userData.__sectionPrevVisible = obj.visible;
            obj.visible = false;
          } else if (obj.userData.__sectionPrevVisible !== undefined) {
            obj.visible = obj.userData.__sectionPrevVisible;
            delete obj.userData.__sectionPrevVisible;
          }
        };

        const thinX = size.x <= Math.max(0.35, size.y * 0.4);
        const thinY = size.y <= Math.max(0.35, size.x * 0.4);
        const intersectsFrontHalf = box.min.y < (centerY - EPS);
        const overlapsSpaY = !spaBounds.isEmpty() && !(box.max.y < (spaBounds.min.y - EPS) || box.min.y > (spaBounds.max.y + EPS));
        const overlapsSpaX = !spaBounds.isEmpty() && !(box.max.x < (spaBounds.min.x - EPS) || box.min.x > (spaBounds.max.x + EPS));

        // Do not hide whole coping meshes here. Original coping may be a single
        // long ring/segment that crosses both the kept and removed halves. The
        // active section void shader now trims only the portion inside the void
        // box; hiding the whole mesh would delete the visible rear/top coping.

        // When the spa is pushed into or beyond the pool wall, remove the
        // pool shell that still sits in front of the section line on that spa
        // side. This hides both the thin end wall itself and any short return
        // pieces that continue past the cut. Leave spa/channel geometry alone
        // so their own section faces remain visible.
        if (root === this.poolGroup && intersectsFrontHalf && !spaBounds.isEmpty() && !poolBounds.isEmpty()) {
          const spaOverlapPad = 0.12;
          const overlapsSpaPlan = !(
            box.max.x < (spaBounds.min.x - spaOverlapPad) ||
            box.min.x > (spaBounds.max.x + spaOverlapPad) ||
            box.max.y < (spaBounds.min.y - spaOverlapPad) ||
            box.min.y > (spaBounds.max.y + spaOverlapPad)
          );

          if ((snapSide === 'right' || snapSide === 'left') && overlapsSpaY) {
            const onSpaSide = snapSide === 'right'
              ? box.max.x > (poolBounds.max.x - 0.3)
              : box.min.x < (poolBounds.min.x + 0.3);
            const shouldHide = onSpaSide && (
              thinX ||
              (spaCutsPoolWall && thinY && overlapsSpaPlan)
            );
            if (shouldHide) {
              hideNow();
              return;
            }
          }
          if ((snapSide === 'front' || snapSide === 'back') && overlapsSpaX) {
            const onSpaSide = snapSide === 'front'
              ? box.max.y > (poolBounds.max.y - 0.3)
              : box.min.y < (poolBounds.min.y + 0.3);
            const shouldHide = onSpaSide && (
              thinY ||
              (spaCutsPoolWall && thinX && overlapsSpaPlan)
            );
            if (shouldHide) {
              hideNow();
              return;
            }
          }
        }

        // Standard front-shell hide path.
        if (!thinY) {
          restore();
          return;
        }
        if (!intersectsFrontHalf) {
          restore();
          return;
        }
        hideNow();
      });
    });
  }

  _setSectionOverlay(bounds, enabled, cutY = null, wallThickness = 0.2) {
    if (!this.scene) return;
    if (this.sectionViewOverlay) {
      this.sectionViewOverlay.traverse?.((obj) => {
        if (obj?.geometry) obj.geometry.dispose?.();
        if (obj?.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m?.dispose?.());
        }
      });
      this.sectionViewOverlay.parent?.remove?.(this.sectionViewOverlay);
      this.sectionViewOverlay = null;
      this.sectionViewSignature = "";
    }
    if (!enabled || !bounds || bounds.isEmpty() || !this.poolGroup) return;

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const group = new THREE.Group();
    group.name = 'SectionOverlayGroup';

    let sectionFloorCenterY = center.y;
    let sectionFloorWidth = size.y;
    const floorMesh = this.poolGroup?.userData?.floorMesh || null;
    if (floorMesh?.isMesh) {
      floorMesh.updateMatrixWorld?.(true);
      const floorBounds = new THREE.Box3().setFromObject(floorMesh);
      if (!floorBounds.isEmpty()) {
        const floorCenter = floorBounds.getCenter(new THREE.Vector3());
        const floorSize = floorBounds.getSize(new THREE.Vector3());
        if (Number.isFinite(floorCenter.y)) sectionFloorCenterY = floorCenter.y;
        if (Number.isFinite(floorSize.y) && floorSize.y > 0.001) sectionFloorWidth = floorSize.y;
      }
    }

    const sectionY = Number.isFinite(cutY) ? cutY : (bounds.min.y + wallThickness + 0.002);
    const sectionFaceY = this._getSectionFaceY(sectionY);
    const capY = sectionFaceY + 0.001;
    const localCutY = sectionY - (this.poolGroup.position?.y || 0);
    const safeWallThickness = Math.max(0.05, this.poolGroup?.userData?.wallThickness || wallThickness || 0.2);
    const copingInset = 0.05;

    const makeBasicMat = (color, opacity = 0.95) => new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });

    

const makeConcreteHatchTexture = () => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Light concrete base inspired by the supplied reference image.
  ctx.fillStyle = '#eeeeee';
  ctx.fillRect(0, 0, size, size);

  // Deterministic pseudo-randomness keeps the texture stable across
  // section overlay rebuilds.
  let seed = 975318642;
  const rand = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const fillCircle = (x, y, r, color) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };

  const drawBlob = (cx, cy, r, aspect = 1) => {
    const pts = 5 + Math.floor(rand() * 6);
    ctx.beginPath();
    for (let i = 0; i < pts; i++) {
      const ang = (Math.PI * 2 * i) / pts;
      const rr = r * (0.45 + rand() * 0.8);
      const px = cx + Math.cos(ang) * rr * aspect;
      const py = cy + Math.sin(ang) * rr / Math.max(aspect, 0.001);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,' + (0.28 + rand() * 0.28) + ')';
    ctx.fill();
  };

  const drawChip = (cx, cy, length, width, angle) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-length * 0.5, -width * 0.35);
    ctx.lineTo(length * 0.30, -width * 0.5);
    ctx.lineTo(length * 0.5, -width * 0.05);
    ctx.lineTo(length * 0.15, width * 0.45);
    ctx.lineTo(-length * 0.45, width * 0.25);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,' + (0.25 + rand() * 0.28) + ')';
    ctx.fill();
    ctx.restore();
  };

  const drawArcCluster = (cx, cy, baseR, dotCount, angleStart, angleSweep) => {
    for (let i = 0; i < dotCount; i++) {
      const t = dotCount <= 1 ? 0 : i / (dotCount - 1);
      const ang = angleStart + angleSweep * t + (rand() - 0.5) * 0.10;
      const rr = baseR + (rand() - 0.5) * 2.5;
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr;
      const r = 0.25 + rand() * 0.55;
      fillCircle(x, y, r, 'rgba(0,0,0,' + (0.18 + rand() * 0.20) + ')');
    }
  };

  // Dense fine peppering.
  for (let i = 0; i < 2600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.12 + rand() * 0.48;
    fillCircle(x, y, r, 'rgba(0,0,0,' + (0.05 + rand() * 0.14) + ')');
  }

  // Small aggregate marks. Kept deliberately small so the caps do not get
  // large dirty-looking blotches when viewed in section.
  for (let i = 0; i < 140; i++) {
    drawBlob(
      rand() * size,
      rand() * size,
      0.55 + rand() * 1.9,
      0.65 + rand() * 1.35
    );
  }

  // Fine elongated chips/flecks.
  for (let i = 0; i < 120; i++) {
    drawChip(
      rand() * size,
      rand() * size,
      1.5 + rand() * 4.2,
      0.35 + rand() * 1.2,
      rand() * Math.PI * 2
    );
  }

  // Subtle dotted curved clusters from the reference image.
  for (let i = 0; i < 38; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const baseRot = rand() * Math.PI * 2;
    const arcs = 1 + Math.floor(rand() * 3);
    for (let a = 0; a < arcs; a++) {
      const start = baseRot + (Math.PI * 2 * a) / arcs + (rand() - 0.5) * 0.6;
      const sweep = 0.28 + rand() * 0.75;
      const dots = 5 + Math.floor(rand() * 10);
      drawArcCluster(cx, cy, 5 + rand() * 9, dots, start, sweep);
    }
  }

  // Only a few slightly stronger marks, still much smaller than before.
  for (let i = 0; i < 18; i++) {
    if (rand() < 0.55) {
      drawBlob(rand() * size, rand() * size, 1.8 + rand() * 2.4, 0.6 + rand() * 1.3);
    } else {
      drawChip(rand() * size, rand() * size, 4 + rand() * 5, 0.8 + rand() * 1.4, rand() * Math.PI * 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;

  // Higher repeat = smaller, finer concrete marks on the section caps.
  tex.repeat.set(0.75, 0.75);

  tex.needsUpdate = true;
  return tex;
};

const concreteHatchTex = makeConcreteHatchTexture();

    const makeConcreteCapMat = () => new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: concreteHatchTex || null,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });

    const poolOuterPts = Array.isArray(this.poolGroup?.userData?.outerPts)
      ? this.poolGroup.userData.outerPts
          .map((p) => (p?.isVector2 ? p.clone() : new THREE.Vector2(Number(p?.x) || 0, Number(p?.y) || 0)))
          .filter(Boolean)
      : [];

    const intersectPolygonAtY = (pts, y) => {
      const xs = [];
      if (!Array.isArray(pts) || pts.length < 2) return xs;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if (!a || !b) continue;
        const ay = a.y;
        const by = b.y;
        const crosses = ((ay <= y) && (by > y)) || ((by <= y) && (ay > y));
        if (!crosses) continue;
        const dy = by - ay;
        if (Math.abs(dy) < 1e-8) continue;
        const t = (y - ay) / dy;
        xs.push(a.x + (b.x - a.x) * t);
      }
      xs.sort((a, b) => a - b);
      const deduped = [];
      for (const x of xs) {
        if (!deduped.length || Math.abs(x - deduped[deduped.length - 1]) > 1e-5) deduped.push(x);
      }
      return deduped;
    };

    const polygonBounds = (() => {
      const bb = new THREE.Box2();
      if (poolOuterPts.length) {
        poolOuterPts.forEach((p) => bb.expandByPoint(p));
      } else {
        bb.min.set(bounds.min.x - (this.poolGroup.position?.x || 0), bounds.min.y - (this.poolGroup.position?.y || 0));
        bb.max.set(bounds.max.x - (this.poolGroup.position?.x || 0), bounds.max.y - (this.poolGroup.position?.y || 0));
      }
      return bb;
    })();

    const floorMetaForProfile = this.poolGroup?.userData?.floorMeta || {};
    const axisStartX = Number.isFinite(floorMetaForProfile.axisStartWallX) ? Number(floorMetaForProfile.axisStartWallX) : polygonBounds.min.x;
    const axisEndX = Number.isFinite(floorMetaForProfile.axisEndX) ? Number(floorMetaForProfile.axisEndX) : polygonBounds.max.x;
    const stepFoot = Number(this.poolGroup?.userData?.stepFootprintLen) || 0;
    const rawOriginX = Number.isFinite(floorMetaForProfile.originX) ? Number(floorMetaForProfile.originX) : this.poolGroup?.userData?.originX;
    const originX = Number.isFinite(rawOriginX) ? Number(rawOriginX) : (axisStartX + stepFoot);
    const fullLen = Math.max(0.01, axisEndX - originX);
    const clampedShallow = Math.max(0.5, this.poolParams.shallow || 1.2);
    const clampedDeep = Math.max(clampedShallow, this.poolParams.deep || clampedShallow);
    let sFlat = this.poolParams.shallowFlat || 0;
    let dFlat = this.poolParams.deepFlat || 0;
    const maxFlats = Math.max(0, fullLen - 0.01);
    if (sFlat + dFlat > maxFlats) {
      const scale = maxFlats / Math.max(sFlat + dFlat, 0.0001);
      sFlat *= scale;
      dFlat *= scale;
    }
    const slopeLen = Math.max(0.01, fullLen - sFlat - dFlat);
    const x1 = originX + sFlat;
    const x2 = axisEndX - dFlat;
    const depthAtX = (x) => {
      let dx = x - originX;
      if (dx < 0) dx = 0;
      if (dx <= sFlat) return -clampedShallow;
      if (dx >= fullLen - dFlat) return -clampedDeep;
      const t = (dx - sFlat) / slopeLen;
      return -(clampedShallow + t * (clampedDeep - clampedShallow));
    };

    const intervals = [];
    // Section caps must use the same lengthwise profile as the standard rectangle pool.
    // Curved/custom/L-shape footprints still use their visual footprint in 3D, but the
    // section view is a side elevation through the pool centreline. Using polygon
    // intersections here made the cap change shape whenever the cut line hit a curve,
    // notch, or freeform edge. Keep one rectangle-style band from the profiled floor
    // start to the profiled floor end so every pool type shares the rectangle cap logic.
    const rectangleCapStartX = Number.isFinite(axisStartX) ? axisStartX : polygonBounds.min.x;
    const rectangleCapEndX = Number.isFinite(axisEndX) ? axisEndX : polygonBounds.max.x;
    if (Number.isFinite(rectangleCapStartX) && Number.isFinite(rectangleCapEndX) && rectangleCapEndX - rectangleCapStartX > 1e-4) {
      intervals.push([rectangleCapStartX, rectangleCapEndX]);
    }

    const floorMatBase = makeConcreteCapMat();
    const wallCapMatBase = makeConcreteCapMat();
    const copingCapMatBase = makeBasicMat(0xe3ddd2, 0.98);
    const waterTintMatBase = new THREE.MeshBasicMaterial({
      color: 0x9cc6dc,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false
    });

    const buildExactFloorSectionProfile = (x0, x3) => {
      const mesh = this.poolGroup?.userData?.floorMesh;
      const geom = mesh?.geometry;
      const posAttr = geom?.attributes?.position;
      if (!mesh?.isMesh || !geom || !posAttr || posAttr.count < 3) return null;

      mesh.updateMatrixWorld?.(true);
      this.poolGroup.updateMatrixWorld?.(true);
      const toPoolLocal = new THREE.Matrix4()
        .copy(this.poolGroup.matrixWorld)
        .invert()
        .multiply(mesh.matrixWorld);

      const idx = geom.index;
      const epsY = 1e-5;
      const epsX = 1e-4;
      const p0 = new THREE.Vector3();
      const p1 = new THREE.Vector3();
      const p2 = new THREE.Vector3();
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const points = [];

      const pushIfOnCut = (p) => {
        if (Math.abs(p.y - localCutY) > epsY) return;
        if (p.x < x0 - 0.05 || p.x > x3 + 0.05) return;
        points.push({ x: p.x, z: p.z });
      };

      const edgeIntersect = (u, v) => {
        const dy = v.y - u.y;
        if (Math.abs(dy) < epsY) {
          pushIfOnCut(u);
          pushIfOnCut(v);
          return;
        }
        const t = (localCutY - u.y) / dy;
        if (t < -epsY || t > 1 + epsY) return;
        const clampedT = Math.min(1, Math.max(0, t));
        const x = u.x + (v.x - u.x) * clampedT;
        if (x < x0 - 0.05 || x > x3 + 0.05) return;
        const z = u.z + (v.z - u.z) * clampedT;
        points.push({ x, z });
      };

      const triCount = idx ? idx.count / 3 : posAttr.count / 3;
      for (let i = 0; i < triCount; i++) {
        const ia = idx ? idx.getX(i * 3 + 0) : i * 3 + 0;
        const ib = idx ? idx.getX(i * 3 + 1) : i * 3 + 1;
        const ic = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
        p0.fromBufferAttribute(posAttr, ia).applyMatrix4(toPoolLocal);
        p1.fromBufferAttribute(posAttr, ib).applyMatrix4(toPoolLocal);
        p2.fromBufferAttribute(posAttr, ic).applyMatrix4(toPoolLocal);
        a.copy(p0); b.copy(p1); edgeIntersect(a, b);
        a.copy(p1); b.copy(p2); edgeIntersect(a, b);
        a.copy(p2); b.copy(p0); edgeIntersect(a, b);
      }

      if (points.length < 2) return null;
      points.sort((m, n) => (m.x - n.x) || (m.z - n.z));

      const merged = [];
      for (const p of points) {
        const last = merged[merged.length - 1];
        if (!last || Math.abs(p.x - last.x) > epsX) {
          merged.push({ x: p.x, z: p.z, n: 1 });
        } else {
          // Use the highest cut surface at this x (closest to water plane).
          last.z = Math.max(last.z, p.z);
          last.n += 1;
        }
      }

      const profile = merged
        .filter((p) => p.x >= x0 - 0.01 && p.x <= x3 + 0.01)
        .map((p) => new THREE.Vector2(THREE.MathUtils.clamp(p.x, x0, x3), p.z));

      if (profile.length < 2) return null;
      if (profile[0].x > x0 + 0.01) profile.unshift(new THREE.Vector2(x0, profile[0].y));
      if (profile[profile.length - 1].x < x3 - 0.01) profile.push(new THREE.Vector2(x3, profile[profile.length - 1].y));
      return profile;
    };

    const addProjectedCapFromBounds = (box, matBase, renderOrder = 997, yOffset = 0.006) => {
      if (!box || box.isEmpty()) return;
      if (sectionY < box.min.y - 1e-4 || sectionY > box.max.y + 1e-4) return;
      if ((box.max.x - box.min.x) <= 1e-4 || (box.max.z - box.min.z) <= 1e-4) return;

      const shape = new THREE.Shape([
        new THREE.Vector2(box.min.x, box.max.z),
        new THREE.Vector2(box.max.x, box.max.z),
        new THREE.Vector2(box.max.x, box.min.z),
        new THREE.Vector2(box.min.x, box.min.z)
      ]);
      const cap = new THREE.Mesh(new THREE.ShapeGeometry(shape), matBase.clone());
      cap.rotation.x = Math.PI * 0.5;
      cap.position.set(0, capY, 0);
      cap.renderOrder = renderOrder;
      group.add(cap);
    };

    const addProjectedCapFromMesh = (mesh, matBase, renderOrder = 997, yOffset = 0.006) => {
      if (!mesh?.isMesh || mesh.visible === false) return null;
      mesh.updateMatrixWorld?.(true);
      const box = new THREE.Box3().setFromObject(mesh);
      if (box.isEmpty()) return null;
      addProjectedCapFromBounds(box, matBase, renderOrder, yOffset);
      return box;
    };

    const addSpaSectionCaps = () => {
      const spa = this.spa;
      if (!spa?.traverse) return;
      if ((spa.userData?.spaShape || 'square') === 'circular') return;

      let spaFloorBox = null;
      let spaSupportBox = null;
      const spaWallBoxes = [];
      const spaSeatBoxes = [];

      spa.traverse((obj) => {
        if (!obj?.isMesh) return;
        if (obj.userData?.isSpaFloor) {
          // Keep the floor bounds only. Do not add a separate projected floor
          // cap, because that overlay reads as a false centre band through the
          // spa section.
          if (obj.visible !== false) {
            obj.updateMatrixWorld?.(true);
            const box = new THREE.Box3().setFromObject(obj);
            if (!box.isEmpty()) spaFloorBox = box;
          }
          return;
        }
        if (obj.userData?.isSpaSeat) {
          if (obj.visible !== false) {
            obj.updateMatrixWorld?.(true);
            const box = new THREE.Box3().setFromObject(obj);
            if (!box.isEmpty()) spaSeatBoxes.push(box);
          }
          return;
        }
        if (obj.userData?.isSpaSupport) {
          if (obj.visible !== false) {
            obj.updateMatrixWorld?.(true);
            const box = new THREE.Box3().setFromObject(obj);
            if (!box.isEmpty()) spaSupportBox = box;
          }
          return;
        }
        if (obj.userData?.isSpaWall) {
          const wallBox = addProjectedCapFromMesh(obj, wallCapMatBase, 999, 0.008);
          if (wallBox) spaWallBoxes.push(wallBox);
        }
      });

      // Main spa cap: keep the existing top, align it to the spa floor top,
      // and stretch it 200 mm further downward. This makes the cap taller
      // instead of simply reading as shifted down.
      if (spaSupportBox && !spaSupportBox.isEmpty()) {
        const mainCapBox = spaSupportBox.clone();
        if (spaFloorBox && !spaFloorBox.isEmpty()) {
          mainCapBox.max.z = Math.max(mainCapBox.max.z, spaFloorBox.max.z);
        }
        mainCapBox.min.z -= 0.2;
        addProjectedCapFromBounds(mainCapBox, wallCapMatBase, 1000, 0.009);
      }

      // Restore seat caps, but clamp them to the spa floor top so they run
      // down to the floor and no further.
      if (spaFloorBox && !spaFloorBox.isEmpty() && spaSeatBoxes.length) {
        const floorTopZ = spaFloorBox.max.z;
        spaSeatBoxes.forEach((seatBox) => {
          if (!seatBox || seatBox.isEmpty()) return;
          if (sectionY < seatBox.min.y - 1e-4 || sectionY > seatBox.max.y + 1e-4) return;
          const trimmed = seatBox.clone();
          trimmed.min.z = Math.max(trimmed.min.z, floorTopZ);
          if ((trimmed.max.x - trimmed.min.x) <= 1e-4 || (trimmed.max.z - trimmed.min.z) <= 1e-4) return;
          addProjectedCapFromBounds(trimmed, wallCapMatBase, 1001, 0.010);
        });
      }


      // Do not fabricate a solid under-spa block here. The square spa model
      // only has walls, seats and a floor slab, so the section overlay should
      // cap the actual cut faces only. Filling the full cavity below the spa
      // floor makes the section read as a solid plinth that does not exist in
      // the geometry.
    };

    const addSpaChannelSectionCaps = () => {
      const channelGroup = this.ground?.userData?.spaChannelGroup;
      if (!channelGroup?.traverse) return;

      // Channel floor section-cap adjustments. Positive dimensions are metres.
      // Lift the previous 200 mm drop back up by 50 mm, so the net floor-cap
      // drop is now 150 mm. Pull only the pool-inner edge in by 200 mm while
      // keeping the outside edge fixed.
      const CHANNEL_FLOOR_CAP_DROP = 0.15;
      const CHANNEL_FLOOR_CAP_INNER_TRIM = 0.0;
      const CHANNEL_FLOOR_CAP_OUTER_EXTEND = 0.2;

      const getAdjustedChannelFloorCapBox = (box) => {
        if (!box || box.isEmpty()) return null;
        const adjusted = box.clone();

        adjusted.min.z -= CHANNEL_FLOOR_CAP_DROP;
        adjusted.max.z -= CHANNEL_FLOOR_CAP_DROP;

        const snapSide = String(this.spa?.userData?.snapSide || '').toLowerCase();
        const widthX = adjusted.max.x - adjusted.min.x;
        const trim = Math.min(CHANNEL_FLOOR_CAP_INNER_TRIM, Math.max(0, widthX - 0.02));

        if (snapSide === 'right') {
          // Right-wall spa: keep the pool-inner/left edge as-is and extend only
          // the outside/right edge in the red-arrow direction.
          adjusted.min.x += trim;
          adjusted.max.x += CHANNEL_FLOOR_CAP_OUTER_EXTEND;
        } else if (snapSide === 'left') {
          // Left-wall spa: mirror the same behaviour. Keep the pool-inner/right
          // edge as-is and extend only the outside/left edge.
          adjusted.max.x -= trim;
          adjusted.min.x -= CHANNEL_FLOOR_CAP_OUTER_EXTEND;
        } else {
          // Fallback only for older snap metadata.
          adjusted.min.x += trim * 0.5 - CHANNEL_FLOOR_CAP_OUTER_EXTEND * 0.5;
          adjusted.max.x -= trim * 0.5 + CHANNEL_FLOOR_CAP_OUTER_EXTEND * 0.5;
        }

        return adjusted;
      };

      const addChannelFloorUndersideCap = (box) => {
        const adjusted = getAdjustedChannelFloorCapBox(box);
        if (!adjusted || adjusted.isEmpty()) return;
        if (sectionY < adjusted.min.y - 1e-4 || sectionY > adjusted.max.y + 1e-4) return;
        if ((adjusted.max.x - adjusted.min.x) <= 1e-4) return;
        const bottomZ = adjusted.min.z;
        const topZ = bottomZ + safeWallThickness;
        const shape = new THREE.Shape([
          new THREE.Vector2(adjusted.min.x, topZ),
          new THREE.Vector2(adjusted.max.x, topZ),
          new THREE.Vector2(adjusted.max.x, bottomZ),
          new THREE.Vector2(adjusted.min.x, bottomZ)
        ]);
        const cap = new THREE.Mesh(new THREE.ShapeGeometry(shape), floorMatBase.clone());
        cap.rotation.x = Math.PI * 0.5;
        cap.position.set(0, capY, 0);
        cap.renderOrder = 995;
        group.add(cap);
      };

      channelGroup.traverse((obj) => {
        if (!obj?.isMesh || obj.visible === false || !obj.userData?.isSpaChannel) return;
        const part = String(obj.userData?.spaChannelPart || '').toLowerCase();
        if (part !== 'floor' && part !== 'wall') return;
        const matBase = part === 'floor' ? floorMatBase : wallCapMatBase;
        const renderOrder = part === 'floor' ? 996 : 997;
        const yOffset = part === 'floor' ? 0.006 : 0.007;

        if (part === 'floor') {
          obj.updateMatrixWorld?.(true);
          const floorBox = new THREE.Box3().setFromObject(obj);
          const adjustedFloorBox = getAdjustedChannelFloorCapBox(floorBox);
          if (adjustedFloorBox && !adjustedFloorBox.isEmpty()) {
            addProjectedCapFromBounds(adjustedFloorBox, matBase, renderOrder, yOffset);
          }
          addChannelFloorUndersideCap(floorBox);
          return;
        }

        addProjectedCapFromMesh(obj, matBase, renderOrder, yOffset);
      });
    };

    const addStepSectionCaps = () => {
      if (!this.poolGroup?.traverse) return;

      const stepBoxes = [];
      this.poolGroup.traverse((obj) => {
        if (!obj?.isMesh || obj.visible === false || !obj.userData?.isStep) return;
        // Steps are separate solid meshes. The section overlay needs a face cap
        // where the void cuts through each tread/riser volume.
        const box = addProjectedCapFromMesh(obj, wallCapMatBase, 999, 0.008);
        if (box && !box.isEmpty()) stepBoxes.push(box);
      });

      // Also extend the stair cap down to the pool floor so the section reads
      // as a continuous stepped mass rather than stopping at each tread block.
      // Use the runtime pool depth profile (not the locally raised floor under
      // the step footprint) so the cap reaches the actual pool floor level.
      stepBoxes.forEach((box) => {
        if (!box || box.isEmpty()) return;
        const centerX = (box.min.x + box.max.x) * 0.5;
        const floorTopZ = depthAtX(centerX);
        if (!Number.isFinite(floorTopZ)) return;
        if (floorTopZ >= box.min.z - 1e-4) return;
        const extended = box.clone();
        extended.min.z = floorTopZ;
        addProjectedCapFromBounds(extended, wallCapMatBase, 998, 0.0075);
      });
    };

    const shouldHideSpaSidePoolWallCap = (() => {
      const spa = this.spa;
      if (!spa) return { left: false, right: false };
      const snapSide = String(spa.userData?.snapSide || '').toLowerCase();
      const hideOnSpaSide = !!(
        spa.userData?.isHalfwayInWall ||
        spa.userData?.channelEnabled ||
        String(spa.userData?.snapVariant || '').toLowerCase() !== 'inner-flush'
      );
      if (!hideOnSpaSide) return { left: false, right: false };
      const spaBounds = new THREE.Box3().setFromObject(spa);
      const intersectsSection = !spaBounds.isEmpty() && sectionY >= (spaBounds.min.y - 1e-4) && sectionY <= (spaBounds.max.y + 1e-4);
      if (!intersectsSection) return { left: false, right: false };
      return {
        left: snapSide === 'left',
        right: snapSide === 'right'
      };
    })();

    const addSectionBand = (x0, x3, includeWaterTint = true) => {
      const leftDepth = depthAtX(x0);
      const rightDepth = depthAtX(x3);
      const slabExtend = 0.0;
      const x0Ext = x0 - slabExtend;
      const x3Ext = x3 + slabExtend;
      // Match the standard rectangle pool cap path for every pool shape.
      // Do not sample the clipped/custom floor mesh here: sparse/curved/freeform
      // floor meshes can return irregular section points and make the concrete
      // cap drift away from the intended 1 m flat + slope + 1 m flat profile.
      const sampleCount = Math.max(12, Math.min(64, Math.ceil((x3Ext - x0Ext) / 0.2)));
      const topProfile = [];
      for (let i = 0; i <= sampleCount; i++) {
        const t = i / sampleCount;
        const x = THREE.MathUtils.lerp(x0Ext, x3Ext, t);
        topProfile.push(new THREE.Vector2(x, depthAtX(x)));
      }

      if (includeWaterTint) {
        const waterTintShape = new THREE.Shape([
          new THREE.Vector2(x0Ext, 0),
          new THREE.Vector2(x3Ext, 0),
          ...topProfile.slice().reverse()
        ]);
        const waterTint = new THREE.Mesh(new THREE.ShapeGeometry(waterTintShape), waterTintMatBase.clone());
        waterTint.rotation.x = Math.PI * 0.5;
        waterTint.position.set(0, sectionFaceY + 0.0005, 0);
        waterTint.renderOrder = 994;
        group.add(waterTint);
      }

      const exactLeftDepth = topProfile[0]?.y;
      const exactRightDepth = topProfile[topProfile.length - 1]?.y;
      const resolvedLeftDepth = Number.isFinite(exactLeftDepth) ? exactLeftDepth : leftDepth;
      const resolvedRightDepth = Number.isFinite(exactRightDepth) ? exactRightDepth : rightDepth;

      const floorProfile = [
        ...topProfile,
        ...topProfile.slice().reverse().map((p) => new THREE.Vector2(p.x, p.y - safeWallThickness))
      ];
      const floorCap = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(floorProfile)), floorMatBase.clone());
      floorCap.rotation.x = Math.PI * 0.5;
      floorCap.position.set(0, capY, 0);
      floorCap.renderOrder = 996;
      group.add(floorCap);


      const leftWallShape = new THREE.Shape([
        new THREE.Vector2(x0 - safeWallThickness, 0),
        new THREE.Vector2(x0, 0),
        new THREE.Vector2(x0, resolvedLeftDepth - safeWallThickness),
        new THREE.Vector2(x0 - safeWallThickness, resolvedLeftDepth - safeWallThickness)
      ]);
      if (!shouldHideSpaSidePoolWallCap.left) {
        const leftWallCap = new THREE.Mesh(new THREE.ShapeGeometry(leftWallShape), wallCapMatBase.clone());
        leftWallCap.rotation.x = Math.PI * 0.5;
        leftWallCap.position.set(0, capY, 0);
        leftWallCap.renderOrder = 997;
        group.add(leftWallCap);
      }

      const rightWallShape = new THREE.Shape([
        new THREE.Vector2(x3, 0),
        new THREE.Vector2(x3 + safeWallThickness, 0),
        new THREE.Vector2(x3 + safeWallThickness, resolvedRightDepth - safeWallThickness),
        new THREE.Vector2(x3, resolvedRightDepth - safeWallThickness)
      ]);
      if (!shouldHideSpaSidePoolWallCap.right) {
        const rightWallCap = new THREE.Mesh(new THREE.ShapeGeometry(rightWallShape), wallCapMatBase.clone());
        rightWallCap.rotation.x = Math.PI * 0.5;
        rightWallCap.position.set(0, capY, 0);
        rightWallCap.renderOrder = 997;
        group.add(rightWallCap);
      }

      const copingLeftShape = new THREE.Shape([
        new THREE.Vector2(x0 - safeWallThickness, 0),
        new THREE.Vector2(Math.min(x0 + copingInset, x3), 0),
        new THREE.Vector2(Math.min(x0 + copingInset, x3), 0.05),
        new THREE.Vector2(x0 - safeWallThickness, 0.05)
      ]);
      if (!shouldHideSpaSidePoolWallCap.left) {
        const copingLeftCap = new THREE.Mesh(new THREE.ShapeGeometry(copingLeftShape), copingCapMatBase.clone());
        copingLeftCap.rotation.x = Math.PI * 0.5;
        copingLeftCap.position.set(0, capY, 0);
        copingLeftCap.renderOrder = 998;
        group.add(copingLeftCap);
      }

      const copingRightShape = new THREE.Shape([
        new THREE.Vector2(Math.max(x3 - copingInset, x0), 0),
        new THREE.Vector2(x3 + safeWallThickness, 0),
        new THREE.Vector2(x3 + safeWallThickness, 0.05),
        new THREE.Vector2(Math.max(x3 - copingInset, x0), 0.05)
      ]);
      if (!shouldHideSpaSidePoolWallCap.right) {
        const copingRightCap = new THREE.Mesh(new THREE.ShapeGeometry(copingRightShape), copingCapMatBase.clone());
        copingRightCap.rotation.x = Math.PI * 0.5;
        copingRightCap.position.set(0, capY, 0);
        copingRightCap.renderOrder = 998;
        group.add(copingRightCap);
      }
    };

    if (intervals.length) {
      intervals.forEach(([x0, x3]) => addSectionBand(x0, x3, true));
      const minIntervalX = Math.min(...intervals.map((p) => p[0]));
      const maxIntervalX = Math.max(...intervals.map((p) => p[1]));
      const underFloorMaskBottom = -Math.max(clampedDeep, 1) - safeWallThickness - 2;
      this.sectionUnderfloorClipConfig = {
        cutY: sectionY,
        halfWidth: Math.max(0.15, (sectionFloorWidth || size.y || 0.6) * 0.5 + 0.35),
        minX: minIntervalX - safeWallThickness - 0.05,
        maxX: maxIntervalX + safeWallThickness + 0.05,
        x1,
        x2,
        topZ0: -clampedShallow - safeWallThickness + 0.01,
        topZ1: -clampedShallow - safeWallThickness + 0.01,
        topZ2: -clampedDeep - safeWallThickness + 0.01,
        bottomZ: underFloorMaskBottom
      };
    } else {
      this.sectionUnderfloorClipConfig = null;
    }

    addStepSectionCaps();
    addSpaSectionCaps();
    addSpaChannelSectionCaps();

    this.scene.add(group);
    this.sectionViewOverlay = group;
  }


  _getSectionCutY() {
    // Use the pool floor centreline as the section cut reference for every pool
    // type. Expanding the whole poolGroup can include handles, stairs, custom
    // curved edges, or L-shape notches and can shift the cut line away from the
    // rectangle pool's normal centre section.
    const floorMesh = this.poolGroup?.userData?.floorMesh || null;
    if (floorMesh?.isMesh) {
      floorMesh.updateMatrixWorld?.(true);
      const floorBounds = new THREE.Box3().setFromObject(floorMesh);
      if (!floorBounds.isEmpty()) {
        return floorBounds.getCenter(new THREE.Vector3()).y;
      }
    }

    const outerPts = Array.isArray(this.poolGroup?.userData?.outerPts) ? this.poolGroup.userData.outerPts : [];
    if (outerPts.length) {
      const bb = new THREE.Box2();
      outerPts.forEach((p) => {
        if (!p) return;
        bb.expandByPoint(p?.isVector2 ? p : new THREE.Vector2(Number(p.x) || 0, Number(p.y) || 0));
      });
      if (Number.isFinite(bb.min.y) && Number.isFinite(bb.max.y)) {
        return ((bb.min.y + bb.max.y) * 0.5) + (this.poolGroup?.position?.y || 0);
      }
    }

    const bounds = new THREE.Box3();
    if (this.poolGroup) bounds.expandByObject(this.poolGroup);
    if (bounds.isEmpty()) {
      const fallback = new THREE.Box3();
      if (this.poolGroup) fallback.expandByObject(this.poolGroup);
      if (this.spa) fallback.expandByObject(this.spa);
      if (fallback.isEmpty()) return 0;
      return fallback.getCenter(new THREE.Vector3()).y;
    }
    return bounds.getCenter(new THREE.Vector3()).y;
  }

  _trimPoolWallOnSpaSideAtSection(sectionY, enabled) {
    if (!this.poolGroup?.traverse) return;

    const spa = this.spa;
    const snapSide = String(spa?.userData?.snapSide || '').toLowerCase();
    const spaCutsPoolWall = !!(
      spa?.userData?.isHalfwayInWall ||
      spa?.userData?.channelEnabled ||
      String(spa?.userData?.snapVariant || '').toLowerCase() !== 'inner-flush'
    );

    this.poolGroup.traverse((obj) => {
      if (!obj?.isMesh) return;
      if (!obj.userData?.isWall) return;

      const side = String(obj.userData?.side || '').toLowerCase();
      const isTarget =
        (snapSide === 'left' && side === 'west') ||
        (snapSide === 'right' && side === 'east') ||
        (snapSide === 'front' && side === 'south') ||
        (snapSide === 'back' && side === 'north');

      if (!obj.userData.__sectionOriginalGeometry) {
        obj.userData.__sectionOriginalGeometry = obj.geometry;
        obj.userData.__sectionOriginalPosition = obj.position.clone();
      }

      const restore = () => {
        if (obj.userData.__sectionOriginalGeometry && obj.geometry !== obj.userData.__sectionOriginalGeometry) {
          obj.geometry.dispose?.();
          obj.geometry = obj.userData.__sectionOriginalGeometry;
        }
        if (obj.userData.__sectionOriginalPosition) {
          obj.position.copy(obj.userData.__sectionOriginalPosition);
        }
        obj.visible = true;
      };

      if (!enabled || !spaCutsPoolWall || !isTarget) {
        restore();
        return;
      }

      const originalGeo = obj.userData.__sectionOriginalGeometry;
      originalGeo.computeBoundingBox?.();
      const bb = originalGeo.boundingBox;
      if (!bb) {
        restore();
        return;
      }

      // Only east/west walls need shortening along local Y to match the section cut.
      // North/south walls are already handled by the front-shell hide path.
      if (!(side === 'west' || side === 'east')) {
        restore();
        return;
      }

      const parent = obj.parent;
      if (!parent) {
        restore();
        return;
      }

      const cutLocal = parent.worldToLocal(new THREE.Vector3(0, sectionY, 0)).y;
      const minY = bb.min.y;
      const maxY = bb.max.y;

      // Keep only the half behind the section cut: local Y >= cutLocal.
      const keepMinY = Math.max(minY, cutLocal);
      const keepMaxY = maxY;
      const keptWidthY = keepMaxY - keepMinY;

      if (!(keptWidthY > 1e-4)) {
        obj.visible = false;
        return;
      }

      const sizeX = bb.max.x - bb.min.x;
      const sizeZ = bb.max.z - bb.min.z;

      const trimmedGeo = new THREE.BoxGeometry(sizeX, keptWidthY, sizeZ);
      if (obj.geometry !== originalGeo) {
        obj.geometry.dispose?.();
      }
      obj.geometry = trimmedGeo;

      if (obj.userData.__sectionOriginalPosition) {
        obj.position.copy(obj.userData.__sectionOriginalPosition);
      }
      obj.position.y = (keepMinY + keepMaxY) * 0.5;
      obj.visible = true;
    });
  }

  _getSectionPresentationBounds() {
    const bounds = new THREE.Box3();
    [
      this.poolGroup,
      this.spa,
      this.ground?.userData?.spaChannelGroup,
      this.ground?.userData?.spaChannelWaterGroup
    ].filter(Boolean).forEach((root) => bounds.expandByObject(root));
    return bounds;
  }

  _moveCameraToCurrentSectionPosition(duration = 0.45) {
    if (!this.camera || !this.controls) return;
    const bounds = this._getSectionPresentationBounds();
    if (bounds.isEmpty()) return;
    const fit = this._getSectionCameraFit(bounds);
    this._setSectionControlsLocked(false);
    this.animateCameraTo(fit.position, fit.target, duration, () => {
      if (this.sectionViewEnabled) this._setSectionControlsLocked(true, fit.distance);
    });
  }

  setSectionViewEnabled(enabled) {
    if (!this.renderer || !this.camera || !this.controls) return;
    if (enabled === this.sectionViewEnabled) {
      // Re-clicking/opening the dimensions panel while section mode is already
      // active should still force the camera back to the section view. This fixes
      // the intermittent case where the section/caps are active but the pool stays
      // in the previous camera position.
      if (enabled) {
        this._refreshSectionViewPresentation();
        this._moveCameraToCurrentSectionPosition(0.35);
      }
      return;
    }

    const waters = [
      this.poolGroup?.userData?.waterMesh,
      this.spa?.userData?.waterMesh,
      this.ground?.userData?.spaChannelWaterGroup
    ].filter(Boolean);

    if (enabled) {
      const bounds = this._getSectionPresentationBounds();
      if (bounds.isEmpty()) return;

      const center = bounds.getCenter(new THREE.Vector3());
      this.sectionViewSavedCamera = {
        position: this.camera.position.clone(),
        target: this.controls.target.clone()
      };

      // Keep the live model and add the current section void box on top of
      // the existing spa void system. Re-enable only the section cap/floor-mask
      // helpers from the C4.3 trim patch so cut faces and floor masking are restored.
      this._setSectionOverlay(null, false);
      this._setSectionUnderfloorClip(this.poolGroup, null);
      this._setSectionFrontShellHidden(0, false);
      this._trimPoolWallOnSpaSideAtSection(0, false);
      waters.forEach((root) => this._setSectionHidden(root, false));
      waters.forEach((root) => this._setSectionWaterClip(root, null));
      const wallThickness = Math.max(0.05, this.poolGroup?.userData?.wallThickness || 0.2);
      const sectionCutY = this._getSectionCutY();
      // TEST: do not rebuild spa wall/channel voids during section entry.
      // Spa-in-wall placement already applied these voids before section mode;
      // rebuilding them here can replace channel meshes/material clipping mid-toggle.
      // this._refreshSpaVoidsForSection();
      this._enableSectionVoidClip(sectionCutY);
      this._setSectionFrontShellHidden(sectionCutY, true);
      this._trimPoolWallOnSpaSideAtSection(sectionCutY, true);
      this._setSectionOverlay(bounds, true, sectionCutY, wallThickness);
      this._setSectionUnderfloorClip(this.poolGroup, this.sectionUnderfloorClipConfig || null);
      this.sectionViewSignature = this._getSectionViewSignature();

      const fit = this._getSectionCameraFit(bounds);
      this._setSectionControlsLocked(false);
      this.animateCameraTo(fit.position, fit.target, 0.6, () => {
        if (this.sectionViewEnabled) this._setSectionControlsLocked(true, fit.distance);
      });
    } else {
      this._setSectionControlsLocked(false);
      waters.forEach((root) => {
        this._setSectionWaterClip(root, null);
        this._setSectionHidden(root, false);
      });
      [this.poolGroup, this.spa, this.ground?.userData?.spaChannelGroup].filter(Boolean).forEach((root) => this._setSectionShellClip(root, null));
      this._disableSectionVoidClip();
      this._trimPoolWallOnSpaSideAtSection(0, false);
      this._setSectionUnderfloorClip(this.poolGroup, null);
      this._setSectionFrontShellHidden(0, false);
      this._setSectionOverlay(null, false);
      if (this.sectionViewSavedCamera) {
        this.animateCameraTo(this.sectionViewSavedCamera.position, this.sectionViewSavedCamera.target, 0.45);
      }
      this.sectionViewClipPlane = null;
      this.sectionViewSignature = "";
    }

    this.sectionViewEnabled = enabled;
    this._syncSectionSelectionEffects();
  }

  _getSectionViewSignature() {
    const p = this.poolParams || {};
    return [
      this.poolGroup?.uuid || '',
      this.spa?.uuid || '',
      p.shape || '',
      p.length ?? '',
      p.width ?? '',
      p.shallow ?? '',
      p.deep ?? '',
      p.shallowFlat ?? '',
      p.deepFlat ?? '',
      p.stepCount ?? '',
      p.stepDepth ?? '',
      p.stepWidth ?? '',
      p.stepPosition ?? '',
      p.stepWall ?? '',
      p.stepShape ?? '',
      p.stepBenchMode ?? ''
    ].join('|');
  }

  _refreshSectionViewPresentation() {
    if (!this.sectionViewEnabled || !this.poolGroup) return;
    const bounds = this._getSectionPresentationBounds();
    if (bounds.isEmpty()) return;

    const sectionCutY = this._getSectionCutY();
    const waters = [
      this.poolGroup?.userData?.waterMesh,
      this.spa?.userData?.waterMesh,
      this.ground?.userData?.spaChannelWaterGroup
    ].filter(Boolean);

    // Refresh the additive section void while preserving normal spa voids,
    // then rebuild only the caps/floor mask/trim helpers from the C4.3 patch.
    this._setSectionOverlay(null, false);
    this._setSectionUnderfloorClip(this.poolGroup, null);
    this._setSectionFrontShellHidden(0, false);
    this._trimPoolWallOnSpaSideAtSection(0, false);
    waters.forEach((root) => this._setSectionHidden(root, false));
    waters.forEach((root) => this._setSectionWaterClip(root, null));
    const wallThickness = Math.max(0.05, this.poolGroup?.userData?.wallThickness || 0.2);
    // TEST: do not rebuild spa wall/channel voids during section refresh.
    // this._refreshSpaVoidsForSection();
    this._enableSectionVoidClip(sectionCutY);
    this._setSectionFrontShellHidden(sectionCutY, true);
    this._trimPoolWallOnSpaSideAtSection(sectionCutY, true);
    this._setSectionOverlay(bounds, true, sectionCutY, wallThickness);
    this._setSectionUnderfloorClip(this.poolGroup, this.sectionUnderfloorClipConfig || null);
    this.sectionViewSignature = this._getSectionViewSignature();
  }


  async _refreshSectionViewAfterGeometryEdit({ moveCamera = false, fullReset = false } = {}) {
    if (!this.sectionViewEnabled || !this.poolGroup) return;
    const seq = ++this.sectionViewRefreshSeq;

    const waitFrame = () => new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });

    const teardownSectionPresentation = () => {
      const waters = [
        this.poolGroup?.userData?.waterMesh,
        this.spa?.userData?.waterMesh,
        this.ground?.userData?.spaChannelWaterGroup
      ].filter(Boolean);

      this._setSectionOverlay(null, false);
      this._setSectionUnderfloorClip(this.poolGroup, null);
      this._setSectionFrontShellHidden(0, false);
      this._trimPoolWallOnSpaSideAtSection(0, false);
      waters.forEach((root) => {
        this._setSectionWaterClip(root, null);
        this._setSectionHidden(root, false);
      });
      this._disableSectionVoidClip();
    };

    const applySectionPresentation = () => {
      if (seq !== this.sectionViewRefreshSeq || !this.sectionViewEnabled || !this.poolGroup) return;
      // TEST: avoid spa wall/channel void rebuild while section presentation is active.
      // The live spa void state is preserved; only section caps/void-box are refreshed.
      // try { updatePoolWaterVoid(this.poolGroup, this.spa); } catch (_) {}
      // try { updateGroundVoid(this.ground || this.scene?.userData?.ground, this.poolGroup, this.spa); } catch (_) {}
      // try { this._refreshSpaVoidsForSection(); } catch (_) {}
      try { this._refreshSectionViewPresentation(); } catch (_) {}
      try { this._syncSectionSelectionEffects(); } catch (_) {}
      try { this._updateSectionDimensionHandles(); } catch (_) {}
      try { this._updateSpaDimensionHandles(); } catch (_) {}
      if (moveCamera) {
        try { this._moveCameraToCurrentSectionPosition(0.25); } catch (_) {}
      }
    };

    // For edits made while section view is active, a light uniform update is not
    // enough: pool/spa/channel rebuilds can replace meshes/materials after the
    // first pointer-up tick. Fully tear down the section-only helpers, let the
    // rebuild/material swaps settle, then rebuild the section presentation from
    // the current live geometry.
    if (fullReset) {
      teardownSectionPresentation();
      await waitFrame();
      if (seq !== this.sectionViewRefreshSeq) return;
      applySectionPresentation();
      await waitFrame();
      if (seq !== this.sectionViewRefreshSeq) return;
      applySectionPresentation();
      return;
    }

    applySectionPresentation();
    await waitFrame();
    if (seq !== this.sectionViewRefreshSeq) return;
    applySectionPresentation();
  }

  _getSectionCameraFit(bounds, padding = 1.18) {
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const cam = this.camera;
    const aspect = Math.max(0.01, cam?.aspect || (this.renderer?.domElement?.clientWidth || 1) / Math.max(1, this.renderer?.domElement?.clientHeight || 1));
    const vFovRad = THREE.MathUtils.degToRad(Math.max(1, cam?.fov || 45));
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad * 0.5) * aspect);
    const halfWidth = Math.max(0.5, size.x * 0.5);
    const halfHeight = Math.max(0.5, size.z * 0.5);
    const distForWidth = halfWidth / Math.max(Math.tan(hFovRad * 0.5), 1e-4);
    const distForHeight = halfHeight / Math.max(Math.tan(vFovRad * 0.5), 1e-4);
    const distance = Math.max(4.5, distForWidth, distForHeight) * padding;
    const target = new THREE.Vector3(center.x, center.y, center.z);
    const position = new THREE.Vector3(center.x, bounds.min.y - distance, center.z);
    return { position, target, distance };
  }

  _setSectionControlsLocked(locked, lockedDistance = null) {
    const ctrl = this.controls;
    if (!ctrl) return;

    if (!ctrl.userData) ctrl.userData = {};

    // In section view we want the camera framing to stay stable.
    // Lock orbit controls by disabling rotate/pan and clamping zoom to the
    // current camera-target distance. We keep zoom "enabled" so wheel/touch
    // events are still captured (preventing page scroll), but distance cannot
    // actually change while locked.
    const cam = this.camera;
    const currentDistance = Number.isFinite(lockedDistance)
      ? lockedDistance
      : ((cam && ctrl.target)
        ? cam.position.distanceTo(ctrl.target)
        : null);

    if (locked) {
      if (!ctrl.userData.__sectionLockPrev) {
        ctrl.userData.__sectionLockPrev = {
          enabled: ctrl.enabled,
          enablePan: ctrl.enablePan,
          enableRotate: ctrl.enableRotate,
          enableZoom: ctrl.enableZoom,
          minDistance: ctrl.minDistance,
          maxDistance: ctrl.maxDistance,
          mouseButtons: { ...(ctrl.mouseButtons || {}) },
          touches: { ...(ctrl.touches || {}) },
          keys: Array.isArray(ctrl.keys) ? [...ctrl.keys] : ctrl.keys
        };
      }

      // Hard lock interaction.
      ctrl.enabled = true;
      ctrl.enablePan = false;
      ctrl.enableRotate = false;

      // Clamp zoom to current distance so wheel/touch doesn't move the page,
      // but camera distance stays fixed.
      if (currentDistance != null && Number.isFinite(currentDistance)) {
        ctrl.enableZoom = true;
        ctrl.minDistance = currentDistance;
        ctrl.maxDistance = currentDistance;
      }

      ctrl.mouseButtons = {
        LEFT: -1,
        MIDDLE: -1,
        RIGHT: -1
      };
      if (ctrl.touches) {
        ctrl.touches = {
          ONE: -1,
          // Keep TWO mapped so touchmove is captured (but zoom is clamped).
          TWO: THREE.TOUCH.DOLLY_PAN
        };
      }
      if (Array.isArray(ctrl.keys)) ctrl.keys = [];
    } else if (ctrl.userData.__sectionLockPrev) {
      const prev = ctrl.userData.__sectionLockPrev;
      if (prev.enabled !== undefined) ctrl.enabled = prev.enabled;
      ctrl.enablePan = prev.enablePan;
      ctrl.enableRotate = prev.enableRotate;
      if (prev.enableZoom !== undefined) ctrl.enableZoom = prev.enableZoom;
      if (prev.minDistance !== undefined) ctrl.minDistance = prev.minDistance;
      if (prev.maxDistance !== undefined) ctrl.maxDistance = prev.maxDistance;
      if (prev.mouseButtons) ctrl.mouseButtons = { ...prev.mouseButtons };
      if (prev.touches) ctrl.touches = { ...prev.touches };
      if (prev.keys !== undefined) ctrl.keys = Array.isArray(prev.keys) ? [...prev.keys] : prev.keys;
      delete ctrl.userData.__sectionLockPrev;
    }

    ctrl.update?.();
  }

  animateCameraTo(newPos, newTarget, duration = 0.8, onComplete = null) {
    const cam = this.camera;
    const ctrl = this.controls;
    if (!cam || !ctrl || !newPos || !newTarget) return;

    const startPos = cam.position.clone();
    const startTarget = ctrl.target.clone();
    const startTime = performance.now();

    const animateCam = (now) => {
      const t = Math.min(1, (now - startTime) / (duration * 1000));
      const k = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      cam.position.lerpVectors(startPos, newPos, k);
      ctrl.target.lerpVectors(startTarget, newTarget, k);
      ctrl.update();

      if (t < 1) {
        requestAnimationFrame(animateCam);
      } else if (typeof onComplete === 'function') {
        onComplete();
      }
    };

    requestAnimationFrame(animateCam);
  }

  focusCameraOnPoolShape() {
    if (!this.poolGroup || !this.camera || !this.controls) return;

    const bounds = new THREE.Box3().setFromObject(this.poolGroup);
    if (bounds.isEmpty()) return;

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());

    const halfVFov = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
    const halfHFov = Math.atan(Math.tan(halfVFov) * this.camera.aspect);

    const fitX = (size.x * 0.5) / Math.max(Math.tan(halfHFov), 0.01);
    const fitY = (size.y * 0.5) / Math.max(Math.tan(halfVFov), 0.01);
    const distance = Math.max(fitX, fitY) * 1.3 + Math.max(size.z, 1.5);
    const tinyYOffset = Math.max(size.y * 0.002, 0.01);

    const target = center.clone();
    const newPos = new THREE.Vector3(center.x, center.y - tinyYOffset, center.z + distance);

    this.animateCameraTo(newPos, target, 0.8);
  }

  getStarterModelViewBounds() {
    const bounds = new THREE.Box3();
    let hasBounds = false;

    const expandByObject = (obj) => {
      if (!obj) return;
      const objBounds = new THREE.Box3().setFromObject(obj);
      if (objBounds.isEmpty()) return;
      bounds.union(objBounds);
      hasBounds = true;
    };

    expandByObject(this.poolGroup);
    expandByObject(this.spa);

    return hasBounds ? bounds : null;
  }

  focusCameraLikeStarterPreview(preset = null, { animate = false } = {}) {
    if (!this.camera || !this.controls) return;

    const bounds = this.getStarterModelViewBounds();
    if (!bounds) return;

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z, 1);
    const directionValues = preset?.previewCamera?.direction || [1, -1, 0.75];
    const direction = new THREE.Vector3(
      Number(directionValues[0]) || 1,
      Number(directionValues[1]) || -1,
      Number(directionValues[2]) || 0.75
    ).normalize();

    // Use a natural architectural perspective. The former 10-degree lens
    // magnified a tiny portion of the 360 panorama, making the 8K sky appear
    // like one oversized blur and pushing the camera unnecessarily far away.
    if (this.camera.isPerspectiveCamera) {
      this.camera.fov = 50;
      this.camera.aspect = Math.max(0.01, this.renderer?.domElement?.clientWidth || window.innerWidth) /
        Math.max(1, this.renderer?.domElement?.clientHeight || window.innerHeight);
    }
    const halfVFov = THREE.MathUtils.degToRad((this.camera.fov || 50) * 0.5);
    const halfHFov = Math.atan(Math.tan(halfVFov) * Math.max(this.camera.aspect || 1, 0.01));
    const fitX = (size.x * 0.5) / Math.max(Math.tan(halfHFov), 0.01);
    const fitY = (size.y * 0.5) / Math.max(Math.tan(halfVFov), 0.01);
    const distance = Math.max(fitX, fitY) * 1.32 + Math.max(size.z, 1.0);
    const offset = direction.clone().multiplyScalar(distance);
    const target = center.clone();
    const newPos = new THREE.Vector3(
      center.x + offset.x,
      center.y + offset.y,
      center.z + offset.z
    );

    this.camera.up.set(0, 0, 1);
    this.camera.near = 0.05;
    this.camera.far = Math.max(500, distance * 10);
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();

    if (animate) {
      this.animateCameraTo(newPos, target, 0.45);
    } else {
      this.camera.position.copy(newPos);
      this.camera.lookAt(target);
      this.controls.target.copy(target);
      this.controls.update();
    }
  }

  openStarterModelView(preset = null) {
    if (this.sectionViewEnabled) {
      try { this.setSectionViewEnabled(false); } catch (_) {}
    }

    if (typeof window.closePanelsFromCode === "function") {
      window.closePanelsFromCode();
    } else {
      document.querySelectorAll(".side-panel.open").forEach((panel) => panel.classList.remove("open"));
      document.querySelectorAll(".icon-btn.active").forEach((button) => button.classList.remove("active"));
      document.dispatchEvent(new CustomEvent("activePanelChanged", { detail: { panelName: null } }));
    }

    this.focusCameraLikeStarterPreview(preset, { animate: false });
  }


  focusCameraOnWall(wall) {
    if (!wall || !this.poolGroup || !this.camera || !this.controls) return;

    const wallBounds = new THREE.Box3().setFromObject(wall);
    const poolBounds = new THREE.Box3().setFromObject(this.poolGroup);
    if (wallBounds.isEmpty() || poolBounds.isEmpty()) return;

    const wallCenter = wallBounds.getCenter(new THREE.Vector3());
    const wallSize = wallBounds.getSize(new THREE.Vector3());
    const poolCenter = poolBounds.getCenter(new THREE.Vector3());

    const posAttr = wall.geometry?.attributes?.position;
    let tangent2 = null;
    if (posAttr && posAttr.count >= 2) {
      let meanX = 0;
      let meanY = 0;
      for (let i = 0; i < posAttr.count; i++) {
        const wp = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(wall.matrixWorld);
        meanX += wp.x;
        meanY += wp.y;
      }
      meanX /= posAttr.count;
      meanY /= posAttr.count;

      let xx = 0;
      let xy = 0;
      let yy = 0;
      for (let i = 0; i < posAttr.count; i++) {
        const wp = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(wall.matrixWorld);
        const dx = wp.x - meanX;
        const dy = wp.y - meanY;
        xx += dx * dx;
        xy += dx * dy;
        yy += dy * dy;
      }

      const trace = xx + yy;
      const det = xx * yy - xy * xy;
      const disc = Math.max(0, trace * trace * 0.25 - det);
      const lambda = trace * 0.5 + Math.sqrt(disc);
      tangent2 = Math.abs(xy) > 1e-8
        ? new THREE.Vector2(lambda - yy, xy)
        : (xx >= yy ? new THREE.Vector2(1, 0) : new THREE.Vector2(0, 1));

      if (tangent2.lengthSq() > 1e-8) tangent2.normalize();
      else tangent2 = null;
    }

    if (!tangent2) {
      const dx = wallSize.x;
      const dy = wallSize.y;
      tangent2 = dx >= dy ? new THREE.Vector2(1, 0) : new THREE.Vector2(0, 1);
    }

    let inward2 = new THREE.Vector2(-tangent2.y, tangent2.x);
    const toPoolCenter2 = new THREE.Vector2(poolCenter.x - wallCenter.x, poolCenter.y - wallCenter.y);
    if (toPoolCenter2.lengthSq() > 1e-8 && inward2.dot(toPoolCenter2) < 0) {
      inward2.multiplyScalar(-1);
    }
    if (inward2.lengthSq() < 1e-8) inward2.set(0, -1);
    inward2.normalize();

    const poolSize = poolBounds.getSize(new THREE.Vector3());

    // Estimate the visible wall span in plan from the tangent direction
    const wallSpan =
      Math.abs(tangent2.x) * wallSize.x +
      Math.abs(tangent2.y) * wallSize.y;

    // Camera-fit distance from FOV so the full wall is visible
    const halfVFov = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
    const halfHFov = Math.atan(Math.tan(halfVFov) * this.camera.aspect);

    const fitByWidth = (wallSpan * 0.5) / Math.max(Math.tan(halfHFov), 0.01);
    const fitByHeight = (Math.max(wallSize.z, 1.2) * 0.5) / Math.max(Math.tan(halfVFov), 0.01);

    // Match the wider full-wall framing from the 2.8 reference, but keep a slightly raised viewpoint
    const standoff = Math.max(
      6.5,
      Math.min(Math.max(fitByWidth, fitByHeight) * 2.2, 14.0)
    );

    // Slightly higher camera with a gentle downward look
    const eyeHeight = Math.max(0.90, Math.min(1.45, wallSize.z * 0.38));
    const targetHeight = Math.max(
      wallBounds.min.z + wallSize.z * 0.20,
      Math.min(wallBounds.min.z + wallSize.z * 0.30, 0.70)
    );

    const target = new THREE.Vector3(wallCenter.x, wallCenter.y, targetHeight);
    const newPos = new THREE.Vector3(
      wallCenter.x + inward2.x * standoff,
      wallCenter.y + inward2.y * standoff,
      eyeHeight
    );

    this.animateCameraTo(newPos, target, 0.55);
  }

  focusCameraOnStep(step) {
    if (!step || !this.poolGroup || !this.camera || !this.controls) return;

    const poolBounds = new THREE.Box3().setFromObject(this.poolGroup);
    if (poolBounds.isEmpty()) return;

    const wall = ["west", "east", "south", "north"].includes(step.userData?.stepWall)
      ? step.userData.stepWall
      : (["west", "east", "south", "north"].includes(this.poolParams?.stepWall) ? this.poolParams.stepWall : "west");

    // Frame the whole stair/bench set on the same wall, not only the clicked
    // tread. This keeps the full bench seat visible after selecting a step.
    const stepSetBounds = new THREE.Box3();
    this.poolGroup.traverse((o) => {
      if (!o?.isMesh || !o.userData?.isStep || o.userData?.isStepAddon) return;
      const oWall = ["west", "east", "south", "north"].includes(o.userData?.stepWall)
        ? o.userData.stepWall
        : wall;
      if (oWall !== wall) return;
      stepSetBounds.expandByObject(o);
    });
    if (stepSetBounds.isEmpty()) stepSetBounds.expandByObject(step);
    if (stepSetBounds.isEmpty()) return;

    const target = stepSetBounds.getCenter(new THREE.Vector3());
    const stepSetSize = stepSetBounds.getSize(new THREE.Vector3());
    const poolCenter = poolBounds.getCenter(new THREE.Vector3());
    const poolSize = poolBounds.getSize(new THREE.Vector3());

    // Camera belongs inside the pool, looking back at the selected wall/steps.
    // Use the pool centre side of the step, not the outside/wall side, to avoid
    // ending up behind the wall when steps are moved to east/south/north.
    const toPoolCenter = new THREE.Vector2(poolCenter.x - target.x, poolCenter.y - target.y);
    if (toPoolCenter.lengthSq() < 1e-8) {
      const inwardFallback = {
        west: new THREE.Vector2(1, 0),
        east: new THREE.Vector2(-1, 0),
        south: new THREE.Vector2(0, 1),
        north: new THREE.Vector2(0, -1)
      }[wall] || new THREE.Vector2(1, 0);
      toPoolCenter.copy(inwardFallback);
    }
    toPoolCenter.normalize();

    const maxPoolSpan = Math.max(poolSize.x, poolSize.y, 1);
    const benchSpan = Math.max(stepSetSize.x, stepSetSize.y, 1.2);
    const planOffset = Math.min(maxPoolSpan * 0.18, Math.max(0.8, benchSpan * 0.35));
    const cameraXY = new THREE.Vector2(poolCenter.x, poolCenter.y).addScaledVector(toPoolCenter, planOffset);

    const targetZ = Math.max(poolBounds.min.z + Math.max(poolSize.z, 1) * 0.48, target.z);
    target.z = targetZ;

    // Pull the camera back by using height/FOV rather than moving it outside
    // the pool. This gives a front-on view that still captures the full bench.
    const halfVFov = THREE.MathUtils.degToRad((this.camera.fov || 35) * 0.5);
    const fitHeight = (Math.max(benchSpan, maxPoolSpan * 0.45) * 0.65) / Math.max(Math.tan(halfVFov), 0.01);
    const eyeHeight = Math.max(poolBounds.max.z + 2.2, targetZ + fitHeight * 0.42, 2.6);

    const newPos = new THREE.Vector3(cameraXY.x, cameraXY.y, eyeHeight);
    this.animateCameraTo(newPos, target, 0.55);
  }

  setCausticsSizeMultiplier(mult) {
    this.caustics?.setSizeMultiplier?.(mult);
  }

  setCausticsSpeedMultiplier(mult) {
    this.caustics?.setSpeedMultiplier?.(mult);
  }

  setCausticsIntensity(intensity) {
    this.caustics?.setIntensity?.(intensity);
  }


  // --------------------------------------------------------------
  // INTERNAL: remove poolGroup safely without disposing PBR-managed textures
  // (dispose geometry only; PBRManager owns texture/material lifecycle)
  // --------------------------------------------------------------
  _removePoolGroupSafely(group) {
    if (!group) return;

    try {
      if (group.parent) group.parent.remove(group);
      else if (this.scene) this.scene.remove(group);
    } catch (_) {}

    // Dispose geometries only (avoid disposing materials/textures that may be re-used)
    group.traverse((o) => {
      if (!o || !o.isMesh) return;
      try { o.geometry?.dispose?.(); } catch (_) {}
    });
  }

  // --------------------------------------------------------------
  // INTERNAL: coalesce expensive PBR re-application so we do not race
  // against rapid polygon edits (prevents tiles disappearing after edits)
  // --------------------------------------------------------------
  _schedulePBRApply() {
    if (!this.pbrManager || !this.poolGroup) return;

    const token = (this._pbrApplyToken = (this._pbrApplyToken || 0) + 1);
    const targetGroup = this.poolGroup;

    requestAnimationFrame(async () => {
      if (token !== this._pbrApplyToken) return;
      if (!this.pbrManager || this.poolGroup !== targetGroup) return;

      this.pbrManager.setPoolGroup(this.poolGroup);
      this.pbrManager.updatePoolParamsRef(this.poolParams);

      try {
        await this.pbrManager.applyCurrentToGroup();
      
        // Ensure caustics are attached after PBR materials are created/updated
        this.caustics?.attachToGroup?.(this.poolGroup);
} catch (_) {}

      if (token !== this._pbrApplyToken) return;

      if (this.spa) {
        try {
          this.spa.userData.poolGroup = this.poolGroup || null;
          this.spa.userData.poolParams = this.poolParams;
          snapToPool(this.spa);
          updateSpa(this.spa);
      this.applyPoolElevation();
          await this.pbrManager.applyTilesToSpa(this.spa);
      // Attach caustics to spa interior too
      try { this.caustics?.attachToGroup?.(this.spa); } catch (e) {}
          
        // Ensure caustics are attached to spa materials as well
        this.caustics?.attachToGroup?.(this.spa);
updatePoolWaterVoid(this.poolGroup, this.spa);
          updateGroundVoid(this.ground || this.scene?.userData?.ground, this.poolGroup, this.spa);
        } catch (_) {}
      }
    });
  }


  
  // --------------------------------------------------------------
  // UV / GROUT ALIGNMENT HELPERS
  //  - Keeps tile density fixed when meshes are scaled (steps/walls)
  //  - Snaps step grout across treads + risers
  //  - Snaps floor grout to a stable origin per-shape rebuild
  // --------------------------------------------------------------
  computeAndStoreUVOrigins() {
    if (!this.poolGroup) return;

    // Ensure matrices are up to date
    this.poolGroup.updateMatrixWorld?.(true);

    // Floor origin: prefer the tagged floor mesh, else use poolGroup bounds
    let floorOrigin = null;

    const floors = [];
    this.poolGroup.traverse((o) => o.userData?.isFloor && floors.push(o));

    const tmpBox = new THREE.Box3();

    if (floors.length) {
      tmpBox.setFromObject(floors[0]);
      floorOrigin = { x: tmpBox.min.x, y: tmpBox.min.y };
    } else {
      tmpBox.setFromObject(this.poolGroup);
      floorOrigin = { x: tmpBox.min.x, y: tmpBox.min.y };
    }

    this.poolGroup.userData.floorUVOrigin = floorOrigin;

    // Step origin: left-most edge across all step meshes (treads/risers)
    const steps = [];
    this.poolGroup.traverse((o) => o.userData?.isStep && !o.userData?.isStepAddon && steps.push(o));

    if (steps.length) {
      let minEdgeX = Infinity;

      steps.forEach((s) => {
        if (!s.geometry?.boundingBox) s.geometry?.computeBoundingBox?.();
        const bb = s.geometry?.boundingBox;
        if (!bb) return;

        const baseLen = (bb.max.x - bb.min.x) || 0;
        const len = baseLen * (s.scale?.x || 1);
        const left = (s.position?.x || 0) - len * 0.5;
        if (left < minEdgeX) minEdgeX = left;
      });

      if (isFinite(minEdgeX)) {
        this.poolGroup.userData.stepUVOriginX = minEdgeX;
        // z=0 is the pool datum (coping level) in your builders
        this.poolGroup.userData.stepUVOriginZ = 0;
      }
    }
  }

  rebakePoolTilingUVs() {
    if (!this.poolGroup) return;

    // Recompute origins each rebuild (shape changes shift bounds)
    this.computeAndStoreUVOrigins();

    // Update UVs on any mesh that relies on fixed-density tiling
    this.poolGroup.traverse((o) => {
      if (!o?.isMesh) return;

      // Floors, walls, steps (treads + risers) are the main targets
      if (o.userData?.isFloor || o.userData?.isWall || o.userData?.isStep || o.userData?.forceVerticalUV) {
        this.updateScaledBoxTilingUVs(o);
      }
    });
  }

  updateScaledBoxTilingUVs(mesh) {
    if (!mesh?.isMesh || !mesh.geometry?.attributes?.position) return;

    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    if (!nrm) return;

    const tile = this.tileSize || 0.3;

    // Per-group origins for grout snapping
    const g = mesh.parent?.userData || this.poolGroup?.userData || {};
    const stepOriginX = (g.stepUVOriginX ?? 0);
    const stepOriginZ = (g.stepUVOriginZ ?? 0);
    const floorOrigin = g.floorUVOrigin ?? { x: 0, y: 0 };

    // Effective scale relative to the pool group.
    // This keeps tile density stable during live preview when the whole
    // poolGroup is scaled for length/width dragging, while still respecting
    // per-mesh scaling for step extension / wall raise.
    let sx = 1, sy = 1, sz = 1;
    let cur = mesh;
    while (cur) {
      sx *= cur.scale?.x ?? 1;
      sy *= cur.scale?.y ?? 1;
      sz *= cur.scale?.z ?? 1;
      if (cur === this.poolGroup) break;
      cur = cur.parent;
    }

    const uvs = new Float32Array(pos.count * 2);

    for (let i = 0; i < pos.count; i++) {
      // Local vertex scaled to match world-space tiling density
      const lx = pos.getX(i) * sx;
      const ly = pos.getY(i) * sy;
      const lz = pos.getZ(i) * sz;

      const ax = Math.abs(nrm.getX(i));
      const ay = Math.abs(nrm.getY(i));
      const az = Math.abs(nrm.getZ(i));

      let u = 0, v = 0;

      // RISERS: vertical faces must use Z for vertical grout density
      // (older mapping used Y, which collapses grout on risers)
      if (mesh.userData?.forceVerticalUV || mesh.userData?.isRiser) {
        if (ax >= ay && ax >= az) {
          // normal ~X => plane is YZ
          u = (ly + (mesh.position?.y || 0) - floorOrigin.y) / tile;
          v = (lz + (mesh.position?.z || 0) - stepOriginZ) / tile;
        } else if (ay >= ax && ay >= az) {
          // normal ~Y => plane is XZ
          u = (lx + (mesh.position?.x || 0) - stepOriginX) / tile;
          v = (lz + (mesh.position?.z || 0) - stepOriginZ) / tile;
        } else {
          // fallback
          u = (lx + (mesh.position?.x || 0) - stepOriginX) / tile;
          v = (ly + (mesh.position?.y || 0) - floorOrigin.y) / tile;
        }

      // STEP TREADS: align along X from step origin, and along Y from floor origin
      } else if (mesh.userData?.isStep && az >= ax && az >= ay) {
        u = (lx + (mesh.position?.x || 0) - stepOriginX) / tile;
        v = (ly + (mesh.position?.y || 0) - floorOrigin.y) / tile;

      // POOL FLOOR: align to floor origin in XY
      } else if (mesh.userData?.isFloor && az >= ax && az >= ay) {
        u = (lx + (mesh.position?.x || 0) - floorOrigin.x) / tile;
        v = (ly + (mesh.position?.y || 0) - floorOrigin.y) / tile;

      // WALL TOPS: use the same physical XY tile projection as the pool floor.
      // This lets tile wrap correctly over exposed wall tops without a separate cap mesh.
      } else if (mesh.userData?.isWall && az >= ax && az >= ay) {
        u = (lx + (mesh.position?.x || 0) - floorOrigin.x) / tile;
        v = (ly + (mesh.position?.y || 0) - floorOrigin.y) / tile;

      // WALLS (vertical): lock grout to floor origin horizontally, and Z vertically
      } else if (mesh.userData?.isWall) {
        if (ax >= ay && ax >= az) {
          // plane YZ
          u = (ly + (mesh.position?.y || 0) - floorOrigin.y) / tile;
          v = (lz + (mesh.position?.z || 0)) / tile;
        } else {
          // plane XZ
          u = (lx + (mesh.position?.x || 0) - floorOrigin.x) / tile;
          v = (lz + (mesh.position?.z || 0)) / tile;
        }

      // Fallback triplanar-ish projection
      } else {
        if (az >= ax && az >= ay) {
          u = (lx + (mesh.position?.x || 0)) / tile;
          v = (ly + (mesh.position?.y || 0)) / tile;
        } else if (ay >= ax && ay >= az) {
          u = (lx + (mesh.position?.x || 0)) / tile;
          v = (lz + (mesh.position?.z || 0)) / tile;
        } else {
          u = (ly + (mesh.position?.y || 0)) / tile;
          v = (lz + (mesh.position?.z || 0)) / tile;
        }
      }

      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
    }

    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

    // If a material uses uv2 (AO), keep it in sync
    if (geo.attributes.uv2) {
      geo.setAttribute("uv2", geo.attributes.uv.clone());
    }

    geo.attributes.uv.needsUpdate = true;
  }

// --------------------------------------------------------------
  // WATER GHOST MODE

  // --------------------------------------------------------------
  // FLOOR REPROFILE AFTER STEP EXTENSION
  // - Moves slope origin to the runtime end of steps run
  // - Raises (cuts out) the floor under step footprints to meet step bottoms
  // --------------------------------------------------------------
  updateFloorAfterStepExtension(steps, originX) {
    if (!this.poolGroup || !Array.isArray(steps) || steps.length === 0) return;
    if (!isFinite(originX)) return;

    // Find the floor mesh (prefer tagged isFloor)
    let floor = null;
    this.poolGroup.traverse((o) => {
      if (!floor && o?.isMesh && o.userData?.isFloor) floor = o;
    });
    floor = floor || this.poolGroup.userData?.floorMesh;
    if (!floor?.geometry?.attributes?.position) return;

    // Use the live app params first. poolGroup.userData.poolParams is a build-time
    // snapshot and can lag behind the active Bench Seat / Steps Only toggle during
    // slider previews.
    const params = this.poolParams || this.poolGroup.userData?.poolParams || {};
    const clampedShallow = Math.max(0.5, Number(params.shallow) || 0.5);
    const clampedDeep = Math.max(clampedShallow, Number(params.deep) || clampedShallow);

    // Determine pool axis start/end from outerPts bbox if available
    let axisStartX = 0;
    let axisEndX = 1;

    const outerPts = this.poolGroup.userData?.outerPts;
    if (Array.isArray(outerPts) && outerPts.length) {
      let minX = Infinity;
      let maxX = -Infinity;
      for (const p of outerPts) {
        const x = p?.x;
        if (!isFinite(x)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      if (isFinite(minX) && isFinite(maxX) && maxX > minX) {
        axisStartX = minX;
        axisEndX = maxX;
      }
    } else {
      // fallback: floor bbox in world
      if (!floor.geometry.boundingBox) floor.geometry.computeBoundingBox();
      const bb = floor.geometry.boundingBox;
      const fx = floor.position?.x || 0;
      axisStartX = bb.min.x + fx;
      axisEndX = bb.max.x + fx;
    }

    // Decide where the shallow-to-deep transition starts based on the entry-step mode.
    // Steps Only keeps the transition at the entry wall. Bench Seat starts the
    // transition from the front edge of the second/full-width bench only, so
    // extra lower steps do not push the transition deeper into the pool.
    const stepBenchMode = params?.stepBenchMode === "stepsOnly" ? "stepsOnly" : "bench";
    if (stepBenchMode === "stepsOnly") {
      originX = axisStartX;
    } else {
      let benchFrontX = NaN;
      for (const step of steps) {
        const idx = Number(step?.userData?.stepIndex);
        if (idx !== 1) continue;
        const geo = step?.geometry;
        if (!geo?.attributes?.position) continue;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const bb = geo.boundingBox;
        const sx = step.scale?.x ?? 1;
        const lenX = (bb.max.x - bb.min.x) * sx;
        const cx = step.position?.x ?? 0;
        benchFrontX = cx + lenX * 0.5;
        break;
      }
      if (isFinite(benchFrontX)) originX = benchFrontX;
    }

    // If originX is outside the pool span, clamp defensively
    originX = THREE.MathUtils.clamp(originX, axisStartX, axisEndX);

    const fullLen = axisEndX - originX;

    let sFlat = Number(params.shallowFlat) || 0;
    let dFlat = Number(params.deepFlat) || 0;

    const maxFlats = Math.max(0, fullLen - 0.01);
    if (sFlat + dFlat > maxFlats) {
      const scale = (sFlat + dFlat) > 0 ? (maxFlats / (sFlat + dFlat)) : 0;
      sFlat *= scale;
      dFlat *= scale;
    }

    const slopeLen = Math.max(0.01, fullLen - sFlat - dFlat);

    // Build step footprints (world-space AABBs + bottom z)
    const stepBoxes = [];
    for (const step of steps) {
      const geo = step?.geometry;
      if (!geo?.attributes?.position) continue;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox;

      const sx = step.scale?.x ?? 1;
      const sy = step.scale?.y ?? 1;
      const sz = step.scale?.z ?? 1;

      const lenX = (bb.max.x - bb.min.x) * sx;
      const lenY = (bb.max.y - bb.min.y) * sy;
      const lenZ = (bb.max.z - bb.min.z) * sz;

      const cx = step.position?.x ?? 0;
      const cy = step.position?.y ?? 0;
      const cz = step.position?.z ?? 0;

      const minX = cx - lenX * 0.5;
      const maxX = cx + lenX * 0.5;
      const minY = cy - lenY * 0.5;
      const maxY = cy + lenY * 0.5;

      const bottomZ = cz - lenZ * 0.5;

      stepBoxes.push({ minX, maxX, minY, maxY, bottomZ });
    }

    const pos = floor.geometry.attributes.position;
    const fx = floor.position?.x || 0;
    const fy = floor.position?.y || 0;

    for (let i = 0; i < pos.count; i++) {
      const worldX = pos.getX(i) + fx;
      const worldY = pos.getY(i) + fy;

      // Base rectangle-style floor depth at X (with new originX)
      let dx = worldX - originX;
      if (dx < 0) dx = 0;

      let z;
      if (dx <= sFlat) {
        z = -clampedShallow;
      } else if (dx >= fullLen - dFlat) {
        z = -clampedDeep;
      } else {
        const t = (dx - sFlat) / slopeLen;
        z = -(clampedShallow + t * (clampedDeep - clampedShallow));
      }

      // Cutout/raise under steps: in Bench Seat mode, raise the floor under
      // the bench/steps so the floor meets their underside. In Steps Only mode,
      // do NOT let any step footprint move or flatten the floor profile; the
      // shallow-to-deep transition must start at the entry wall and continue
      // beneath the loose step tiers.
      if (stepBenchMode !== "stepsOnly") {
        for (const b of stepBoxes) {
          if (worldX >= b.minX && worldX <= b.maxX && worldY >= b.minY && worldY <= b.maxY) {
            z = Math.max(z, b.bottomZ);
          }
        }
      }

      pos.setZ(i, z);
    }

    pos.needsUpdate = true;
    floor.geometry.computeVertexNormals();

    // Persist for debugging / other systems
    this.poolGroup.userData.originX = originX;
    this.poolGroup.userData.stepFootprintLen = Math.max(0, originX - axisStartX);

    // Re-UV floor too (slope moved, and floor changed under steps)
    this.updateScaledBoxTilingUVs(floor);
  }

  // --------------------------------------------------------------
  ghostifyWater() {
    if (!this.poolGroup) return;
    const water = this.poolGroup.userData?.waterMesh;
    if (water) water.visible = false;
  }

  restoreWater() {
    if (!this.poolGroup) return;
    const water = this.poolGroup.userData?.waterMesh;
    if (water) water.visible = true;
  }

  _syncSectionSelectionEffects() {
    if (!this.sectionViewEnabled) return;
    if (this.hoverHighlightMesh) this.hoverHighlightMesh.visible = false;
    if (this.selectedHighlightMesh) this.selectedHighlightMesh.visible = false;
    if (this.hoverWallHighlightMesh) this.hoverWallHighlightMesh.visible = false;
    if (this.selectedWallHighlightMesh) this.selectedWallHighlightMesh.visible = false;
    if (this.hoverSpaHighlight) this.hoverSpaHighlight.visible = false;
    if (this.selectedSpaHighlight) this.selectedSpaHighlight.visible = false;
    this.clearCustomizeWallSelectionHighlights();
  }

  // --------------------------------------------------------------
  // STEP HIGHLIGHT HELPERS
  // --------------------------------------------------------------
  updateHighlightForStep(step, isSelected) {
    if (!this.scene || !step) return;
    if (this.sectionViewEnabled) {
      if (isSelected && this.selectedHighlightMesh) this.selectedHighlightMesh.visible = false;
      if (!isSelected && this.hoverHighlightMesh) this.hoverHighlightMesh.visible = false;
      return;
    }

    const scaleFactor = isSelected ? 1.12 : 1.06;
    const opacity = isSelected ? 0.45 : 0.3;

    let highlightMesh = isSelected
      ? this.selectedHighlightMesh
      : this.hoverHighlightMesh;

    if (!highlightMesh) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffff66,
        transparent: true,
        opacity,
        depthWrite: false
      });

      highlightMesh = new THREE.Mesh(step.geometry.clone(), mat);
      highlightMesh.renderOrder = 999;
      this.scene.add(highlightMesh);

      if (isSelected) this.selectedHighlightMesh = highlightMesh;
      else this.hoverHighlightMesh = highlightMesh;
    } else {
      if (highlightMesh.geometry) highlightMesh.geometry.dispose();
      highlightMesh.geometry = step.geometry.clone();
      highlightMesh.material.opacity = opacity;
    }

    step.updateWorldMatrix?.(true, false);
    const _stepPos = new THREE.Vector3();
    const _stepQuat = new THREE.Quaternion();
    const _stepScale = new THREE.Vector3();
    step.matrixWorld.decompose(_stepPos, _stepQuat, _stepScale);

    highlightMesh.position.copy(_stepPos);
    highlightMesh.quaternion.copy(_stepQuat);
    highlightMesh.scale.copy(_stepScale).multiplyScalar(scaleFactor);
    highlightMesh.visible = true;
  }

  clearHoverHighlight() {
    if (this.hoverHighlightMesh) this.hoverHighlightMesh.visible = false;
    this.hoveredStep = null;
  }

  clearSelectedHighlight() {
    if (this.selectedHighlightMesh) this.selectedHighlightMesh.visible = false;
    this.selectedStep = null;
  }

  // --------------------------------------------------------------
  // WALL HIGHLIGHT HELPERS (blue)
  // --------------------------------------------------------------
  updateHighlightForWall(wall, isSelected) {
    if (!this.scene || !wall) return;
    if (this.sectionViewEnabled) {
      if (isSelected && this.selectedWallHighlightMesh) this.selectedWallHighlightMesh.visible = false;
      if (!isSelected && this.hoverWallHighlightMesh) this.hoverWallHighlightMesh.visible = false;
      return;
    }

    const scaleFactor = isSelected ? 1.08 : 1.04;
    const opacity = isSelected ? 0.5 : 0.3;

    let highlightMesh = isSelected
      ? this.selectedWallHighlightMesh
      : this.hoverWallHighlightMesh;

    if (!highlightMesh) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x66aaff,
        transparent: true,
        opacity,
        depthWrite: false
      });

      highlightMesh = new THREE.Mesh(wall.geometry.clone(), mat);
      highlightMesh.renderOrder = 998;
      this.scene.add(highlightMesh);

      if (isSelected) this.selectedWallHighlightMesh = highlightMesh;
      else this.hoverWallHighlightMesh = highlightMesh;
    } else {
      if (highlightMesh.geometry) highlightMesh.geometry.dispose();
      highlightMesh.geometry = wall.geometry.clone();
      highlightMesh.material.opacity = opacity;
    }

    wall.updateWorldMatrix?.(true, false);
    const _wallPos = new THREE.Vector3();
    const _wallQuat = new THREE.Quaternion();
    const _wallScale = new THREE.Vector3();
    wall.matrixWorld.decompose(_wallPos, _wallQuat, _wallScale);

    highlightMesh.position.copy(_wallPos);
    highlightMesh.quaternion.copy(_wallQuat);
    highlightMesh.scale.copy(_wallScale).multiplyScalar(scaleFactor);
    highlightMesh.visible = true;
  }

  clearWallHoverHighlight() {
    if (this.hoverWallHighlightMesh) {
      this.hoverWallHighlightMesh.visible = false;
    }
    this.hoveredWall = null;
  }

  clearWallSelectedHighlight() {
    if (this.selectedWallHighlightMesh) {
      this.selectedWallHighlightMesh.visible = false;
    }
    this.selectedWall = null;
    this._disposeWallRaisePrompt?.();

    // Also reset wall UI slider directly (defensive, in case UI.js
    // is not listening to events)
    const row = document.getElementById("wallRaiseRow");
    const slider = document.getElementById("wallRaise");
    const val = document.getElementById("wallRaise-val");

    if (row) row.style.display = "none";
    if (slider) {
      slider.disabled = true;
      slider.value = "0";
    }
    if (val) val.textContent = "0.00 m";
    this._notifyDesignerStateChanged?.();
  }


  updateCustomizeSelectionHighlights() {
    if (!this.scene) return;
    if (this.sectionViewEnabled) {
      this.clearCustomizeWallSelectionHighlights();
      return;
    }

    while (this.customizeSelectionHighlightMeshes.length < this.customizeWallSelections.length) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x66aaff,
        transparent: true,
        opacity: 0.45,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(undefined, mat);
      mesh.renderOrder = 999;
      mesh.visible = false;
      this.scene.add(mesh);
      this.customizeSelectionHighlightMeshes.push(mesh);
    }

    this.customizeSelectionHighlightMeshes.forEach((mesh, index) => {
      const sel = this.customizeWallSelections[index];
      if (!sel?.wall) {
        mesh.visible = false;
        return;
      }
      if (mesh.geometry) mesh.geometry.dispose();
      mesh.geometry = sel.wall.geometry.clone();
      mesh.position.copy(sel.wall.position);
      mesh.rotation.copy(sel.wall.rotation);
      mesh.scale.copy(sel.wall.scale).multiplyScalar(1.08);
      mesh.visible = true;
    });
  }

  clearCustomizeWallSelectionHighlights() {
    this.customizeSelectionHighlightMeshes.forEach((mesh) => {
      if (mesh) mesh.visible = false;
    });
  }

  clearCustomizePreview() {
    this.customizePreview = null;
    if (this.customizePreviewLine) {
      this.customizePreviewLine.visible = false;
    }
    this._disposeCustomizeRadiusHandle?.();
    const confirmBtn = document.getElementById("customizeConfirmBtn");
    if (confirmBtn) confirmBtn.style.display = "none";
  }

  // --------------------------------------------------------------
  // STEP SELECTION (hover + double-click)
  // --------------------------------------------------------------

  _getLShapeBoundaryPointsFromParams(params = this.poolParams) {
    if (!params || params.shape !== "L") return null;
    const length = Math.max(0.1, Number(params.length) || 0);
    const width = Math.max(0.1, Number(params.width) || 0);
    const halfL = length * 0.5;
    const halfW = width * 0.5;
    const notchFracL = Number.isFinite(Number(params.notchLengthX)) ? Number(params.notchLengthX) : 0.4;
    const notchFracW = Number.isFinite(Number(params.notchWidthY)) ? Number(params.notchWidthY) : 0.45;
    const notchL = THREE.MathUtils.clamp(length * notchFracL, 0.6, Math.max(0.6, length - 0.6));
    const notchW = THREE.MathUtils.clamp(width * notchFracW, 0.6, Math.max(0.6, width - 0.6));
    return [
      new THREE.Vector2(-halfL, -halfW),
      new THREE.Vector2(halfL, -halfW),
      new THREE.Vector2(halfL, halfW),
      new THREE.Vector2(halfL - notchL, halfW),
      new THREE.Vector2(halfL - notchL, halfW - notchW),
      new THREE.Vector2(-halfL, halfW - notchW)
    ];
  }

  _polygonSignedArea2D(points) {
    if (!Array.isArray(points) || points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    return area * 0.5;
  }

  _getLShapeWallCandidates(params = this.poolParams) {
    const pts = this._getLShapeBoundaryPointsFromParams(params);
    if (!pts) return [];
    const ccw = this._polygonSignedArea2D(pts) > 0;
    const minSpan = Math.max(0.95, 0.9 + 0.05);
    const candidates = [];

    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (!Number.isFinite(length) || length < minSpan) continue;

      const isVertical = Math.abs(dx) <= 1e-6;
      const isHorizontal = Math.abs(dy) <= 1e-6;
      if (!isVertical && !isHorizontal) continue;

      const tangentX = dx / length;
      const tangentY = dy / length;
      const inwardX = ccw ? -tangentY : tangentY;
      const inwardY = ccw ? tangentX : -tangentX;

      let wall, axis, inwardSign, wallCoord, spanMin, spanMax, rotationZ;
      if (isVertical) {
        inwardSign = inwardX >= 0 ? 1 : -1;
        wall = inwardSign > 0 ? "west" : "east";
        axis = "x";
        wallCoord = a.x;
        spanMin = Math.min(a.y, b.y);
        spanMax = Math.max(a.y, b.y);
        rotationZ = Math.atan2(inwardY, inwardX);
      } else {
        inwardSign = inwardY >= 0 ? 1 : -1;
        wall = inwardSign > 0 ? "south" : "north";
        axis = "y";
        wallCoord = a.y;
        spanMin = Math.min(a.x, b.x);
        spanMax = Math.max(a.x, b.x);
        rotationZ = Math.atan2(inwardY, inwardX);
      }

      candidates.push({
        edgeIndex: i,
        a,
        b,
        length,
        wall,
        axis,
        inwardSign,
        wallCoord,
        spanMin,
        spanMax,
        rotationZ
      });
    }

    return candidates;
  }

  _distancePointToSegment2D(point, a, b) {
    const px = Number(point?.x);
    const py = Number(point?.y);
    if (!Number.isFinite(px) || !a || !b) return Infinity;
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    if (len2 <= 1e-10) return Math.hypot(px - a.x, py - a.y);
    const t = THREE.MathUtils.clamp(((px - a.x) * vx + (py - a.y) * vy) / len2, 0, 1);
    const qx = a.x + vx * t;
    const qy = a.y + vy * t;
    return Math.hypot(px - qx, py - qy);
  }

  _getNearestLShapeStepWallFromPoint(point) {
    const candidates = this._getLShapeWallCandidates?.(this.poolParams) || [];
    let best = null;
    let bestDistance = Infinity;
    for (const candidate of candidates) {
      const d = this._distancePointToSegment2D(point, candidate.a, candidate.b);
      if (d < bestDistance) {
        bestDistance = d;
        best = candidate;
      }
    }
    return best;
  }

  _getNearestBoxStepWallFromPoint(point) {
    if (!point || !this.poolParams) return null;
    const L = Math.max(0.1, Number(this.poolParams.length) || 0.1);
    const W = Math.max(0.1, Number(this.poolParams.width) || 0.1);
    const halfL = L * 0.5;
    const halfW = W * 0.5;

    const candidates = [
      { wall: "west",  a: new THREE.Vector2(-halfL, -halfW), b: new THREE.Vector2(-halfL,  halfW), edgeIndex: null },
      { wall: "east",  a: new THREE.Vector2( halfL, -halfW), b: new THREE.Vector2( halfL,  halfW), edgeIndex: null },
      { wall: "south", a: new THREE.Vector2(-halfL, -halfW), b: new THREE.Vector2( halfL, -halfW), edgeIndex: null },
      { wall: "north", a: new THREE.Vector2(-halfL,  halfW), b: new THREE.Vector2( halfL,  halfW), edgeIndex: null }
    ];

    let best = null;
    let bestDistance = Infinity;
    for (const candidate of candidates) {
      const d = this._distancePointToSegment2D(point, candidate.a, candidate.b);
      if (d < bestDistance) {
        bestDistance = d;
        best = candidate;
      }
    }
    return best;
  }

  _getNearestStepWallFromPoint(point) {
    if (!point || !this.poolParams) return null;
    if (this.poolParams.shape === "L") return this._getNearestLShapeStepWallFromPoint(point);
    return this._getNearestBoxStepWallFromPoint(point);
  }

  _getBoxWallFrame(wall) {
    if (!this.poolParams) return null;
    const L = Math.max(0.1, Number(this.poolParams.length) || 0.1);
    const W = Math.max(0.1, Number(this.poolParams.width) || 0.1);
    const halfL = L * 0.5;
    const halfW = W * 0.5;
    if (wall === "east") return { wall, axis: "x", inwardSign: -1, wallCoord: halfL, spanMin: -halfW, spanMax: halfW, rotationZ: Math.PI };
    if (wall === "south") return { wall, axis: "y", inwardSign: 1, wallCoord: -halfW, spanMin: -halfL, spanMax: halfL, rotationZ: Math.PI * 0.5 };
    if (wall === "north") return { wall, axis: "y", inwardSign: -1, wallCoord: halfW, spanMin: -halfL, spanMax: halfL, rotationZ: -Math.PI * 0.5 };
    return { wall: "west", axis: "x", inwardSign: 1, wallCoord: -halfL, spanMin: -halfW, spanMax: halfW, rotationZ: 0 };
  }

  _getStepWallFrameForTarget(target) {
    if (!target) return null;
    if (this.poolParams?.shape === "L") {
      const c = (this._getLShapeWallCandidates?.(this.poolParams) || []).find((it) => it.edgeIndex === target.edgeIndex);
      if (c) {
        return {
          wall: c.wall,
          axis: c.axis,
          inwardSign: c.inwardSign,
          wallCoord: c.wallCoord,
          spanMin: c.spanMin,
          spanMax: c.spanMax,
          rotationZ: c.rotationZ,
          edgeIndex: c.edgeIndex
        };
      }
    }
    return this._getBoxWallFrame(target.wall);
  }

  _clearStepWallDragPreview() {
    if (this.stepWallDragPreviewGroup?.parent) {
      this.stepWallDragPreviewGroup.parent.remove(this.stepWallDragPreviewGroup);
    }
    this.stepWallDragPreviewGroup = null;
  }

  _ensureStepWallDragPreview(drag) {
    if (!drag || this.stepWallDragPreviewGroup || !this.poolGroup) return;
    const group = new THREE.Group();
    group.name = "step-wall-drag-preview";
    drag.previewItems = [];

    const sourceSteps = [];
    this.poolGroup.traverse((o) => {
      if (o?.userData?.isStep && !o.userData?.isStepAddon) sourceSteps.push(o);
    });
    sourceSteps.sort((a, b) => (Number(a.userData?.stepIndex) || 0) - (Number(b.userData?.stepIndex) || 0));

    for (const source of sourceSteps) {
      const preview = source.clone();
      if (source.geometry) preview.geometry = source.geometry;
      if (source.material?.clone) {
        preview.material = source.material.clone();
        preview.material.transparent = true;
        preview.material.opacity = 0.45;
        preview.material.depthWrite = false;
      }
      preview.visible = false;
      preview.renderOrder = 10;
      preview.userData = { ...source.userData, isPreview: true };
      preview.position.copy(source.position);
      preview.rotation.copy(source.rotation);
      preview.scale.copy(source.scale);
      group.add(preview);
      drag.previewItems.push({ source, preview });
    }

    this.stepWallDragPreviewGroup = group;
    this.poolGroup.add(group);
  }

  _updateStepWallDragPreview(target, drag = this.stepWallDrag) {
    if (!drag || !target) return;
    this._ensureStepWallDragPreview(drag);
    const previewGroup = this.stepWallDragPreviewGroup;
    if (!previewGroup || !drag.previewItems?.length) return;

    const targetFrame = this._getStepWallFrameForTarget(target);
    const sourceFrame = drag.sourceFrame || this._getStepWallFrameForTarget(drag.sourceTarget);
    if (!targetFrame || !sourceFrame) return;

    const sameWall = this.poolParams?.shape === "L"
      ? Number(target.edgeIndex) === Number(drag.sourceTarget?.edgeIndex)
      : String(target.wall) === String(drag.sourceTarget?.wall);

    if (sameWall) {
      previewGroup.visible = false;
      for (const item of drag.previewItems) item.preview.visible = false;
      return;
    }

    const sourceCenter = (Number(sourceFrame.spanMin) + Number(sourceFrame.spanMax)) * 0.5;
    const targetCenter = (Number(targetFrame.spanMin) + Number(targetFrame.spanMax)) * 0.5;

    const locals = drag.previewItems.map(({ source }) => {
      const p = source.position;
      const run = sourceFrame.axis === "x"
        ? sourceFrame.inwardSign * (p.x - sourceFrame.wallCoord)
        : sourceFrame.inwardSign * (p.y - sourceFrame.wallCoord);
      const along = sourceFrame.axis === "x" ? p.y : p.x;
      return { run, alongLocal: along - sourceCenter, z: p.z, rotZ: source.rotation.z };
    });

    let minAlong = Infinity;
    let maxAlong = -Infinity;
    for (const loc of locals) {
      const along = targetCenter + loc.alongLocal;
      minAlong = Math.min(minAlong, along);
      maxAlong = Math.max(maxAlong, along);
    }
    let shift = 0;
    if (minAlong < targetFrame.spanMin) shift = targetFrame.spanMin - minAlong;
    if (maxAlong + shift > targetFrame.spanMax) shift += targetFrame.spanMax - (maxAlong + shift);

    const deltaRot = (Number(targetFrame.rotationZ) || 0) - (Number(sourceFrame.rotationZ) || 0);

    drag.previewItems.forEach((item, index) => {
      const loc = locals[index];
      const along = targetCenter + loc.alongLocal + shift;
      const preview = item.preview;
      if (targetFrame.axis === "x") {
        preview.position.set(
          targetFrame.wallCoord + targetFrame.inwardSign * loc.run,
          along,
          loc.z
        );
      } else {
        preview.position.set(
          along,
          targetFrame.wallCoord + targetFrame.inwardSign * loc.run,
          loc.z
        );
      }
      preview.rotation.z = loc.rotZ + deltaRot;
      preview.visible = true;
    });
    previewGroup.visible = true;
  }

  async _finishLShapeStepWallDrag(event) {
    const drag = this.stepWallDrag;
    if (!drag) return;

    const dom = this.renderer?.domElement;
    try { dom?.releasePointerCapture?.(event.pointerId); } catch {}

    this.stepWallDrag = null;
    dom && (dom.style.cursor = "");
    this._clearStepWallDragPreview?.();
    if (this.controls && drag.previousControlsEnabled !== null) {
      this.controls.enabled = drag.previousControlsEnabled;
    }

    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();

    if (!drag.moved || !drag.target) return;

    this.captureUndoState?.("Move entry steps");

    if (this.poolParams?.shape === "L") {
      this.poolParams.lshapeStepWallIndex = drag.target.edgeIndex;
    }
    this.poolParams.stepWall = drag.target.wall;

    const selectedStepIndex = Number.isFinite(Number(this.selectedStep?.userData?.stepIndex))
      ? Number(this.selectedStep.userData.stepIndex)
      : drag.selectedStepIndex;

    this.clearHoverHighlight?.();
    if (this.selectedHighlightMesh) this.selectedHighlightMesh.visible = false;
    this.selectedStep = null;

    await this.rebuildPoolForCurrentShape();

    if (Number.isFinite(selectedStepIndex) && this.poolGroup) {
      let replacementStep = null;
      this.poolGroup.traverse((o) => {
        if (
          !replacementStep &&
          o?.userData?.isStep &&
          !o.userData.isStepAddon &&
          Number(o.userData.stepIndex) === selectedStepIndex
        ) {
          replacementStep = o;
        }
      });
      if (replacementStep) {
        this.selectedStep = replacementStep;
        this.updateHighlightForStep?.(replacementStep, true);
        this.ghostifyWater?.();
      }
    }

  }


  _getStepNosingHit(step, worldPoint) {
    if (!step?.geometry || !worldPoint) return null;
    if (!step.geometry.boundingBox) step.geometry.computeBoundingBox();
    const bbox = step.geometry.boundingBox;
    if (!bbox) return null;

    const local = step.worldToLocal(worldPoint.clone());
    const run = Math.max(0.001, bbox.max.x - bbox.min.x);
    const width = Math.max(0.001, bbox.max.y - bbox.min.y);
    const edgeTol = Math.min(0.12, Math.max(0.045, Math.min(run, width) * 0.18));
    const sideTol = Math.min(0.08, Math.max(0.025, width * 0.08));
    const frontSideTol = Math.min(0.08, Math.max(0.025, run * 0.08));

    const withinWidthSpan = local.y >= bbox.min.y - sideTol && local.y <= bbox.max.y + sideTol;
    const withinRunSpan = local.x >= bbox.min.x - frontSideTol && local.x <= bbox.max.x + frontSideTol;

    const rot = Number(step.rotation?.z) || 0;
    const runAxis = new THREE.Vector3(Math.cos(rot), Math.sin(rot), 0).normalize();
    const widthAxisPositive = new THREE.Vector3(-Math.sin(rot), Math.cos(rot), 0).normalize();
    const wall = ["west", "east", "north", "south"].includes(step.userData?.stepWall)
      ? step.userData.stepWall
      : (["west", "east", "north", "south"].includes(this.poolParams?.stepWall) ? this.poolParams.stepWall : "west");

    const runCursor = wall === "north" || wall === "south" ? "ns-resize" : "ew-resize";
    const widthCursor = wall === "north" || wall === "south" ? "ew-resize" : "ns-resize";

    const nearFront = Math.abs(local.x - bbox.max.x) <= edgeTol && withinWidthSpan;
    if (nearFront) {
      return { step, local, axis: runAxis, cursor: runCursor, mode: "run" };
    }

    const nearPositiveSide = Math.abs(local.y - bbox.max.y) <= edgeTol && withinRunSpan;
    if (nearPositiveSide) {
      return { step, local, axis: widthAxisPositive, cursor: widthCursor, mode: "width" };
    }

    const nearNegativeSide = Math.abs(local.y - bbox.min.y) <= edgeTol && withinRunSpan;
    if (nearNegativeSide) {
      return { step, local, axis: widthAxisPositive.clone().multiplyScalar(-1), cursor: widthCursor, mode: "width" };
    }

    return null;
  }

  _findStepNosingHitFromPointer(event, steps = null) {
    if (!this.poolGroup || !this.camera || !this.renderer) return null;
    const dom = this.renderer.domElement;
    const rect = dom.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, this.camera);

    const stepMeshes = Array.isArray(steps) ? steps : [];
    if (!stepMeshes.length) {
      this.poolGroup.traverse((o) => o.userData?.isStep && !o.userData?.isStepAddon && stepMeshes.push(o));
    }

    const hit = stepMeshes.length ? ray.intersectObjects(stepMeshes, true) : [];
    if (!hit.length) return null;

    // Use the closest step hit and test whether that actual point lies on the
    // front nosing/edge band. This avoids accidental push/pull from the middle
    // of a tread, where click-hold should still move the full step set to a wall.
    const step = hit[0].object;
    const nosing = this._getStepNosingHit(step, hit[0].point);
    return nosing ? { ...nosing, point: hit[0].point, rayHit: hit[0] } : null;
  }

  _getCurrentStepRunValue(step) {
    const idx = Number(step?.userData?.stepIndex);
    const benchOverride = this.poolParams?.benchStepRuns?.[String(idx)];
    const stepsOnlyOverride = this.poolParams?.stepsOnlyStepRuns?.[String(idx)];
    if (Number.isFinite(Number(benchOverride)) && Number(benchOverride) > 0) return Number(benchOverride);
    if (Number.isFinite(Number(stepsOnlyOverride)) && Number(stepsOnlyOverride) > 0) return Number(stepsOnlyOverride);
    if (!step?.geometry) return Number(this.poolParams?.stepExtension) || 0.3;
    if (!step.geometry.boundingBox) step.geometry.computeBoundingBox();
    const bb = step.geometry.boundingBox;
    const baseRun = bb.max.x - bb.min.x;
    const scaledRun = baseRun * (step.scale?.x ?? 1);
    const savedRun = Number(step.userData?.stepRun);
    if (Number.isFinite(savedRun) && savedRun > 0) return savedRun;
    if (Number.isFinite(scaledRun) && scaledRun > 0) return scaledRun;
    return Number(this.poolParams?.stepExtension) || 0.3;
  }

  _getCurrentStepWidthValue(step) {
    if (!step?.geometry) return Number(this.poolParams?.stepWidth) || 0.9;
    if (!step.geometry.boundingBox) step.geometry.computeBoundingBox();
    const bb = step.geometry.boundingBox;
    const baseWidth = bb.max.y - bb.min.y;
    const scaledWidth = baseWidth * (step.scale?.y ?? 1);
    if (Number.isFinite(scaledWidth) && scaledWidth > 0) return scaledWidth;
    return Number(this.poolParams?.stepWidth) || 0.9;
  }

  _setStepSliderValue(id, value) {
    const slider = document.getElementById(id);
    const output = document.getElementById(`${id}-val`);
    if (slider) slider.value = String(value);
    if (output) output.textContent = Number(value).toFixed(2) + " m";
  }

  _applyStepDirectPushPullValue(mode, value, drag) {
    if (!drag || !this.poolParams) return;

    // Construction dimensions are authored in 50 mm modules. Quantise direct
    // scene drags before applying them so steps and benches cannot accumulate
    // awkward millimetre values that disagree with their sliders.
    value = Math.round((Number(value) || 0) / 0.05) * 0.05;

    const selectedIndex = Number.isFinite(Number(drag.stepIndex))
      ? Number(drag.stepIndex)
      : Number(this.selectedStep?.userData?.stepIndex);
    const stepBenchMode = this.getStepBenchMode?.() === "stepsOnly" ? "stepsOnly" : "bench";

    if (mode === "width") {
      const maxWidth = this.getStepWidthSliderMax?.() ?? Math.max(0.5, Number(this.poolParams?.width) || 5);
      const minWidth = this.isEqualCornerStepShape?.() ? 0.05 : (this.isCenteredCircularStepShape?.() ? 0.2 : 0.5);
      const nextWidth = THREE.MathUtils.clamp(value, minWidth, maxWidth);

      this.poolParams.stepWidth = nextWidth;
      if (this.isEqualCornerStepShape?.()) {
        this.poolParams.diagonalStepSize = nextWidth;
        this.poolParams.stepExtension = nextWidth;
        this._setStepSliderValue("stepExtension", nextWidth);
      } else if (this.isCenteredCircularStepShape?.()) {
        this.poolParams.stepExtension = nextWidth * 0.5;
        this._setStepSliderValue("stepExtension", nextWidth * 0.5);
      }
      this._setStepSliderValue("stepWidth", nextWidth);
    } else {
      const minRun = this.poolParams?.stepShape === "radius" ? 0.3 : 0.05;
      const maxRun = Math.max(1.5, Number(this.poolParams?.length) || 1.5);
      const nextRun = THREE.MathUtils.clamp(value, minRun, maxRun);

      if (this.isCenteredCircularStepShape?.()) {
        const widthMax = this.getStepWidthSliderMax?.() ?? Math.max(0.5, Number(this.poolParams?.width) || 5);
        const radius = THREE.MathUtils.clamp(nextRun, 0.1, widthMax * 0.5);
        this.poolParams.stepExtension = radius;
        this.poolParams.stepWidth = radius * 2;
        this._setStepSliderValue("stepExtension", radius);
        this._setStepSliderValue("stepWidth", radius * 2);
      } else if (this.isEqualCornerStepShape?.() && selectedIndex !== 1) {
        const maxWidth = this.getStepWidthSliderMax?.() ?? 0.6;
        const size = THREE.MathUtils.clamp(nextRun, 0.05, maxWidth);
        this.poolParams.stepWidth = size;
        this.poolParams.diagonalStepSize = size;
        this.poolParams.stepExtension = size;
        this._setStepSliderValue("stepExtension", size);
        this._setStepSliderValue("stepWidth", size);
      } else if (stepBenchMode === "bench") {
        const runs = { ...(this.poolParams.benchStepRuns || {}) };
        runs[String(selectedIndex)] = nextRun;

        if (selectedIndex <= 1) {
          // The upper tread and the full-width bench are wall-backed. If either
          // is pulled forward, the bench depth must carry the chain on rebuild.
          const currentBench = Number(this.poolParams.bench2Extension) || 0.6;
          const bench = selectedIndex === 1
            ? THREE.MathUtils.clamp(nextRun, 0.3, 1.5)
            : Math.max(currentBench, nextRun);
          this.poolParams.bench2Extension = bench;
          runs["1"] = bench;
        }

        this.poolParams.benchStepRuns = runs;
        this._setStepSliderValue("stepExtension", nextRun);
      } else if (stepBenchMode === "stepsOnly") {
        const runs = { ...(this.poolParams.stepsOnlyStepRuns || {}) };
        runs[String(selectedIndex)] = nextRun;
        this.poolParams.stepsOnlyStepRuns = runs;
        this._setStepSliderValue("stepExtension", nextRun);
      } else {
        // Rectangle/radius narrow treads now use stepExtension as their straight
        // run length. Radius corners remain a fixed 300 mm geometry radius in
        // the shape builders; any extra run is straight extension behind it.
        this.poolParams.stepExtension = nextRun;
        this._setStepSliderValue("stepExtension", nextRun);
      }
    }

    this.poolGroup?.scale?.set?.(1, 1, 1);
    this._live.dirty.add(mode === "width" ? "stepWidth" : "stepExtension");
    this._live.commitNeeded = true;
    this._live.lastInputTs = performance.now ? performance.now() : Date.now();
    this._scheduleAccurateLiveRebuild?.();
    this._scheduleRebuildDebounced?.();
  }

  _startStepNosingPushPull(event, nosingHit) {
    if (!nosingHit?.step || !this.poolGroup) return false;

    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();

    const dom = this.renderer?.domElement;
    const step = nosingHit.step;
    const previousControlsEnabled = this.controls ? this.controls.enabled !== false : null;
    if (this.controls) this.controls.enabled = false;

    this.captureUndoState?.(nosingHit.mode === "width" ? "Push/pull step width" : "Push/pull step nosing");

    this.selectedStep = step;
    this.updateHighlightForStep?.(step, true);
    this.clearHoverHighlight?.();
    this.syncStepWidthSliderLimit?.();
    this.syncStepExtensionSliderForSelectedStep?.();
    this._setLiveDragging?.(true);

    const startRun = this._getCurrentStepRunValue(step);
    const startWidth = this._getCurrentStepWidthValue(step);
    const mode = nosingHit.mode === "width" ? "width" : "run";

    this.stepNosingDrag = {
      pointerId: event.pointerId,
      stepIndex: Number(step.userData?.stepIndex),
      startPoint: nosingHit.point?.clone?.() || this._screenToPlanePoint(event.clientX, event.clientY, 0),
      axis: nosingHit.axis?.clone?.() || new THREE.Vector3(1, 0, 0),
      mode,
      startValue: mode === "width" ? startWidth : startRun,
      previousControlsEnabled
    };

    dom && (dom.style.cursor = nosingHit.cursor || (mode === "width" ? "ns-resize" : "ew-resize"));
    dom?.setPointerCapture?.(event.pointerId);
    return true;
  }

  async _finishStepNosingPushPull(event) {
    const drag = this.stepNosingDrag;
    if (!drag) return;

    const dom = this.renderer?.domElement;
    try { dom?.releasePointerCapture?.(event.pointerId); } catch {}

    this.stepNosingDrag = null;
    dom && (dom.style.cursor = "");
    if (this.controls && drag.previousControlsEnabled !== null) {
      this.controls.enabled = drag.previousControlsEnabled;
    }

    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();

    await this._setLiveDragging?.(false);
    this.syncStepWidthSliderLimit?.();
    this.syncStepExtensionSliderForSelectedStep?.();
    this.updateHighlightForStep?.(this.selectedStep, true);
    this._notifyDesignerStateChanged?.();
  }

  _updateStepNosingPushPull(event) {
    const drag = this.stepNosingDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();

    const point = this._screenToPlanePoint(event.clientX, event.clientY, 0);
    if (!point || !drag.startPoint || !drag.axis) return;

    const delta = point.clone().sub(drag.startPoint).dot(drag.axis);
    const next = drag.startValue + delta;
    this._applyStepDirectPushPullValue(drag.mode, next, drag);
  }


  _invertStepSide(pos) {
    if (pos === "left") return "right";
    if (pos === "right") return "left";
    return "center";
  }

  _getStepPlacementPositionForWallPosition(userPosition, wall = this.poolParams?.stepWall) {
    const pos = userPosition === "left" || userPosition === "right" ? userPosition : "center";
    return (wall === "east" || wall === "south") ? this._invertStepSide(pos) : pos;
  }

  _getStepUserPositionForWallPlacement(placementPosition, wall = this.poolParams?.stepWall) {
    const pos = placementPosition === "left" || placementPosition === "right" ? placementPosition : "center";
    return (wall === "east" || wall === "south") ? this._invertStepSide(pos) : pos;
  }

  _isCloseEnoughForStepPositionSlide(worldPoint = null) {
    if (!this.camera || !this.poolParams) return false;

    const maxPoolSpan = Math.max(
      1,
      Number(this.poolParams.length) || 0,
      Number(this.poolParams.width) || 0
    );

    // Orthographic zoom is explicit. Treat the close, detailed editing view as
    // the side-to-side step-position mode; the normal overview remains the
    // wall pickup/drop mode.
    if (this.camera.isOrthographicCamera) {
      const z = Number(this.camera.zoom) || 1;
      return z >= 1.25;
    }

    const point = worldPoint?.clone?.() || this.selectedStep?.getWorldPosition?.(new THREE.Vector3()) || this.controls?.target;
    if (!point) return false;

    const distance = this.camera.position.distanceTo(point);
    const closeThreshold = THREE.MathUtils.clamp(maxPoolSpan * 1.65, 7.0, 14.0);
    return distance <= closeThreshold;
  }

  _getStepPositionFromAlongValue(along, frame) {
    if (!frame) return null;
    const spanMin = Number(frame.spanMin);
    const spanMax = Number(frame.spanMax);
    if (!Number.isFinite(spanMin) || !Number.isFinite(spanMax) || spanMax <= spanMin) return null;

    const t = THREE.MathUtils.clamp((Number(along) - spanMin) / (spanMax - spanMin), 0, 1);
    const placementPosition = t < 1 / 3 ? "left" : (t > 2 / 3 ? "right" : "center");
    return this._getStepUserPositionForWallPlacement(placementPosition, frame.wall);
  }

  _getStepWidthForPositionPreview(step) {
    if (!step) return 0.9;
    const savedWidth = Number(step.userData?.stepWidth);
    if (Number.isFinite(savedWidth) && savedWidth > 0) return savedWidth;
    if (step.geometry) {
      if (!step.geometry.boundingBox) step.geometry.computeBoundingBox();
      const bb = step.geometry.boundingBox;
      const base = Number(bb?.max?.y) - Number(bb?.min?.y);
      const scaled = base * (Number(step.scale?.y) || 1);
      if (Number.isFinite(scaled) && scaled > 0) return scaled;
    }
    return Number(this.poolParams?.stepWidth) || 0.9;
  }

  _getStepPreviewCenterAlongForPosition(position, frame, width, forceFullWidth = false) {
    if (!frame) return 0;
    const spanMin = Number(frame.spanMin);
    const spanMax = Number(frame.spanMax);
    const fullWidth = Math.max(0.05, spanMax - spanMin);
    const w = forceFullWidth ? fullWidth : THREE.MathUtils.clamp(Number(width) || 0.9, 0.05, fullWidth);
    const placement = this._getStepPlacementPositionForWallPosition(position, frame.wall);
    if (placement === "left") return spanMin + w * 0.5;
    if (placement === "right") return spanMax - w * 0.5;
    return (spanMin + spanMax) * 0.5;
  }

  _previewStepPositionSlide(position, drag = this.stepPositionDrag) {
    if (!drag?.frame || !this.poolGroup) return;
    const frame = drag.frame;
    const stepBenchMode = this.getStepBenchMode?.() === "stepsOnly" ? "stepsOnly" : "bench";
    const fullAlong = (Number(frame.spanMin) + Number(frame.spanMax)) * 0.5;

    const steps = [];
    this.poolGroup.traverse((o) => {
      if (o?.userData?.isStep && !o.userData?.isStepAddon) steps.push(o);
    });

    steps.forEach((step) => {
      const idx = Number(step.userData?.stepIndex);
      const isFullBench = stepBenchMode === "bench" && idx === 1;
      const width = this._getStepWidthForPositionPreview(step);
      const along = isFullBench
        ? fullAlong
        : this._getStepPreviewCenterAlongForPosition(position, frame, width, false);

      if (frame.axis === "x") {
        step.position.y = along;
      } else {
        step.position.x = along;
      }
      step.userData.stepPosition = position;
    });
  }

  _startStepPositionSlide(event, step, rayHit) {
    if (!step || !this.poolParams || !this.poolGroup) return false;

    const sourceTarget = this.poolParams?.shape === "L"
      ? { wall: String(step.userData?.stepWall || this.poolParams?.stepWall || "west"), edgeIndex: Number(this.poolParams?.lshapeStepWallIndex) }
      : { wall: String(step.userData?.stepWall || this.poolParams?.stepWall || "west"), edgeIndex: null };
    const frame = this._getStepWallFrameForTarget(sourceTarget);
    if (!frame) return false;

    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();

    const previousControlsEnabled = this.controls ? this.controls.enabled !== false : null;
    if (this.controls) this.controls.enabled = false;

    const startPosition = this.poolParams.stepPosition === "left" || this.poolParams.stepPosition === "right"
      ? this.poolParams.stepPosition
      : "center";

    this.stepPositionDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      selectedStepIndex: Number(step.userData?.stepIndex),
      startPosition,
      targetPosition: startPosition,
      previousControlsEnabled,
      frame,
      sourceTarget
    };

    this.selectedStep = step;
    this.updateHighlightForStep?.(step, true);
    this.clearHoverHighlight?.();

    const dom = this.renderer?.domElement;
    if (dom) dom.style.cursor = "move";
    dom?.setPointerCapture?.(event.pointerId);
    return true;
  }

  _updateStepPositionSlide(event) {
    const drag = this.stepPositionDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;

    const point = this._screenToPlanePoint(event.clientX, event.clientY, 0);
    if (!point) return;

    const along = drag.frame.axis === "x" ? point.y : point.x;
    const next = this._getStepPositionFromAlongValue(along, drag.frame);
    if (!next) return;

    drag.targetPosition = next;
    this._previewStepPositionSlide(next, drag);
  }

  async _finishStepPositionSlide(event) {
    const drag = this.stepPositionDrag;
    if (!drag) return;

    const dom = this.renderer?.domElement;
    try { dom?.releasePointerCapture?.(event.pointerId); } catch {}

    this.stepPositionDrag = null;
    if (dom) dom.style.cursor = "";
    if (this.controls && drag.previousControlsEnabled !== null) {
      this.controls.enabled = drag.previousControlsEnabled;
    }

    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();

    const nextPosition = drag.targetPosition === "left" || drag.targetPosition === "right"
      ? drag.targetPosition
      : "center";
    const changed = drag.moved && nextPosition !== drag.startPosition;

    if (!changed && drag.moved) {
      this._previewStepPositionSlide?.(drag.startPosition, drag);
    }

    if (changed) {
      this.captureUndoState?.("Step position");
      this.poolParams.stepPosition = nextPosition;
    }

    const selectedStepIndex = Number.isFinite(Number(this.selectedStep?.userData?.stepIndex))
      ? Number(this.selectedStep.userData.stepIndex)
      : drag.selectedStepIndex;

    if (changed) {
      this.clearHoverHighlight?.();
      if (this.selectedHighlightMesh) this.selectedHighlightMesh.visible = false;
      this.selectedStep = null;
      await this.rebuildPoolForCurrentShape();
    }

    if (Number.isFinite(selectedStepIndex) && this.poolGroup) {
      let replacementStep = null;
      this.poolGroup.traverse((o) => {
        if (
          !replacementStep &&
          o?.userData?.isStep &&
          !o.userData.isStepAddon &&
          Number(o.userData.stepIndex) === selectedStepIndex
        ) {
          replacementStep = o;
        }
      });
      if (replacementStep) {
        this.selectedStep = replacementStep;
        this.updateHighlightForStep?.(replacementStep, true);
        this.ghostifyWater?.();
      }
    }

    this.syncStepWidthSliderLimit?.();
    this.syncStepExtensionSliderForSelectedStep?.();
  }


  _resolveStepSelectionObject(object) {
    let current=object;
    while(current && current!==this.poolGroup){
      if(current?.userData?.isStep && !current.userData?.isStepAddon) return current;
      current=current.parent;
    }
    return object?.userData?.isStep && !object.userData?.isStepAddon ? object : null;
  }

  setupStepSelection() {
    if (!this.renderer || !this.camera) return;
    const dom = this.renderer.domElement;

    // Entry steps can be click-held and dragged to another wall.
    // L-shape uses valid perimeter walls; other pool shapes resolve to the nearest
    // west/east/north/south wall. The selected wall is applied on release.
    dom.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (!this.poolGroup || this.customizeMode) return;
      if (this.poolEditor?.isDragging) return;

      const rect = dom.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(mouse, this.camera);

      const steps = [];
      this.poolGroup.traverse((o) => o.userData?.isStep && !o.userData?.isStepAddon && steps.push(o));
      const hit = steps.length ? ray.intersectObjects(steps, true) : [];
      if (!hit.length) {
        if (this.selectedWall) this.clearWallSelectedHighlight();
        return;
      }

      const step = this._resolveStepSelectionObject(hit[0].object);
      if (!step) return;
      const nosingHit = this._getStepNosingHit?.(step, hit[0].point);
      if (nosingHit && this._startStepNosingPushPull?.(event, { ...nosingHit, step, point: hit[0].point, rayHit: hit[0] })) {
        return;
      }
      if (this._isCloseEnoughForStepPositionSlide?.(hit[0].point)) {
        if (this._startStepPositionSlide?.(event, step, hit[0])) return;
      }

      // A step drag must win over OrbitControls. Capture the pointer and stop
      // the event before the scene can pan/orbit.
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();

      const previousControlsEnabled = this.controls ? this.controls.enabled !== false : null;
      if (this.controls) this.controls.enabled = false;

      const sourceTarget = this.poolParams?.shape === "L"
        ? { wall: String(step.userData?.stepWall || this.poolParams?.stepWall || "west"), edgeIndex: Number(this.poolParams?.lshapeStepWallIndex) }
        : { wall: String(step.userData?.stepWall || this.poolParams?.stepWall || "west"), edgeIndex: null };

      this.stepWallDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        target: null,
        selectedStepIndex: Number(step.userData?.stepIndex),
        previousControlsEnabled,
        sourceTarget,
        sourceFrame: this._getStepWallFrameForTarget(sourceTarget)
      };

      this.selectedStep = step;
      this.updateHighlightForStep?.(step, true);
      this.clearHoverHighlight?.();

      dom.style.cursor = "grabbing";
      dom.setPointerCapture?.(event.pointerId);
    }, true);

    dom.addEventListener("pointermove", (event) => {
      if (this.stepNosingDrag && event.pointerId === this.stepNosingDrag.pointerId) {
        this._updateStepNosingPushPull?.(event);
        return;
      }

      if (this.stepPositionDrag && event.pointerId === this.stepPositionDrag.pointerId) {
        this._updateStepPositionSlide?.(event);
        return;
      }

      const drag = this.stepWallDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;

      // Keep OrbitControls from panning/orbiting while the user is holding a step.
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 8) return;

      drag.moved = true;
      dom.style.cursor = "grabbing";

      const point = this._screenToPlanePoint(event.clientX, event.clientY, 0);
      const target = point ? this._getNearestStepWallFromPoint(point) : null;
      if (target) {
        drag.target = target;
        this._updateStepWallDragPreview?.(target, drag);
      } else {
        this._clearStepWallDragPreview?.();
      }
    }, true);

    dom.addEventListener("pointerup", (event) => {
      if (this.stepNosingDrag && event.pointerId === this.stepNosingDrag.pointerId) {
        this._finishStepNosingPushPull?.(event);
        return;
      }
      if (this.stepPositionDrag && event.pointerId === this.stepPositionDrag.pointerId) {
        this._finishStepPositionSlide?.(event);
        return;
      }
      if (!this.stepWallDrag || event.pointerId !== this.stepWallDrag.pointerId) return;
      this._finishLShapeStepWallDrag(event);
    }, true);

    dom.addEventListener("pointercancel", (event) => {
      if (this.stepNosingDrag && event.pointerId === this.stepNosingDrag.pointerId) {
        this._finishStepNosingPushPull?.(event);
        return;
      }
      if (this.stepPositionDrag && event.pointerId === this.stepPositionDrag.pointerId) {
        this.stepPositionDrag.moved = false;
        this._finishStepPositionSlide?.(event);
        return;
      }
      if (!this.stepWallDrag || event.pointerId !== this.stepWallDrag.pointerId) return;
      this.stepWallDrag.moved = false;
      this._finishLShapeStepWallDrag(event);
    }, true);

    dom.addEventListener("pointerleave", () => {
      if (this.stepNosingDrag || this.stepPositionDrag || this.stepWallDrag) return;
      dom.style.cursor = "";
      this.clearHoverHighlight?.();
    });

    // Hover – highlight only, do not open panel.
    // Show a hand while hovering entry steps because those are draggable wall
    // targets and will temporarily disable OrbitControls on pointerdown.
    dom.addEventListener("pointermove", (event) => {
      if (!this.poolGroup || this.customizeMode) {
        if (!this.stepWallDrag) dom.style.cursor = "";
        return;
      }

      if (this.poolEditor?.isDragging) return;
      if (this.stepPositionDrag) {
        dom.style.cursor = "move";
        return;
      }
      if (this.stepWallDrag) {
        dom.style.cursor = "grabbing";
        return;
      }

      const rect = dom.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      const ray = new THREE.Raycaster();
      ray.setFromCamera(mouse, this.camera);

      const steps = [];
      this.poolGroup.traverse((o) => o.userData?.isStep && !o.userData?.isStepAddon && steps.push(o));

      if (!steps.length) {
        this.clearHoverHighlight();
        dom.style.cursor = "";
        return;
      }

      const hit = ray.intersectObjects(steps, true);
      if (!hit.length) {
        this.clearHoverHighlight();
        dom.style.cursor = "";
        return;
      }

      const step = this._resolveStepSelectionObject(hit[0].object);
      if (!step) { this.clearHoverHighlight(); dom.style.cursor = ""; return; }
      const nosingHover = this._getStepNosingHit?.(step, hit[0].point);
      if (nosingHover?.cursor) {
        dom.style.cursor = nosingHover.cursor;
      } else if (this._isCloseEnoughForStepPositionSlide?.(hit[0].point)) {
        dom.style.cursor = "move";
      } else {
        dom.style.cursor = "grab";
      }

      if (step === this.selectedStep) {
        this.clearHoverHighlight();
        return;
      }

      if (step !== this.hoveredStep) {
        this.hoveredStep = step;
        this.updateHighlightForStep(step, false);
      }
    });

    // Select – pick step, ghost water, open Steps panel
    dom.addEventListener("click", (event) => {
      if (event.button !== 0) return;
      if (!this.poolGroup) return;

      const rect = dom.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      const ray = new THREE.Raycaster();
      ray.setFromCamera(mouse, this.camera);

      const steps = [];
      this.poolGroup.traverse((o) => o.userData?.isStep && !o.userData?.isStepAddon && steps.push(o));

      const hit = steps.length ? ray.intersectObjects(steps, true) : [];

      // If a step is hit, consume this event so wall selection / ripple do not also fire
      if (hit.length) {
        event.stopImmediatePropagation();
      }
      if (!hit.length) {
        const hadSel = !!this.selectedStep;
        this.clearSelectedHighlight();
        if (hadSel) {
          document.dispatchEvent(new CustomEvent("stepSelectionCleared"));
          document.dispatchEvent(new CustomEvent("stepsPanelClosed"));
          this.restoreWater();
        }
        return;
      }

      const step = this._resolveStepSelectionObject(hit[0].object);
      if (!step) return;
      this.selectedStep = step;

      this.updateHighlightForStep(step, true);
      this.clearHoverHighlight();

      // Open Steps panel via UI helper (if present)
      if (window.openPanelFromCode) {
        window.openPanelFromCode("steps");
      }

      // Fire panel-open event so existing listeners (camera zoom, ghost)
      // continue to work as before
      document.dispatchEvent(new CustomEvent("stepsPanelOpened"));

      // ghost water for clearer view of steps
      this.ghostifyWater();

      this.syncStepExtensionSliderForSelectedStep?.();
      document.dispatchEvent(new CustomEvent("stepSelected"));
      this._notifyDesignerInteraction?.("steps");
    });
  }


  getBench2ExtensionValue() {
    const n = Number(this.poolParams?.bench2Extension);
    return Number.isFinite(n) && n > 0 ? n : 0.6;
  }

  getDiagonalStepSizeValue() {
    const cap = this.getBench2ExtensionValue();
    const n = Number(this.poolParams?.diagonalStepSize ?? this.poolParams?.stepWidth);
    const wanted = Number.isFinite(n) && n > 0 ? n : 0.45;
    return THREE.MathUtils.clamp(wanted, 0.25, cap);
  }

  isCenteredCircularStepShape() {
    const pos = this.poolParams?.stepPosition === "left" || this.poolParams?.stepPosition === "right"
      ? this.poolParams.stepPosition
      : "center";
    return this.poolParams?.stepShape === "circular" && pos === "center";
  }

  getStepBenchMode() {
    return this.poolParams?.stepBenchMode === "stepsOnly" ? "stepsOnly" : "bench";
  }

  updateStepBenchModeControls() {
    const mode = this.getStepBenchMode?.() ?? "bench";
    document.querySelectorAll("[data-step-bench-mode]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.stepBenchMode === mode);
    });
  }

  updateCenterCircularModeControls() {
    // Backwards-compatible wrapper for older calls. The bench/steps-only
    // toggle is now a global step layout option, not centre-circular only.
    this.updateStepBenchModeControls?.();
  }

  isEqualCornerStepShape() {
    if (this.poolParams?.stepShape === "diagonal") return true;
    return this.poolParams?.stepShape === "circular" && !this.isCenteredCircularStepShape?.();
  }

  getStepWallSpanMax() {
    const wall = ["west", "east", "north", "south"].includes(this.poolParams?.stepWall) ? this.poolParams.stepWall : "west";
    const span = (wall === "north" || wall === "south")
      ? Number(this.poolParams?.length)
      : Number(this.poolParams?.width);
    return Math.max(0.5, Number.isFinite(span) && span > 0 ? span : 5);
  }

  getStepWidthSliderMax() {
    if (this.isCenteredCircularStepShape?.()) return this.getStepWallSpanMax?.() ?? Math.max(0.5, Number(this.poolParams?.width) || 5);
    // Diagonal/circular corner steps are equal corner footprints. Their cap is
    // the current second/full-width bench extension, not a fixed 600 mm value.
    if (this.isEqualCornerStepShape?.()) return this.getBench2ExtensionValue();
    return this.getStepWallSpanMax?.() ?? Math.max(0.5, Number(this.poolParams?.width) || 5);
  }

  syncStepWidthSliderLimit() {
    const slider = document.getElementById("stepWidth");
    const output = document.getElementById("stepWidth-val");
    const extensionSlider = document.getElementById("stepExtension");
    const extensionOutput = document.getElementById("stepExtension-val");
    if (!slider) return;

    const isDiagonal = this.isEqualCornerStepShape?.();
    const isCenteredCircular = this.isCenteredCircularStepShape?.();
    const maxWidth = this.getStepWidthSliderMax();
    slider.max = String(maxWidth);
    if (isDiagonal) {
      slider.min = "0.25";
    } else if (isCenteredCircular) {
      slider.min = "0.25";
    } else {
      slider.min = "0.5";
    }

    let width = isDiagonal
      ? this.getDiagonalStepSizeValue()
      : Number(this.poolParams.stepWidth);
    if (!Number.isFinite(width) || width <= 0) width = isDiagonal ? 0.45 : (isCenteredCircular ? 1.2 : maxWidth);
    width = THREE.MathUtils.clamp(width, Number(slider.min) || 0.25, maxWidth);
    this.poolParams.stepWidth = width;
    if (isDiagonal) {
      this.poolParams.diagonalStepSize = width;
      this.poolParams.stepExtension = width;
    } else if (isCenteredCircular) {
      // Centre circular steps are true semi-circles: width is the diameter,
      // extension is the radius/projection into the pool.
      this.poolParams.stepExtension = width * 0.5;
    }
    slider.value = String(width);
    if (output) output.textContent = width.toFixed(2) + " m";

    // In Diagonal Corner mode, narrow corner steps use one equal X/Y value,
    // capped by the current second bench extension. If the second bench itself
    // is selected, the extension slider still controls that bench and can grow
    // beyond 600 mm.
    if (extensionSlider && isDiagonal) {
      const selectedIndex = Number(this.selectedStep?.userData?.stepIndex);
      if (selectedIndex === 1) {
        const bench = this.getBench2ExtensionValue();
        extensionSlider.min = "0.3";
        extensionSlider.max = "1.5";
        extensionSlider.value = String(bench);
        if (extensionOutput) extensionOutput.textContent = bench.toFixed(2) + " m";
      } else {
        extensionSlider.min = slider.min;
        extensionSlider.max = String(maxWidth);
        extensionSlider.value = String(width);
        if (extensionOutput) extensionOutput.textContent = width.toFixed(2) + " m";
      }
    } else if (extensionSlider && isCenteredCircular) {
      const radius = width * 0.5;
      extensionSlider.min = "0.25";
      extensionSlider.max = String(maxWidth * 0.5);
      extensionSlider.value = String(radius);
      if (extensionOutput) extensionOutput.textContent = radius.toFixed(2) + " m";
    } else if (extensionSlider) {
      extensionSlider.min = "0.3";
      extensionSlider.max = "1.5";
    }
  }

  syncStepExtensionSliderForSelectedStep() {
    const slider = document.getElementById("stepExtension");
    const output = document.getElementById("stepExtension-val");
    if (!slider) return;

    if (this.isCenteredCircularStepShape?.()) {
      const widthMax = this.getStepWidthSliderMax?.() ?? Math.max(0.5, Number(this.poolParams?.width) || 5);
      const diameter = THREE.MathUtils.clamp(Number(this.poolParams?.stepWidth) || 1.2, 0.2, widthMax);
      const radius = THREE.MathUtils.clamp(Number(this.poolParams?.stepExtension) || diameter * 0.5, 0.1, widthMax * 0.5);
      slider.min = "0.1";
      slider.max = String(widthMax * 0.5);
      slider.value = String(radius);
      if (output) output.textContent = radius.toFixed(2) + " m";
      return;
    }

    if (this.getStepBenchMode?.() === "stepsOnly" && this.selectedStep?.geometry && this.poolGroup) {
      const steps = [];
      this.poolGroup.traverse((o) => {
        if (o.userData && o.userData.isStep && !o.userData.isStepAddon) steps.push(o);
      });
      const sortedSteps = steps
        .slice()
        .sort((a, b) => {
          const ai = Number.isFinite(Number(a.userData?.stepIndex)) ? Number(a.userData.stepIndex) : 0;
          const bi = Number.isFinite(Number(b.userData?.stepIndex)) ? Number(b.userData.stepIndex) : 0;
          return ai - bi;
        });

      const selectedIndex = Number.isFinite(Number(this.selectedStep.userData?.stepIndex))
        ? Number(this.selectedStep.userData.stepIndex)
        : sortedSteps.indexOf(this.selectedStep);

      const getRun = (step) => {
        if (!step?.geometry) return 0;
        if (!step.geometry.boundingBox) step.geometry.computeBoundingBox();
        const bb = step.geometry.boundingBox;
        const baseLen = bb.max.x - bb.min.x;
        const scaledLen = baseLen * (step.scale?.x ?? 1);
        const savedRun = Number(step.userData?.stepRun);
        return Number.isFinite(scaledLen) && scaledLen > 0
          ? scaledLen
          : (Number.isFinite(savedRun) && savedRun > 0 ? savedRun : 0.3);
      };

      const currentRun = getRun(this.selectedStep);
      const previousStep = sortedSteps.find((step) => Number(step.userData?.stepIndex) === selectedIndex - 1);
      const previousRun = previousStep ? getRun(previousStep) : 0;
      const extensionPastPrevious = Math.max(0, currentRun - previousRun);
      const maxLen = Math.max(1.5, Number(this.poolParams?.length) || 1.5);
      slider.min = "0";
      slider.max = String(Math.max(0.05, maxLen - previousRun));
      slider.value = String(extensionPastPrevious);
      if (output) output.textContent = extensionPastPrevious.toFixed(2) + " m";
      return;
    }

    if (this.getStepBenchMode?.() === "bench" && this.selectedStep?.geometry && this.poolGroup && !this.isCenteredCircularStepShape?.()) {
      const steps = [];
      this.poolGroup.traverse((o) => {
        if (o.userData && o.userData.isStep && !o.userData.isStepAddon) steps.push(o);
      });
      if (steps.length) {
        steps.forEach((step) => {
          if (step.geometry && !step.geometry.boundingBox) step.geometry.computeBoundingBox();
        });

        const sortedSteps = steps.slice().sort((a, b) => {
          const ai = Number.isFinite(Number(a.userData?.stepIndex)) ? Number(a.userData.stepIndex) : 0;
          const bi = Number.isFinite(Number(b.userData?.stepIndex)) ? Number(b.userData.stepIndex) : 0;
          return ai - bi;
        });

        let wallX = Infinity;
        const outerPts = this.poolGroup.userData?.outerPts;
        if (Array.isArray(outerPts) && outerPts.length) {
          outerPts.forEach((pt) => {
            const x = Number(pt?.x);
            if (Number.isFinite(x) && x < wallX) wallX = x;
          });
        }
        if (!Number.isFinite(wallX)) {
          sortedSteps.forEach((step) => {
            const bb = step.geometry?.boundingBox;
            if (!bb) return;
            const len = (bb.max.x - bb.min.x) * (step.scale?.x ?? 1);
            const left = (step.position?.x ?? 0) - len * 0.5;
            if (Number.isFinite(left) && left < wallX) wallX = left;
          });
        }

        const getLen = (step) => {
          const bb = step?.geometry?.boundingBox;
          if (!bb) return 0;
          const len = (bb.max.x - bb.min.x) * (step.scale?.x ?? 1);
          const saved = Number(step.userData?.stepRun);
          return Number.isFinite(len) && len > 0 ? len : (Number.isFinite(saved) && saved > 0 ? saved : 0.3);
        };

        const frontEdge = (step) => (step.position?.x ?? 0) + getLen(step) * 0.5;
        const selectedRank = Math.max(0, sortedSteps.indexOf(this.selectedStep));
        const selectedFront = frontEdge(this.selectedStep);
        const previousFront = selectedRank > 0 ? frontEdge(sortedSteps[selectedRank - 1]) : wallX;
        const extensionPastPrevious = Math.max(0, selectedFront - previousFront);
        const maxLen = Math.max(1.5, Number(this.poolParams?.length) || 1.5);
        slider.min = "0";
        slider.max = String(Math.max(0.05, maxLen - Math.max(0, previousFront - wallX)));
        slider.value = String(extensionPastPrevious);
        if (output) output.textContent = extensionPastPrevious.toFixed(2) + " m";
        return;
      }
    }

    if (!this.isEqualCornerStepShape?.()) return;

    const selectedIndex = Number(this.selectedStep?.userData?.stepIndex);
    if (selectedIndex === 1) {
      const bench = this.getBench2ExtensionValue();
      slider.min = "0.3";
      slider.max = "1.5";
      slider.value = String(bench);
      if (output) output.textContent = bench.toFixed(2) + " m";
      return;
    }

    const cap = this.getBench2ExtensionValue();
    const size = this.getDiagonalStepSizeValue();
    slider.min = "0.05";
    slider.max = String(cap);
    slider.value = String(size);
    if (output) output.textContent = size.toFixed(2) + " m";
  }

  setupStepLayoutControls() {
    if (this._stepLayoutControlsReady) return;
    this._stepLayoutControlsReady = true;

    const updateButtons = () => {
      const wall = ["west", "east", "north", "south"].includes(this.poolParams.stepWall) ? this.poolParams.stepWall : "west";
      document.querySelectorAll("[data-step-wall]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.stepWall === wall);
      });

      const pos = this.poolParams.stepPosition === "left" || this.poolParams.stepPosition === "right"
        ? this.poolParams.stepPosition
        : "center";
      document.querySelectorAll("[data-step-position]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.stepPosition === pos);
      });

      const shape = (["diagonal", "circular", "radius"].includes(this.poolParams.stepShape)) ? this.poolParams.stepShape : "rectangle";
      document.querySelectorAll("[data-step-shape]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.stepShape === shape);
      });
      this.updateCenterCircularModeControls?.();
      this.syncStepWidthSliderLimit?.();
    };

    const rebuildForStepLayout = async (_reason) => {
      const selectedStepIndex = Number.isFinite(Number(this.selectedStep?.userData?.stepIndex))
        ? Number(this.selectedStep.userData.stepIndex)
        : null;

      this.clearHoverHighlight?.();
      if (this.selectedHighlightMesh) this.selectedHighlightMesh.visible = false;
      this.selectedStep = null;

      await this.rebuildPoolForCurrentShape();
      updateButtons();

      // Rebuild replaces the step meshes. Re-select the equivalent step so
      // width/extension live previews keep working after layout changes.
      if (selectedStepIndex !== null && this.poolGroup) {
        let replacementStep = null;
        this.poolGroup.traverse((o) => {
          if (
            !replacementStep &&
            o?.userData?.isStep &&
            !o.userData.isStepAddon &&
            Number(o.userData.stepIndex) === selectedStepIndex
          ) {
            replacementStep = o;
          }
        });
        if (replacementStep) {
          this.selectedStep = replacementStep;
          this.updateHighlightForStep(replacementStep, true);
          this.ghostifyWater?.();
        }
      }
    };

    document.querySelectorAll("[data-step-wall]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = ["west", "east", "north", "south"].includes(btn.dataset.stepWall) ? btn.dataset.stepWall : "west";
        if (this.poolParams.stepWall === next) return;
        this.captureUndoState?.("Step wall");
        this.poolParams.stepWall = next;
        rebuildForStepLayout("Step wall");
      });
    });

    document.querySelectorAll("[data-step-position]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.dataset.stepPosition;
        if (!next || this.poolParams.stepPosition === next) return;
        this.captureUndoState?.("Step position");
        this.poolParams.stepPosition = next;
        rebuildForStepLayout("Step position");
      });
    });

    document.querySelectorAll("[data-step-shape]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = (["diagonal", "circular", "radius"].includes(btn.dataset.stepShape)) ? btn.dataset.stepShape : "rectangle";
        if (this.poolParams.stepShape === next) return;
        this.captureUndoState?.("Step shape");
        this.poolParams.stepShape = next;
        if (next === "diagonal" || (next === "circular" && this.poolParams.stepPosition !== "center")) {
          const cap = this.getBench2ExtensionValue();
          const existing = Number(this.poolParams.diagonalStepSize);
          const size = Number.isFinite(existing) && existing > 0 ? existing : 0.45;
          this.poolParams.diagonalStepSize = THREE.MathUtils.clamp(size, 0.05, cap);
          this.poolParams.stepWidth = this.poolParams.diagonalStepSize;
          this.poolParams.stepExtension = this.poolParams.diagonalStepSize;
        } else if (next === "circular") {
          const maxWidth = this.getStepWidthSliderMax?.() ?? Math.max(0.5, Number(this.poolParams?.width) || 5);
          const diameter = THREE.MathUtils.clamp(Number(this.poolParams.stepWidth) || 1.2, 0.2, maxWidth);
          this.poolParams.stepWidth = diameter;
          this.poolParams.stepExtension = diameter * 0.5;
        }
        this.updateCenterCircularModeControls?.();
        this.syncStepWidthSliderLimit?.();
        rebuildForStepLayout("Step shape");
      });
    });

    document.querySelectorAll("[data-step-bench-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.dataset.stepBenchMode === "stepsOnly" ? "stepsOnly" : "bench";
        if (this.getStepBenchMode?.() === next) return;
        this.captureUndoState?.("Step layout");
        this.poolParams.stepBenchMode = next;
        this.updateStepBenchModeControls?.();
        rebuildForStepLayout("Step layout");
      });
    });

    updateButtons();
  }

  // --------------------------------------------------------------
  // STEP EXTENSION SLIDER (CHAIN PUSH, ALL SHAPES)
  // --------------------------------------------------------------

  previewStepWidthSlider(widthValue) {
    if (!this.poolGroup) return;

    const steps = [];
    this.poolGroup.traverse((o) => {
      if (o?.userData?.isStep && !o.userData.isStepAddon) steps.push(o);
    });
    if (!steps.length) return;

    let spanMinY = Infinity;
    let spanMaxY = -Infinity;
    const outerPts = this.poolGroup.userData?.outerPts;
    if (Array.isArray(outerPts) && outerPts.length) {
      outerPts.forEach((p) => {
        const y = p?.y;
        if (!isFinite(y)) return;
        if (y < spanMinY) spanMinY = y;
        if (y > spanMaxY) spanMaxY = y;
      });
    }

    if (!isFinite(spanMinY) || !isFinite(spanMaxY) || spanMaxY <= spanMinY) {
      let floor = null;
      this.poolGroup.traverse((o) => {
        if (!floor && o?.isMesh && o.userData?.isFloor) floor = o;
      });
      floor = floor || this.poolGroup.userData?.floorMesh;
      if (floor?.geometry) {
        if (!floor.geometry.boundingBox) floor.geometry.computeBoundingBox();
        const bb = floor.geometry.boundingBox;
        const fy = floor.position?.y || 0;
        spanMinY = bb.min.y + fy;
        spanMaxY = bb.max.y + fy;
      }
    }

    if (!isFinite(spanMinY) || !isFinite(spanMaxY) || spanMaxY <= spanMinY) return;

    const fullWidth = Math.max(0.05, spanMaxY - spanMinY);
    const isDiagonal = this.isEqualCornerStepShape?.();
    const widthMax = isDiagonal ? Math.min(fullWidth, this.getBench2ExtensionValue?.() ?? 0.6) : fullWidth;
    const narrowWidth = THREE.MathUtils.clamp(Number(widthValue) || (isDiagonal ? 0.45 : 0.9), 0.05, widthMax);
    const position = this.poolParams.stepPosition === "left" || this.poolParams.stepPosition === "right"
      ? this.poolParams.stepPosition
      : "center";

    const getCenterY = (width, full = false) => {
      if (full) return (spanMinY + spanMaxY) * 0.5;
      const sideAnchorOffset = position !== "center"
        ? Math.min(0.3, Math.max(0, fullWidth - width))
        : 0;
      if (position === "left") return spanMinY + sideAnchorOffset + width * 0.5;
      if (position === "right") return spanMaxY - sideAnchorOffset - width * 0.5;
      return (spanMinY + spanMaxY) * 0.5;
    };

    const stepBenchMode = this.getStepBenchMode?.() === "stepsOnly" ? "stepsOnly" : "bench";
    const tierOffset = 0.3;

    const sortedPreviewSteps = steps.slice().sort((a, b) => {
      const ai = Number.isFinite(Number(a.userData?.stepIndex)) ? Number(a.userData.stepIndex) : steps.indexOf(a);
      const bi = Number.isFinite(Number(b.userData?.stepIndex)) ? Number(b.userData.stepIndex) : steps.indexOf(b);
      return ai - bi;
    });

    const selectedPreviewRank = this.selectedStep && sortedPreviewSteps.includes(this.selectedStep)
      ? sortedPreviewSteps.indexOf(this.selectedStep)
      : 0;

    const getCurrentStepWidth = (step) => {
      if (!step?.geometry) return 0;
      if (!step.geometry.boundingBox) step.geometry.computeBoundingBox();
      const bb = step.geometry.boundingBox;
      const baseWidth = bb.max.y - bb.min.y;
      const scaledWidth = baseWidth * (step.scale?.y ?? 1);
      const savedWidth = Number(step.userData?.stepWidth);
      return Number.isFinite(scaledWidth) && scaledWidth > 0
        ? scaledWidth
        : (Number.isFinite(savedWidth) && savedWidth > 0 ? savedWidth : narrowWidth);
    };

    let previousPreviewWidth = 0;
    sortedPreviewSteps.forEach((step, rank) => {
      const idx = Number.isFinite(Number(step.userData?.stepIndex)) ? Number(step.userData.stepIndex) : rank;
      let targetWidth;
      if (stepBenchMode === "stepsOnly") {
        // Steps Only gets its own selected-tier width preview. Do not use the
        // bench-seat rule where stepIndex 1 becomes full width. The selected
        // tier receives the slider value, and every tier below it widens enough
        // to remain equal-or-larger so the live preview stays as a tiered cake.
        const stepGrowth = position === "center" ? tierOffset * 2 : tierOffset;
        const currentWidth = getCurrentStepWidth(step);
        if (rank === selectedPreviewRank) {
          targetWidth = narrowWidth;
        } else if (rank > selectedPreviewRank) {
          const requiredFromSelected = narrowWidth + stepGrowth * (rank - selectedPreviewRank);
          targetWidth = Math.max(currentWidth, requiredFromSelected, previousPreviewWidth + stepGrowth);
        } else {
          targetWidth = Math.min(currentWidth || narrowWidth, fullWidth);
        }
        targetWidth = THREE.MathUtils.clamp(targetWidth, 0.05, fullWidth);
      } else {
        targetWidth = idx === 1 ? fullWidth : narrowWidth;
      }
      if (!step.geometry.boundingBox) step.geometry.computeBoundingBox();
      const bb = step.geometry.boundingBox;
      const baseWidth = bb.max.y - bb.min.y;
      if (!isFinite(baseWidth) || baseWidth <= 0) return;

      step.scale.y = targetWidth / baseWidth;

      if (isDiagonal && idx !== 1 && position !== "center") {
        const baseLen = bb.max.x - bb.min.x;
        if (Number.isFinite(baseLen) && baseLen > 0) {
          // Equal triangle: the slider value is the actual X/Y footprint size.
          // Always derive from the mesh bounding box, not stale extension scale.
          const size = THREE.MathUtils.clamp(targetWidth, 0.05, this.getBench2ExtensionValue?.() ?? 0.6);
          const backEdgeX = step.position.x - baseLen * (step.scale?.x ?? 1) * 0.5;
          step.scale.x = size / baseLen;
          step.scale.y = size / baseWidth;
          step.position.x = backEdgeX + size * 0.5;
          step.userData.stepRun = size;
          step.userData.stepWidth = size;
        }
      }

      step.position.y = getCenterY(targetWidth, stepBenchMode === "bench" && idx === 1);
      step.userData.stepWidth = targetWidth;
      step.userData.stepPosition = position;
      previousPreviewWidth = targetWidth;
      this.updateScaledBoxTilingUVs(step);
    });

    // Diagonal corner steps must be laid out from the wall immediately after
    // width/shape changes. Do not wait for the extension slider path to
    // re-chain them, otherwise they can appear oversized until the bench step
    // is adjusted.
    if (isDiagonal && position !== "center") {
      let wallX = Infinity;
      if (Array.isArray(outerPts) && outerPts.length) {
        outerPts.forEach((p) => {
          const x = p?.x;
          if (isFinite(x) && x < wallX) wallX = x;
        });
      }
      if (!isFinite(wallX)) {
        steps.forEach((step) => {
          if (!step.geometry.boundingBox) step.geometry.computeBoundingBox();
          const bb = step.geometry.boundingBox;
          const lenX = (bb.max.x - bb.min.x) * (step.scale?.x ?? 1);
          const leftEdge = (step.position?.x ?? 0) - lenX * 0.5;
          if (leftEdge < wallX) wallX = leftEdge;
        });
      }

      if (isFinite(wallX)) {
        const sortedSteps = steps.slice().sort((a, b) => {
          const ai = Number.isFinite(Number(a.userData?.stepIndex)) ? Number(a.userData.stepIndex) : 0;
          const bi = Number.isFinite(Number(b.userData?.stepIndex)) ? Number(b.userData.stepIndex) : 0;
          return ai - bi;
        });
        const getLength = (step) => {
          if (!step.geometry.boundingBox) step.geometry.computeBoundingBox();
          const bb = step.geometry.boundingBox;
          return (bb.max.x - bb.min.x) * (step.scale?.x ?? 1);
        };

        let runX = wallX;
        sortedSteps.forEach((step) => {
          const idx = Number.isFinite(Number(step.userData?.stepIndex)) ? Number(step.userData.stepIndex) : 0;
          const len = getLength(step);
          if (idx <= 1) {
            step.position.x = wallX + len * 0.5;
            if (idx === 1) runX = wallX + len;
          }
        });

        sortedSteps.forEach((step) => {
          const idx = Number.isFinite(Number(step.userData?.stepIndex)) ? Number(step.userData.stepIndex) : 0;
          if (idx <= 1) return;
          const len = getLength(step);
          step.position.x = runX + len * 0.5;
          runX += len;
        });
      }
    }

    // Width changes alter the step cutout footprint, so refresh the floor profile
    // using the current live front edge of the complete step set.
    let runX = -Infinity;
    steps.forEach((step) => {
      if (!step.geometry.boundingBox) step.geometry.computeBoundingBox();
      const bb = step.geometry.boundingBox;
      const lenX = (bb.max.x - bb.min.x) * (step.scale?.x ?? 1);
      const rightEdge = (step.position?.x ?? 0) + lenX * 0.5;
      if (rightEdge > runX) runX = rightEdge;
    });
    if (isFinite(runX)) this.updateFloorAfterStepExtension(steps, runX);

    // If the selected mesh was replaced by a recent rebuild, recover the
    // equivalent current mesh before refreshing the highlight.
    if (this.selectedStep && !steps.includes(this.selectedStep)) {
      const selectedStepIndex = Number(this.selectedStep.userData?.stepIndex);
      const replacementStep = steps.find((step) => Number(step.userData?.stepIndex) === selectedStepIndex);
      if (replacementStep) this.selectedStep = replacementStep;
    }

    if (this.selectedStep) this.updateHighlightForStep(this.selectedStep, true);
    this.ghostifyWater();
  }

  setupStepExtensionSlider() {
    const slider = document.getElementById("stepExtension");
    const output = document.getElementById("stepExtension-val");
    if (!slider) return;

    if (output) {
      output.textContent = parseFloat(slider.value).toFixed(2) + " m";
    }

    slider.addEventListener("pointerdown", () => this.captureUndoState("Step extension"));

    slider.addEventListener("input", () => {
      if (!this.selectedStep || !this.poolGroup) return;

      let val = parseFloat(slider.value);
      if (!isFinite(val)) return;

      const isDiagonal = this.isEqualCornerStepShape?.();
      const isCenteredCircular = this.isCenteredCircularStepShape?.();
      const selectedStepIndex = Number(this.selectedStep?.userData?.stepIndex);

      if (isCenteredCircular) {
        const widthMax = this.getStepWidthSliderMax?.() ?? Math.max(0.5, Number(this.poolParams?.width) || 5);
        val = THREE.MathUtils.clamp(val, Number(slider.min) || 0.1, widthMax * 0.5);
        slider.value = String(val);

        const diameter = THREE.MathUtils.clamp(val * 2, 0.2, widthMax);
        this.poolParams.stepExtension = val;
        this.poolParams.stepWidth = diameter;

        const widthSlider = document.getElementById("stepWidth");
        const widthOutput = document.getElementById("stepWidth-val");
        if (widthSlider) {
          widthSlider.min = "0.2";
          widthSlider.max = String(widthMax);
          widthSlider.value = String(diameter);
        }
        if (widthOutput) widthOutput.textContent = diameter.toFixed(2) + " m";
        if (output) output.textContent = val.toFixed(2) + " m";

        this._live.dirty.add("stepWidth");
        this._live.commitNeeded = true;
        this._live.lastInputTs = performance.now ? performance.now() : Date.now();
        this._schedulePreviewTick?.();
        this._scheduleRebuildDebounced?.();
        return;
      }

      if (isDiagonal && selectedStepIndex !== 1) {
        const maxWidth = this.getStepWidthSliderMax?.() ?? 0.6;
        val = THREE.MathUtils.clamp(val, Number(slider.min) || 0.05, maxWidth);
        slider.value = String(val);

        // For diagonal steps, width and extension are the same control value.
        // Updating either slider should resize the equal triangle in both X and Y.
        this.poolParams.stepWidth = val;
        this.poolParams.diagonalStepSize = val;
        this.poolParams.stepExtension = val;
        const widthSlider = document.getElementById("stepWidth");
        const widthOutput = document.getElementById("stepWidth-val");
        if (widthSlider) {
          widthSlider.min = slider.min;
          widthSlider.max = slider.max;
          widthSlider.value = String(val);
        }
        if (widthOutput) widthOutput.textContent = val.toFixed(2) + " m";
        if (output) output.textContent = val.toFixed(2) + " m";

        this._live.dirty.add("stepWidth");
        this._live.commitNeeded = true;
        this.poolGroup?.scale?.set?.(1, 1, 1);
        this._scheduleAccurateLiveRebuild?.();
        this._scheduleRebuildDebounced?.();
        return;
      }

      // Bench Seat now uses the same relative cascade rules as Steps Only.
      // Do not treat the slider value as an absolute bench length here; the
      // bench branch below converts the relative value into the final run.

      if (output) {
        output.textContent = val.toFixed(2) + " m";
      }

      const steps = [];
      this.poolGroup.traverse((o) => {
        if (o.userData && o.userData.isStep && !o.userData.isStepAddon) steps.push(o);
      });
      if (!steps.length) return;

      steps.forEach((step) => {
        if (!step.geometry.boundingBox) {
          step.geometry.computeBoundingBox();
        }
      });

      // In Steps Only mode the slider value is not the selected step's total run.
      // It is the extra run beyond the previous/upper step, so the nested logic
      // below must calculate the final absolute run before scaling anything.
      // Relative cascade modes calculate the final absolute run before scaling.
      // Scaling the selected mesh here would double-apply the slider value.

      // Keep the selected step anchored to its back edge, then move every
      // downstream step with it. This restores the original chained behaviour
      // while keeping the full-width second step stretched back to the wall.
      let wallX = Infinity;
      const outerPts = this.poolGroup.userData?.outerPts;
      if (Array.isArray(outerPts) && outerPts.length) {
        outerPts.forEach((p) => {
          const x = p?.x;
          if (isFinite(x) && x < wallX) wallX = x;
        });
      }
      if (!isFinite(wallX)) {
        steps.forEach((step) => {
          const geo = step.geometry;
          const bbox = geo.boundingBox;
          const baseLen = bbox.max.x - bbox.min.x;
          const length = baseLen * step.scale.x;
          const leftEdge = step.position.x - length * 0.5;
          if (leftEdge < wallX) wallX = leftEdge;
        });
      }
      if (!isFinite(wallX)) return;

      const sortedSteps = steps
        .slice()
        .sort((a, b) => {
          const ai = Number.isFinite(Number(a.userData?.stepIndex)) ? Number(a.userData.stepIndex) : 0;
          const bi = Number.isFinite(Number(b.userData?.stepIndex)) ? Number(b.userData.stepIndex) : 0;
          return ai - bi;
        });

      const selectedIndex = Number.isFinite(Number(this.selectedStep.userData?.stepIndex))
        ? Number(this.selectedStep.userData.stepIndex)
        : sortedSteps.indexOf(this.selectedStep);

      const getStepLength = (step) => {
        const geo = step.geometry;
        const bbox = geo.boundingBox;
        const baseLen = bbox.max.x - bbox.min.x;
        return baseLen * step.scale.x;
      };

      // Steps Only mode is wall-backed/nested. The generated layout starts as
      // 300 mm tier offsets, but the Step Extension slider is now relative:
      // 0.00 m = the front edge of the previous/upper step. Extending a tier
      // pushes that tier forward, and every lower tier moves forward with it so
      // an upper tier can never overhang/be wider than the tier below it.
      if (this.getStepBenchMode?.() === "stepsOnly") {
        // Use the visible sorted order for cascade behaviour, not only the
        // saved stepIndex. Some layouts can keep legacy/custom stepIndex values,
        // but the physical rule is always: selected tier pushes every tier below it.
        const selectedRank = Math.max(0, sortedSteps.indexOf(this.selectedStep));
        const selectedTier = Number.isFinite(selectedIndex) ? selectedIndex : selectedRank;
        const customRuns = { ...(this.poolParams.stepsOnlyStepRuns || {}) };
        const tierOffset = 0.3;

        const getCurrentRun = (step) => {
          const geo = step?.geometry;
          if (!geo) return 0;
          if (!geo.boundingBox) geo.computeBoundingBox();
          const bbox = geo.boundingBox;
          const baseLen = bbox.max.x - bbox.min.x;
          const scaledLen = baseLen * (step.scale?.x ?? 1);
          const savedRun = Number(step.userData?.stepRun);
          return Number.isFinite(scaledLen) && scaledLen > 0
            ? scaledLen
            : (Number.isFinite(savedRun) && savedRun > 0 ? savedRun : 0.3);
        };

        const currentRuns = new Map();
        sortedSteps.forEach((step) => {
          const stepIndex = Number.isFinite(Number(step.userData?.stepIndex))
            ? Number(step.userData.stepIndex)
            : sortedSteps.indexOf(step);

          if (!Number.isFinite(Number(step.userData?.defaultStepsOnlyRun))) {
            step.userData.defaultStepsOnlyRun = getCurrentRun(step);
          }

          const overrideRun = Number(this.poolParams.stepsOnlyStepRuns?.[String(stepIndex)]);
          const run = Number.isFinite(overrideRun) && overrideRun > 0
            ? overrideRun
            : getCurrentRun(step);
          currentRuns.set(stepIndex, Math.max(0.05, run));
        });

        const previousRun = selectedTier > 0
          ? Math.max(0, currentRuns.get(selectedTier - 1) || 0)
          : 0;
        const oldSelectedRun = Math.max(0.05, currentRuns.get(selectedTier) || getCurrentRun(this.selectedStep));
        const targetSelectedRun = Math.max(0.05, previousRun + Math.max(0, val));
        const delta = targetSelectedRun - oldSelectedRun;

        let priorRun = 0;
        sortedSteps.forEach((step, rank) => {
          const stepIndex = Number.isFinite(Number(step.userData?.stepIndex))
            ? Number(step.userData.stepIndex)
            : rank;

          const geo = step.geometry;
          const bbox = geo.boundingBox;
          const baseLen = bbox.max.x - bbox.min.x;
          if (!Number.isFinite(baseLen) || baseLen <= 0) return;

          const currentRun = Math.max(0.05, currentRuns.get(stepIndex) || getCurrentRun(step));
          let targetRun = currentRun;

          if (rank === selectedRank) {
            targetRun = targetSelectedRun;
          } else if (rank > selectedRank) {
            // Any tier below the selected tier must travel with it. This keeps
            // the selected/upper step from ever projecting past the lower tier.
            targetRun = Math.max(currentRun + delta, priorRun + tierOffset);
          }

          targetRun = Math.max(0.05, targetRun);
          step.scale.x = targetRun / baseLen;
          step.position.x = wallX + targetRun * 0.5;
          step.userData.stepRun = targetRun;
          customRuns[String(stepIndex)] = targetRun;
          priorRun = targetRun;
          this.updateScaledBoxTilingUVs(step);
        });

        this.poolParams.stepsOnlyStepRuns = customRuns;

        // Slider displays only the extra distance beyond the previous step.
        slider.value = String(Math.max(0, targetSelectedRun - previousRun));
        if (output) output.textContent = Math.max(0, targetSelectedRun - previousRun).toFixed(2) + " m";

        // With Steps Only, the pool floor/transition stays locked to the entry
        // wall. Step footprints must not move the floor transition or flatten it.
        this.updateFloorAfterStepExtension(steps, wallX);
        this.updateHighlightForStep(this.selectedStep, true);
        this.ghostifyWater();
        return;
      }

      if (this.getStepBenchMode?.() === "bench") {
        // Bench Seat uses the same relative extension rule as Steps Only:
        // 0.00 m = selected tier ends at the previous/upper tier's front edge.
        // Extending an upper tier carries the full-width bench with it so the
        // upper step can never project beyond the bench below. Steps after the
        // bench remain chained from the live bench/front edge and therefore move
        // forward with the changed tier.
        const getFrontEdge = (step) => step.position.x + getStepLength(step) * 0.5;
        const selectedRank = Math.max(0, sortedSteps.indexOf(this.selectedStep));
        const selectedTier = Number.isFinite(selectedIndex) ? selectedIndex : selectedRank;
        const customBenchRuns = { ...(this.poolParams.benchStepRuns || {}) };
        const previousStep = selectedRank > 0 ? sortedSteps[selectedRank - 1] : null;
        const previousFront = previousStep ? getFrontEdge(previousStep) : wallX;
        const oldSelectedFront = getFrontEdge(this.selectedStep);
        const oldSelectedLength = getStepLength(this.selectedStep);
        const targetSelectedFront = previousFront + Math.max(0, val);
        const targetSelectedLength = Math.max(0.05, selectedRank <= 1
          ? targetSelectedFront - wallX
          : targetSelectedFront - previousFront);
        const deltaFront = targetSelectedFront - oldSelectedFront;

        let benchFrontX = wallX;
        let chainX = wallX;
        sortedSteps.forEach((step, rank) => {
          const stepIndex = Number.isFinite(Number(step.userData?.stepIndex))
            ? Number(step.userData.stepIndex)
            : rank;

          const geo = step.geometry;
          const bbox = geo.boundingBox;
          const baseLen = bbox.max.x - bbox.min.x;
          if (!Number.isFinite(baseLen) || baseLen <= 0) return;

          let targetLength = getStepLength(step);

          if (rank === selectedRank) {
            targetLength = targetSelectedLength;
          } else if (rank > selectedRank && stepIndex <= 1) {
            // The bench is wall-backed, so it must grow when an upper wall-backed
            // step grows. This is the key rule that prevents the first step from
            // becoming wider/deeper than the bench below it.
            targetLength = Math.max(0.05, targetLength + deltaFront);
            const upper = rank > 0 ? sortedSteps[rank - 1] : null;
            if (upper) targetLength = Math.max(targetLength, getStepLength(upper));
          }

          step.scale.x = targetLength / baseLen;

          if (stepIndex <= 1) {
            step.position.x = wallX + targetLength * 0.5;
            if (stepIndex === 1) {
              benchFrontX = wallX + targetLength;
              chainX = benchFrontX;
              this.poolParams.bench2Extension = targetLength;
            }
          } else {
            // Lower steps are chained from the current bench/previous step edge.
            // They move forward when anything above them extends. If one of these
            // chained steps is selected, only that tread length changes and all
            // subsequent treads shift from its new front edge.
            if (rank === selectedRank) targetLength = targetSelectedLength;
            step.scale.x = targetLength / baseLen;
            step.position.x = chainX + targetLength * 0.5;
            chainX += targetLength;
          }

          step.userData.stepRun = targetLength;
          customBenchRuns[String(stepIndex)] = targetLength;
          this.updateScaledBoxTilingUVs(step);
        });

        this.poolParams.benchStepRuns = customBenchRuns;

        if (this.isEqualCornerStepShape?.()) {
          const capped = Math.min(this.getDiagonalStepSizeValue(), this.getBench2ExtensionValue());
          this.poolParams.diagonalStepSize = capped;
          this.poolParams.stepWidth = capped;
          this.syncStepWidthSliderLimit?.();
        }

        // Bench Seat keeps the floor transition tied to the second/full-width
        // bench. updateFloorAfterStepExtension locates stepIndex 1 for the
        // origin, so extra lower treads do not move the floor transition.
        this.updateFloorAfterStepExtension(steps, benchFrontX);
        this.updateHighlightForStep(this.selectedStep, true);
        this.ghostifyWater();
        return;
      }

      // Locked preset behaviour:
      // - steps 1 and 2 stay backed to the entry wall
      // - step 2 is the full-width bench/ledge and must never drift off the wall
      // - every step after step 2 chains from the live front edge of step 2
      let runX = wallX;
      sortedSteps.forEach((step) => {
        const stepIndex = Number.isFinite(Number(step.userData?.stepIndex))
          ? Number(step.userData.stepIndex)
          : sortedSteps.indexOf(step);

        const length = getStepLength(step);

        if (stepIndex <= 1) {
          step.position.x = wallX + length * 0.5;
          if (stepIndex === 1) runX = wallX + length;
        }
      });

      sortedSteps.forEach((step) => {
        const stepIndex = Number.isFinite(Number(step.userData?.stepIndex))
          ? Number(step.userData.stepIndex)
          : sortedSteps.indexOf(step);

        if (stepIndex <= 1) return;

        const length = getStepLength(step);
        step.position.x = runX + length * 0.5;
        runX += length;
      });

      // The floor needs to start after the outermost live step footprint.
      sortedSteps.forEach((step) => {
        const rightEdge = step.position.x + getStepLength(step) * 0.5;
        if (rightEdge > runX) runX = rightEdge;
      });

      // Rebake UVs so tile density stays fixed after scaling/position changes
      steps.forEach((s) => this.updateScaledBoxTilingUVs(s));

      // Reprofile floor: move slope origin + cut out under steps
      this.updateFloorAfterStepExtension(steps, runX);

      this.updateHighlightForStep(this.selectedStep, true);
      this.ghostifyWater();
    });
  }

  // --------------------------------------------------------------
  // WALL SELECTION (hover + double-click) – opens Features panel
  // --------------------------------------------------------------
  _wallCandidatesForRaise() {
    const authored = this.poolGroup?.userData?.wallMeshes;
    const candidates = Array.isArray(authored)
      ? authored.filter(Boolean)
      : authored?.isObject3D ? [authored] : Object.values(authored || {}).filter(Boolean);
    if (candidates.length) return candidates;
    const fallback = [];
    this.poolGroup?.traverse?.((object) => {
      if (object?.userData?.isWall && this._getWallRaiseKey(object) != null) fallback.push(object);
    });
    return fallback;
  }

  _isEntryStepWall(wall) {
    if (!wall || !this.poolGroup) return false;
    const length = Number(this.poolParams?.length || 8);
    const width = Number(this.poolParams?.width || 4);
    const entry = this._getEntryStepInfo(length, width);
    const sideMap = { front:'south', back:'north', left:'west', right:'east' };
    const expectedSide = sideMap[entry?.side] || entry?.side;
    if (wall.userData?.side && wall.userData.side === expectedSide) return true;

    // Shape-independent fallback: compare the selected wall's centre with the
    // normal axis of the live entry-step wall frame.
    const frame = this._sideFrame(entry?.side || 'left', length, width, 0);
    wall.updateWorldMatrix?.(true, false);
    const worldCenter = new THREE.Box3().setFromObject(wall).getCenter(new THREE.Vector3());
    const localCenter = this.poolGroup.worldToLocal(worldCenter.clone());
    const delta = new THREE.Vector3(localCenter.x-frame.center.x, localCenter.y-frame.center.y, 0);
    return Math.abs(delta.dot(frame.inward)) < 0.32;
  }

  getSelectedWallRaiseState() {
    const wall = this.selectedWall;
    const key = this._getWallRaiseKey(wall);
    const selected = !!wall && key != null;
    const extra = selected ? Math.max(0, Number(this.wallRaiseBySourceEdge?.[key] ?? wall.userData?.extraHeight) || 0) : 0;
    const entrySide = selected ? this._isEntryStepWall(wall) : false;
    return {
      selected,
      key,
      side:wall?.userData?.side || null,
      extra,
      canRaise:selected && !entrySide,
      entrySide
    };
  }

  _disposeWallRaisePrompt() {
    const group = this.wallRaisePromptGroup;
    if (group) {
      group.parent?.remove(group);
      group.traverse?.((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material?.dispose?.());
        else object.material?.dispose?.();
      });
    }
    this._wallRaiseHitTarget?.remove?.();
    this._wallRaiseHitTarget = null;
    this.wallRaisePromptGroup = null;
  }

  _showWallRaisePrompt(wall, { pulse = false } = {}) {
    this._disposeWallRaisePrompt();
    if (!wall || this._isEntryStepWall(wall) || this._getWallRaiseKey(wall) == null || !this.poolGroup) return;
    wall.updateWorldMatrix?.(true, false);
    const bounds = new THREE.Box3().setFromObject(wall);
    if (bounds.isEmpty()) return;
    const world = bounds.getCenter(new THREE.Vector3());
    world.z = bounds.max.z + 0.12;
    const local = this.poolGroup.worldToLocal(world.clone());
    const material = new THREE.MeshBasicMaterial({ color:0x15566f, depthTest:false, depthWrite:false, transparent:true, opacity:0.84 });
    const group = new THREE.Group();
    group.name = 'selected-wall-raise-arrow';
    group.position.copy(local);
    group.userData.isWallRaisePrompt = true;
    group.userData.baseZ = local.z;
    group.userData.pulseUntil = pulse ? performance.now() + 2600 : 0;
    const baseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.10,0.145,32),
      new THREE.MeshBasicMaterial({ color:0xffffff, depthTest:false, depthWrite:false, transparent:true, opacity:0.72, side:THREE.DoubleSide })
    );
    baseRing.position.z = 0.012; baseRing.renderOrder = 2400;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.30,18), material.clone());
    stem.rotation.x = Math.PI/2; stem.position.z = 0.17; stem.renderOrder = 2400;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.085,0.17,24), material.clone());
    head.rotation.x = Math.PI/2; head.position.z = 0.405; head.renderOrder = 2400;
    const pick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16,0.16,0.72,12),
      new THREE.MeshBasicMaterial({ transparent:true, opacity:0.001, depthTest:false, depthWrite:false })
    );
    pick.rotation.x = Math.PI/2; pick.position.z = 0.28;
    [baseRing,stem,head,pick].forEach((mesh) => {
      mesh.userData.isWallRaiseHandle = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    });
    this.poolGroup.add(group);
    this.wallRaisePromptGroup = group;

    // Keep the arrow itself as the only visible control, but place a generous
    // transparent DOM drag target over it. This prevents OrbitControls from
    // stealing the gesture when the arrow is viewed edge-on.
    const hitTarget = document.createElement('div');
    hitTarget.setAttribute('role','button');
    hitTarget.setAttribute('aria-label','Raise selected wall');
    Object.assign(hitTarget.style,{
      position:'fixed',zIndex:'4200',width:'128px',height:'128px',
      background:'transparent',border:'0',cursor:'ns-resize',touchAction:'none'
    });
    const begin = (event) => {
      if (event.button !== 0) return;
      const state = this.getSelectedWallRaiseState();
      if (!state.canRaise) return;
      event.preventDefault?.(); event.stopPropagation?.(); event.stopImmediatePropagation?.();
      this.captureUndoState?.('Wall raise');
      this.wallRaiseDrag = { pointerId:event.pointerId,startY:event.clientY,startExtra:state.extra,controlsEnabled:this.controls?.enabled !== false,hitTarget:true };
      if (this.controls) this.controls.enabled=false;
      hitTarget.setPointerCapture?.(event.pointerId);
    };
    const move = (event) => {
      const drag=this.wallRaiseDrag;
      if (!drag?.hitTarget || event.pointerId!==drag.pointerId) return;
      event.preventDefault?.(); event.stopPropagation?.();
      this.setSelectedWallRaiseHeight(drag.startExtra+(drag.startY-event.clientY)*0.005);
    };
    const finish = (event) => {
      const drag=this.wallRaiseDrag;
      if (!drag?.hitTarget || event.pointerId!==drag.pointerId) return;
      this.wallRaiseDrag=null;
      if (this.controls) this.controls.enabled=drag.controlsEnabled;
      try { hitTarget.releasePointerCapture?.(event.pointerId); } catch (_) {}
      this._showWallRaisePrompt(this.selectedWall);
      this._notifyDesignerStateChanged?.();
    };
    hitTarget.addEventListener('pointerdown',begin,true);
    hitTarget.addEventListener('pointermove',move,true);
    hitTarget.addEventListener('pointerup',finish,true);
    hitTarget.addEventListener('pointercancel',finish,true);
    document.body.appendChild(hitTarget);
    this._wallRaiseHitTarget=hitTarget;
    this._updateWallRaisePromptAnimation();
  }

  _updateWallRaisePromptAnimation() {
    const group = this.wallRaisePromptGroup;
    if (!group) return;
    const now = performance.now();
    const time = now * 0.001;
    const pulsing = now < Number(group.userData.pulseUntil || 0);
    group.position.z = Number(group.userData.baseZ || 0) + Math.sin(time * (pulsing ? 12 : 4)) * (pulsing ? 0.08 : 0.025);
    group.rotation.z = pulsing ? Math.sin(time * 18) * 0.14 : 0;
    const scale = pulsing ? 1 + Math.sin(time * 14) * 0.12 : 1;
    group.scale.setScalar(scale);
    const target=this._wallRaiseHitTarget;
    if (target && this.camera && this.renderer?.domElement) {
      group.updateWorldMatrix?.(true,true);
      const projected=group.localToWorld(new THREE.Vector3(0,0,0.26)).project(this.camera);
      const rect=this.renderer.domElement.getBoundingClientRect();
      if (projected.z < -1 || projected.z > 1) target.style.display='none';
      else {
        const x=rect.left+(projected.x*0.5+0.5)*rect.width;
        const y=rect.top+(-projected.y*0.5+0.5)*rect.height;
        target.style.left=`${Math.round(x-64)}px`;
        target.style.top=`${Math.round(y-64)}px`;
        target.style.display='block';
      }
    }
  }

  _selectWallForRaise(wall, { pulse = false } = {}) {
    if (!wall || this._getWallRaiseKey(wall) == null) return false;
    this.selectedWall = wall;
    this.updateHighlightForWall(wall, true);
    this.clearWallHoverHighlight();
    this._showWallRaisePrompt(wall, { pulse });
    this._notifyDesignerInteraction?.('pool');
    this._notifyDesignerStateChanged?.();
    return true;
  }

  setSelectedWallRaiseHeight(extra, { captureUndo = false } = {}) {
    const state = this.getSelectedWallRaiseState();
    if (!state.selected || !state.canRaise || state.key == null) return false;
    if (captureUndo) this.captureUndoState?.('Wall raise');
    const next = THREE.MathUtils.clamp(Math.round((Number(extra) || 0) / 0.05) * 0.05, 0, 1.5);
    this.wallRaiseBySourceEdge[state.key] = next;
    this._applyWallExtraToMeshesFromKey(state.key, next);
    const wallRaiseSlider=document.getElementById('wallRaise');
    const wallRaiseValue=document.getElementById('wallRaise-val');
    if (wallRaiseSlider) wallRaiseSlider.value=next.toFixed(2);
    if (wallRaiseValue) wallRaiseValue.textContent=`${next.toFixed(2)} m`;
    this.updateHighlightForWall(this.selectedWall, true);
    // A DOM-backed arrow drag owns pointer capture. Recreating its overlay in
    // the middle of that gesture would cancel the drag after the first step.
    if (!this.wallRaiseDrag?.hitTarget) this._showWallRaisePrompt(this.selectedWall);
    this.rebuildPoolFeatures();
    this._notifyDesignerStateChanged?.();
    return true;
  }

  promptRaiseWallForFeature() {
    let wall = this.selectedWall;
    if (!wall || this._isEntryStepWall(wall) || this._getWallRaiseKey(wall) == null) {
      wall = this._wallCandidatesForRaise().find((candidate) => !this._isEntryStepWall(candidate) && this._getWallRaiseKey(candidate) != null) || null;
    }
    if (!wall) return false;
    this._selectWallForRaise(wall, { pulse:true });
    return true;
  }

  _clearEntryWallRaiseState() {
    this._wallCandidatesForRaise().forEach((wall) => {
      if (!this._isEntryStepWall(wall)) return;
      const key = this._getWallRaiseKey(wall);
      if (key == null) return;
      delete this.wallRaiseBySourceEdge[key];
      this._applyWallExtraToMeshesFromKey(key, 0);
    });
    if (this.selectedWall && this._isEntryStepWall(this.selectedWall)) this._disposeWallRaisePrompt();
  }

  _setupWallRaiseHandleDragging() {
    if (this._wallRaiseHandleDraggingSetup || !this.renderer?.domElement || !this.camera) return;
    this._wallRaiseHandleDraggingSetup = true;
    const dom = this.renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hitHandle = (event) => {
      const group = this.wallRaisePromptGroup;
      if (!group) return null;
      const rect = dom.getBoundingClientRect();
      pointer.set(((event.clientX-rect.left)/rect.width)*2-1, -((event.clientY-rect.top)/rect.height)*2+1);
      raycaster.setFromCamera(pointer, this.camera);
      const hit = raycaster.intersectObjects(group.children, true)[0] || null;
      if (hit) return hit;

      // The handle is deliberately slim and remains transparent, so a pure
      // mesh raycast is easy to miss at oblique camera angles. Keep the exact
      // 3D hit test, then add a screen-space target around the visible arrow.
      group.updateWorldMatrix?.(true,true);
      const projectedPoints = [0.04,0.28,0.44].map((localZ) =>
        group.localToWorld(new THREE.Vector3(0,0,localZ)).project(this.camera)
      ).filter(projected => projected.z >= -1 && projected.z <= 1);
      const screenDistance = projectedPoints.reduce((best,projected) => {
        const x = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
        const y = rect.top + (-projected.y * 0.5 + 0.5) * rect.height;
        return Math.min(best,Math.hypot(event.clientX-x,event.clientY-y));
      },Infinity);
      return screenDistance <= 64 ? { object:group } : null;
    };
    dom.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !hitHandle(event)) return;
      const state = this.getSelectedWallRaiseState();
      if (!state.canRaise) return;
      event.preventDefault?.(); event.stopPropagation?.(); event.stopImmediatePropagation?.();
      this.captureUndoState?.('Wall raise');
      this.wallRaiseDrag = { pointerId:event.pointerId, startY:event.clientY, startExtra:state.extra, controlsEnabled:this.controls?.enabled !== false };
      if (this.controls) this.controls.enabled = false;
      dom.setPointerCapture?.(event.pointerId);
      dom.style.cursor = 'ns-resize';
    }, true);
    dom.addEventListener('pointermove', (event) => {
      const drag = this.wallRaiseDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const next = drag.startExtra + (drag.startY-event.clientY) * 0.005;
      this.setSelectedWallRaiseHeight(next);
    }, true);
    const finish = (event) => {
      const drag = this.wallRaiseDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      this.wallRaiseDrag = null;
      if (this.controls) this.controls.enabled = drag.controlsEnabled;
      try { dom.releasePointerCapture?.(event.pointerId); } catch (_) {}
      dom.style.cursor = '';
      this._notifyDesignerStateChanged?.();
    };
    dom.addEventListener('pointerup', finish, true);
    dom.addEventListener('pointercancel', finish, true);
  }

  setupWallSelection() {
    if (!this.renderer || !this.camera) return;
    const dom = this.renderer.domElement;

    // Hover: always allowed, independent of panel state
    dom.addEventListener("pointermove", (event) => {
      if (!this.poolGroup) return;

      if (this.poolEditor?.isDragging) return;

      const rect = dom.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      const ray = new THREE.Raycaster();
      ray.setFromCamera(mouse, this.camera);

      const walls = this._wallCandidatesForRaise();

      if (!walls.length) {
        this.clearWallHoverHighlight();
        return;
      }

      const hit = ray.intersectObjects(walls, true);
      if (!hit.length) {
        this.hoveredCustomizeCurveEdgeIndex = null;
        this.clearWallHoverHighlight();
        if (this.customizeMode && !this.customizePreview) this.refreshCustomizeHint();
        return;
      }

      const wall = hit[0].object;
      const hoveredCurveEdge = (() => {
        if (!this.customizeMode) return null;
        const idx = wall?.userData?.sourceEdgeIndex;
        if (!Number.isInteger(idx)) return null;
        const curvedFromWall = !!wall?.userData?.sourceEdgeCurved;
        const curvedFromPolygon = !!this.editablePolygon?.getEdge?.(idx)?.isCurved;
        return (curvedFromWall || curvedFromPolygon) ? idx : null;
      })();

      if (wall === this.selectedWall && !Number.isInteger(hoveredCurveEdge)) {
        this.clearWallHoverHighlight();
        return;
      }

      if (Number.isInteger(hoveredCurveEdge) && this.isPolygonShape()) {
        if (this.hoveredCustomizeCurveEdgeIndex !== hoveredCurveEdge) {
          this.hoveredCustomizeCurveEdgeIndex = hoveredCurveEdge;
          this.hoveredWall = wall;
          this.updateHighlightForWall(wall, false);
          this.refreshCustomizeHint("Click the curved wall to edit its radius or revert it back to a square corner.");
        }
        return;
      }

      this.hoveredCustomizeCurveEdgeIndex = null;
      if (wall !== this.hoveredWall) {
        this.hoveredWall = wall;
        this.updateHighlightForWall(wall, false);
      }
    });

    // Single-click curved walls to jump straight into customise mode, or pick walls while customising
    dom.addEventListener("click", (event) => {
      if (event.button !== 0) return;
      if (!this.poolGroup) return;

      const rect = dom.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      const ray = new THREE.Raycaster();
      ray.setFromCamera(mouse, this.camera);

      const walls = this._wallCandidatesForRaise();

      const hit = walls.length ? ray.intersectObjects(walls, true) : [];
      if (!hit.length) return;

      const pickedWall = hit[0].object;
      const curvedSourceEdge = (() => {
        const idx = pickedWall?.userData?.sourceEdgeIndex;
        if (!Number.isInteger(idx)) return null;
        const curvedFromWall = !!pickedWall?.userData?.sourceEdgeCurved;
        const curvedFromPolygon = !!this.editablePolygon?.getEdge?.(idx)?.isCurved;
        return (curvedFromWall || curvedFromPolygon) ? idx : null;
      })();

      if (Number.isInteger(curvedSourceEdge) && this.isPolygonShape()) {
        if (!this.customizeMode) {
          this.setCustomizeMode(true);
        }
        this.selectExistingCurvedEdgeForCustomize(curvedSourceEdge, pickedWall);
        return;
      }

      if (!this.customizeMode) return;
      this.handleCustomizeWallPick(pickedWall, hit[0].point);
    });

    // Select: pick wall, open Features panel, sync slider
    dom.addEventListener("dblclick", (event) => {
      if (event.button !== 0) return;
      if (!this.poolGroup) return;

      const rect = dom.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      const ray = new THREE.Raycaster();
      ray.setFromCamera(mouse, this.camera);

      const walls = this._wallCandidatesForRaise();

      const hit = walls.length ? ray.intersectObjects(walls, true) : [];
      if (!hit.length) {
        const hadSel = !!this.selectedWall;
        this.clearWallSelectedHighlight();
        if (hadSel) {
          document.dispatchEvent(new CustomEvent("wallSelectionCleared"));
        }
        return;
      }

      const wall = hit[0].object;
      if (!this._selectWallForRaise(wall)) return;

      // Open Features panel via UI helper, if available
      if (window.openPanelFromCode) {
        window.openPanelFromCode("features");
      }

      // initialise slider UI from wall meta
      const row = document.getElementById("wallRaiseRow");
      const slider = document.getElementById("wallRaise");
      const valSpan = document.getElementById("wallRaise-val");

      if (row) row.style.display = "block";

      if (slider) {
        let baseHeight = wall.userData?.baseHeight;
        if (!isFinite(baseHeight) || baseHeight <= 0) {
          const params = wall.geometry?.parameters;
          baseHeight =
            (params && typeof params.depth === "number" && params.depth > 0)
              ? params.depth
              : 1;
          wall.userData.baseHeight = baseHeight;
        }

        const currentHeight =
          wall.userData?.currentHeight ?? baseHeight * (wall.scale?.z || 1);
        const savedExtra = this.wallRaiseBySourceEdge?.[this._getWallRaiseKey(wall)] ?? null;
        const extra = Math.max(0, Number.isFinite(savedExtra) ? savedExtra : (currentHeight - baseHeight));

        slider.disabled = this._isEntryStepWall(wall);
        slider.value = extra.toFixed(2);

        if (valSpan) {
          valSpan.textContent = extra.toFixed(2) + " m";
        }
      }

      document.dispatchEvent(new CustomEvent("wallSelected"));
    });
    this._setupWallRaiseHandleDragging();
  }

  // --------------------------------------------------------------
  // WALL RAISE SLIDER
  //  - raises selected wall
  //  - raises coping:
  //      * per-wall, if copingSegments + wall.copingIndex exist
  //      * otherwise, global ring coping using max extra
  // --------------------------------------------------------------
  setupWallRaiseSlider() {
    const slider = document.getElementById("wallRaise");
    const output = document.getElementById("wallRaise-val");
    if (!slider) return;

    if (output) {
      output.textContent = parseFloat(slider.value || "0").toFixed(2) + " m";
    }

    slider.addEventListener("pointerdown", () => this.captureUndoState("Wall raise"));

    slider.addEventListener("input", () => {
      if (!this.selectedWall || !this.poolGroup) return;

      const extra = parseFloat(slider.value || "0");
      if (!isFinite(extra)) return;

      if (output) {
        output.textContent = extra.toFixed(2) + " m";
      }

      this.setSelectedWallRaiseHeight(extra);
    });
  }


  _clonePoolParams() {
    return JSON.parse(JSON.stringify(this.poolParams));
  }

  _serializeEditablePolygon() {
    if (!this.editablePolygon) return null;
    return {
      vertices: this.editablePolygon.vertices.map((v) => ({ x: v.x, y: v.y })),
      edges: this.editablePolygon.edges.map((e) => ({
        isCurved: !!e?.isCurved,
        control: e?.control ? { x: e.control.x, y: e.control.y } : null
      })),
      minVertices: this.editablePolygon.minVertices,
      isRectangular: !!this.editablePolygon.isRectangular
    };
  }

  _restoreEditablePolygon(data) {
    if (!data) {
      this.editablePolygon = null;
      return;
    }

    const poly = new EditablePolygon(
      (data.vertices || []).map((v) => new THREE.Vector2(v.x, v.y))
    );

    if (Array.isArray(data.edges) && data.edges.length === poly.edges.length) {
      poly.edges = data.edges.map((e) => ({
        isCurved: !!e?.isCurved,
        control: e?.control ? new THREE.Vector2(e.control.x, e.control.y) : null
      }));
    }

    poly.minVertices = data.minVertices ?? 3;
    poly.isRectangular = !!data.isRectangular;
    this.editablePolygon = poly;
  }

  captureUndoState(_reason = "") {
    if (this.isRestoringUndo) return;

    const stack = Array.isArray(this.undoStack) ? this.undoStack : [];
    const redo = Array.isArray(this.redoStack) ? this.redoStack : [];
    const limit = Number.isFinite(this.undoLimit) ? this.undoLimit : 50;

    this.undoStack = stack;
    this.redoStack = redo;
    this.undoLimit = limit;

    const snapshot = {
      poolParams: this._clonePoolParams(),
      editablePolygon: this._serializeEditablePolygon(),
      baseShapeType: this.baseShapeType,
      isCustomShape: !!this.isCustomShape,
      wallRaiseBySourceEdge: JSON.parse(JSON.stringify(this.wallRaiseBySourceEdge || {})),
      barStoolPlacements: JSON.parse(JSON.stringify(this.barStoolPlacements || null)),
      raisedWallWaterFeaturePlacements: JSON.parse(JSON.stringify(this.raisedWallWaterFeaturePlacements || {})),
      acrylicWindowState: JSON.parse(JSON.stringify(this.acrylicWindowState || null)),
      bladeLength: Number(this.bladeLength || 1.2),
      hasSpa: !!this.spa,
      spa: this.spa ? {
        spaShape: this.spa.userData?.spaShape ?? "square",
        spaLength: this.spa.userData?.spaLength ?? 2,
        spaWidth: this.spa.userData?.spaWidth ?? 2,
        topHeight: this.spa.userData?.spaTopHeight ?? 0,
        position: this.spa?.position ? {
          x: this.spa.position.x,
          y: this.spa.position.y,
          z: this.spa.position.z
        } : null
      } : null
    };

    let serialized = "";
    try {
      serialized = JSON.stringify(snapshot);
    } catch (_err) {
      serialized = "";
    }

    const last = stack.length ? stack[stack.length - 1] : null;
    if (last && serialized) {
      try {
        if (JSON.stringify(last) === serialized) return;
      } catch (_err) {}
    }

    stack.push(snapshot);
    if (stack.length > limit) {
      stack.shift();
    }
    redo.length = 0;
    this.updateUndoButtonState();
  }

  updateUndoButtonState() {
    const btn = document.getElementById("undoBtn");
    if (!btn) return;
    const undoCount = Array.isArray(this.undoStack) ? this.undoStack.length : 0;
    btn.disabled = undoCount === 0;
  }

  async undoLastChange() {
    if (!Array.isArray(this.undoStack) || !this.undoStack.length) return;

    const snapshot = this.undoStack.pop();
    this.updateUndoButtonState();
    if (!snapshot) return;

    this.isRestoringUndo = true;
    try {
      this.poolParams = JSON.parse(JSON.stringify(snapshot.poolParams || this.poolParams));
      this.baseShapeType = snapshot.baseShapeType || this.poolParams.shape;
      this.isCustomShape = !!snapshot.isCustomShape;
      this.wallRaiseBySourceEdge = JSON.parse(JSON.stringify(snapshot.wallRaiseBySourceEdge || {}));
      this.barStoolPlacements = JSON.parse(JSON.stringify(snapshot.barStoolPlacements || null));
      this.raisedWallWaterFeaturePlacements = JSON.parse(JSON.stringify(snapshot.raisedWallWaterFeaturePlacements || {}));
      this.acrylicWindowState = JSON.parse(JSON.stringify(snapshot.acrylicWindowState || { length:1.8, height:0.8, placement:null }));
      this.bladeLength = Number(snapshot.bladeLength || 1.2);
      this._restoreEditablePolygon(snapshot.editablePolygon || null);

      const shapeSelect = document.getElementById("shape");
      if (shapeSelect) shapeSelect.value = this.poolParams.shape;

      this.updateShapeUIVisibility();
    this.refreshDisplayedShapeLabel();
      this.refreshDisplayedShapeLabel();
      this.syncSlidersFromParams();

      if (snapshot.hasSpa) {
        if (!this.spa) {
          this.spa = createSpa(this.poolParams, this.scene, {
            tileSize: this.tileSize,
            shape: snapshot?.spa?.spaShape || this.getSelectedSpaShape()
          });
    this.spa.userData.poolGroup = this.poolGroup || null;
          this.spa.userData.poolGroup = this.poolGroup || null;
        }
        if (snapshot.spa) {
          this.spa.userData.poolGroup = this.poolGroup || null;
          this.spa.userData.poolParams = this.poolParams;
          this.spa.userData.spaShape = snapshot.spa.spaShape || "square";
          const spaShapeSelect = document.getElementById("spaShape");
          if (spaShapeSelect) spaShapeSelect.value = this.spa.userData.spaShape;
          this.spa.userData.spaLength = snapshot.spa.spaLength;
          this.spa.userData.spaWidth = snapshot.spa.spaWidth;
          this.spa.userData.spaTopHeight = snapshot.spa.topHeight ?? 0;
          if (snapshot.spa.position) {
            this.spa.position.set(snapshot.spa.position.x, snapshot.spa.position.y, snapshot.spa.position.z ?? 0);
          }
          setSpaTopOffset(snapshot.spa.topHeight ?? 0);
          updateSpa(this.spa);
      this.applyPoolElevation();
          snapToPool(this.spa);
          await this.pbrManager?.applyTilesToSpa?.(this.spa);
          this.setSpaSlidersEnabled(true);
          this.refreshSpaTopOffsetSlider();
          const spaBtn = document.getElementById("addRemoveSpa");
          if (spaBtn) spaBtn.textContent = "Remove Spa";
        }
      } else if (this.spa) {
        this.removeSpa();
        const spaBtn = document.getElementById("addRemoveSpa");
        if (spaBtn) spaBtn.textContent = "Add Spa";
        this.refreshSpaDimensionLabels();
      }

      await this.rebuildPoolForCurrentShape();
      window.openPanelFromCode?.("shape");
    } finally {
      this.isRestoringUndo = false;
    }
  }

  setupGlobalActionButtons() {
    const undoBtn = document.getElementById("undoBtn");
    const screenshotBtn = document.getElementById("screenshotBtn");

    undoBtn?.addEventListener("click", async () => {
      await this.undoLastChange();
    });

    screenshotBtn?.addEventListener("click", async (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (!this.renderer?.domElement) return;

      try {
        await this.captureCurrentCanvasScreenshot();
      } catch (err) {
        console.error("[PoolApp] Screenshot failed.", err);
      }
    });

    this.updateUndoButtonState();
  }


  async captureCurrentCanvasScreenshot() {
    const sourceCanvas = this.renderer?.domElement;
    if (!sourceCanvas) return;

    // Screenshot is now a pure pixel-copy of the already-rendered canvas.
    // Do not call renderer.render(), controls.update(), camera movement,
    // section refresh, cap rebuild, void refresh, PBR refresh, or caustics here.
    // The section + spa channel state is made from live temporary shader/cap/void
    // state, and rendering from the screenshot button can corrupt that state.
    await new Promise((resolve) => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });

    const width = sourceCanvas.width || sourceCanvas.clientWidth || 1;
    const height = sourceCanvas.height || sourceCanvas.clientHeight || 1;
    const copyCanvas = document.createElement("canvas");
    copyCanvas.width = width;
    copyCanvas.height = height;

    const ctx = copyCanvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not create screenshot canvas context.");
    ctx.drawImage(sourceCanvas, 0, 0, width, height);

    const filename = `pool-designer-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    const triggerDownload = (href) => {
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
    };

    if (copyCanvas.toBlob) {
      await new Promise((resolve, reject) => {
        copyCanvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Screenshot canvas did not produce a PNG blob."));
            return;
          }
          const url = URL.createObjectURL(blob);
          try {
            triggerDownload(url);
            resolve();
          } catch (err) {
            reject(err);
          } finally {
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
        }, "image/png");
      });
    } else {
      triggerDownload(copyCanvas.toDataURL("image/png"));
    }
  }

  // --------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------
  isPolygonShape() {
    return this.poolParams.shape === "freeform" || (!!this.editablePolygon && !!this.isCustomShape);
  }

  normalizeStarterPresetParams(params = {}) {
    return {
      ...params,
      shallow: 1.2,
      deep: 1.8,
      shallowFlat: 1,
      deepFlat: 1
    };
  }

  createRoundedCornerRectanglePolygon(length, width, radius = 2, corner = "back-right") {
    const l = Math.max(0.1, Number(length) || 6);
    const w = Math.max(0.1, Number(width) || 4);
    const r = Math.min(Math.max(0.05, Number(radius) || 2), l * 0.5, w * 0.5);
    const x0 = -l * 0.5;
    const x1 = l * 0.5;
    const y0 = -w * 0.5;
    const y1 = w * 0.5;
    const pts = [];
    const add = (x, y) => pts.push(new THREE.Vector2(x, y));
    const arc = (cx, cy, a0, a1, segments = 18) => {
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const a = a0 + (a1 - a0) * t;
        add(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
    };

    const selected = String(corner || "back-right").toLowerCase();

    if (selected === "front-left") {
      add(x0 + r, y0);
      add(x1, y0);
      add(x1, y1);
      add(x0, y1);
      add(x0, y0 + r);
      arc(x0 + r, y0 + r, Math.PI, Math.PI * 1.5);
    } else if (selected === "front-right") {
      add(x0, y0);
      add(x1 - r, y0);
      arc(x1 - r, y0 + r, Math.PI * 1.5, Math.PI * 2);
      add(x1, y1);
      add(x0, y1);
    } else if (selected === "back-left") {
      add(x0, y0);
      add(x1, y0);
      add(x1, y1);
      add(x0 + r, y1);
      arc(x0 + r, y1 - r, Math.PI * 0.5, Math.PI);
    } else {
      // back-right: opposite corner from the default left-side entry steps.
      add(x0, y0);
      add(x1, y0);
      add(x1, y1 - r);
      arc(x1 - r, y1 - r, 0, Math.PI * 0.5);
      add(x0, y1);
    }

    const clean = [];
    for (const point of pts) {
      const last = clean[clean.length - 1];
      if (!last || last.distanceToSquared(point) > 1e-10) clean.push(point);
    }

    const poly = new EditablePolygon(clean);
    poly.isRectangular = false;
    poly.minVertices = 3;
    return poly;
  }

  createStarterFootprintPolygon(preset) {
    const fp = preset?.customFootprint;
    if (!fp || fp.type !== "rounded-corner-rectangle") return null;
    const params = preset?.params || {};
    return this.createRoundedCornerRectanglePolygon(
      params.length,
      params.width,
      fp.radius,
      fp.corner
    );
  }

  destroyPoolEditor() {
    if (this.poolEditor) {
      this.poolEditor.dispose?.();
      this.poolEditor = null;
    }
    this._purgePoolEditorHandles();
  }

  _purgePoolEditorHandles() {
    if (!this.scene) return;
    const stale = [];
    this.scene.traverse((o) => {
      if (o?.userData?.kind === "vertex" || o?.userData?.kind === "edge") stale.push(o);
    });
    stale.forEach((o) => {
      try { o.parent?.remove(o); } catch (_) {}
      try { o.geometry?.dispose?.(); } catch (_) {}
      try { o.material?.dispose?.(); } catch (_) {}
    });
  }

  _getWallRaiseKey(wall) {
    if (!wall?.userData) return null;
    if (Number.isInteger(wall.userData.sourceEdgeIndex)) return `src:${wall.userData.sourceEdgeIndex}`;
    if (Number.isInteger(wall.userData.edgeIndex)) return `edge:${wall.userData.edgeIndex}`;
    return null;
  }

  _applyWallExtraToMeshesFromKey(key, extra = 0) {
    if (!this.poolGroup || key == null) return;

    const walls = [];
    this.poolGroup.traverse((o) => {
      if (o?.userData?.isWall && this._getWallRaiseKey(o) === key) walls.push(o);
    });
    if (!walls.length) return;

    const safeExtra = Math.max(0, Number.isFinite(extra) ? extra : 0);
    const copingSegments = this.poolGroup.userData?.copingSegments;
    const resolveCopingSegmentForWall = (wall) => {
      if (!copingSegments) return null;
      if (Array.isArray(copingSegments)) {
        const idx = wall?.userData?.copingIndex;
        return (idx != null) ? copingSegments[idx] : null;
      }
      const key = wall?.userData?.copingKey ?? wall?.userData?.side;
      if (key != null && typeof copingSegments === "object") {
        return copingSegments[key] || null;
      }
      return null;
    };

    walls.forEach((wall) => {
      let baseHeight = wall.userData?.baseHeight;
      if (!isFinite(baseHeight) || baseHeight <= 0) {
        const params = wall.geometry?.parameters;
        baseHeight = (params && typeof params.depth === "number" && params.depth > 0) ? params.depth : 1;
        wall.userData.baseHeight = baseHeight;
      }

      const newHeight = baseHeight + safeExtra;
      const scaleZ = newHeight / baseHeight;
      wall.scale.z = scaleZ;
      // v7.1-style wall raise behaviour: keep the bottom anchored at the pool
      // floor depth while the top rises by half of the added height.
      wall.position.z = -(baseHeight / 2) + safeExtra / 2;
      wall.userData.currentHeight = newHeight;
      wall.userData.extraHeight = safeExtra;
      try { this.updateScaledBoxTilingUVs(wall); } catch (_) {}

      const seg = resolveCopingSegmentForWall(wall);
      if (seg) {
        if (!seg.userData) seg.userData = {};
        if (seg.userData.baseZ == null) seg.userData.baseZ = seg.position.z;
        // Raised feature walls are intentionally uncapped. Restore the coping
        // only when that wall returns to its normal height.
        seg.position.z = seg.userData.baseZ;
        seg.visible = safeExtra <= 0.001;
      }
    });

    const copingRing = this.poolGroup.userData?.copingMesh;
    if (!copingSegments && copingRing) {
      if (!copingRing.userData) copingRing.userData = {};
      if (copingRing.userData.baseZ == null) copingRing.userData.baseZ = copingRing.position.z;
      let maxExtra = 0;
      this.poolGroup.traverse((o) => {
        if (!o?.userData?.isWall) return;
        const e = o.userData?.extraHeight || 0;
        if (e > maxExtra) maxExtra = e;
      });
      // Continuous coping rings cannot be moved with one selected wall. Keep
      // their authored datum so the rest of the pool and paving stay level.
      copingRing.position.z = copingRing.userData.baseZ;
    }
  }

  _reapplySavedWallRaiseState() {
    if (!this.poolGroup) return;
    const entries = Object.entries(this.wallRaiseBySourceEdge || {});
    entries.forEach(([key, extra]) => {
      if (Number.isFinite(extra) && extra > 0) {
        this._applyWallExtraToMeshesFromKey(key, extra);
      }
    });
  }

  getPoolElevation() {
    if (!this.poolParams?.raised) return 0;
    const configured = Number(this.poolParams?.poolElevation);
    return Number.isFinite(configured) ? THREE.MathUtils.clamp(configured, 0.1, 1.5) : RAISED_POOL_HEIGHT;
  }

  _applyElevationDelta(root, targetElevation) {
    if (!root?.position) return;
    if (!root.userData) root.userData = {};

    let previous = Number(root.userData.poolElevationApplied) || 0;
    const lastAppliedZ = Number(root.userData.poolElevationLastZ);

    // Some geometry updates (especially updateSpa) recalculate the root Z from
    // its unraised dimensions. Detect that reset and reapply the full elevation.
    if (Number.isFinite(lastAppliedZ) && Math.abs(root.position.z - lastAppliedZ) > 1e-6) {
      previous = 0;
    }

    root.position.z += targetElevation - previous;
    root.userData.poolElevationApplied = targetElevation;
    root.userData.poolElevationLastZ = root.position.z;

    // Pool/spa channel geometry is rebuilt from world-space coping bounds. Force
    // the new elevation through the matrix hierarchy immediately so a rebuild in
    // this same call stack cannot read the previous unraised world transform.
    root.updateWorldMatrix?.(true, true);
  }

  _removeRaisedEntryPaving() {
    const group = this.ground?.userData?.raisedEntryPavingGroup;
    if (!group) return;
    group.parent?.remove(group);
    group.traverse?.((obj) => {
      if (obj?.geometry) obj.geometry.dispose?.();
      // The platform deliberately shares the standard paving material so the
      // texture remains identical. Do not dispose the shared material here.
    });
    this.ground.userData.raisedEntryPavingGroup = null;
  }

  _getBasePoolCopingTopWorldZ() {
    if (!this.poolGroup) return null;
    const candidates = [];
    const segments = this.poolGroup.userData?.copingSegments;
    if (Array.isArray(segments)) candidates.push(...segments);
    else if (segments && typeof segments === 'object') candidates.push(...Object.values(segments));
    if (this.poolGroup.userData?.copingMesh) candidates.push(this.poolGroup.userData.copingMesh);
    if (!candidates.length) {
      this.poolGroup.children?.forEach((child) => {
        if (child?.userData?.isCoping) candidates.push(child);
      });
    }
    let top = -Infinity;
    candidates.filter(Boolean).forEach((object) => {
      object.updateWorldMatrix?.(true, false);
      const bounds = new THREE.Box3().setFromObject(object);
      if (!Number.isFinite(bounds.max.z)) return;
      const baseZ = Number(object.userData?.baseZ);
      const localZ = Number(object.position?.z);
      const baseTop = Number.isFinite(baseZ) && Number.isFinite(localZ)
        ? bounds.max.z + (baseZ - localZ)
        : bounds.max.z;
      top = Math.max(top, baseTop);
    });
    return Number.isFinite(top) ? top : null;
  }

  _updateRaisedEntryPaving() {
    const ground = this.ground || this.scene?.userData?.ground;
    if (!ground || !this.scene) return;
    this._removeRaisedEntryPaving();
    const elevation = this.getPoolElevation();
    const isRaised = !!this.poolParams?.raised && elevation > 0.001;
    const standardPaving = ground?.userData?.poolPavingMesh;

    // A spa edit can rebuild the standard paving mesh after the pool has already
    // been raised. Hide every standard perimeter-paving mesh, not only the
    // reference currently stored on the ground, so a newly rebuilt full paving
    // ring can never reappear behind the raised entry platform.
    this.scene.traverse?.((obj) => {
      if (!obj?.isMesh || !obj.userData?.isPoolPaving) return;
      if (obj.userData?.isRaisedEntryPaving) return;
      obj.visible = !isRaised;
    });
    if (standardPaving) standardPaving.visible = !isRaised;
    if (!isRaised || !this.poolGroup || !standardPaving) return;

    const steps = [];
    this.poolGroup.traverse((obj) => {
      if (obj?.isMesh && obj.userData?.isStep && !obj.userData?.isStepAddon) steps.push(obj);
    });
    if (!steps.length) return;

    const stepBounds = new THREE.Box3();
    steps.forEach((step) => {
      step.updateWorldMatrix?.(true, false);
      stepBounds.union(new THREE.Box3().setFromObject(step));
    });
    if (stepBounds.isEmpty()) return;

    const contours = getPoolPavingContours(this.poolGroup);
    if (!contours?.inner?.length || contours.inner.length !== contours.outer.length) return;

    const inner = contours.inner;
    const outer = contours.outer;
    const stepCenter = stepBounds.getCenter(new THREE.Vector3());

    let stripPoints = null;
    const shapeKey = String(this.poolParams?.shape || '').toLowerCase();
    const isRectangle = shapeKey === 'rectangular' || shapeKey === 'rectangle' || shapeKey === 'rect';
    if (isRectangle) {
      // Rectangle entry paving is a square-ended platform behind the entry
      // wall. Its inside edge stops at the outside coping/shell line and its
      // two ends align with that shell instead of widening around the corners.
      const innerBox = new THREE.Box2().setFromPoints(inner);
      const outerBox = new THREE.Box2().setFromPoints(outer);
      const entry = this._getEntryStepInfo(Number(this.poolParams.length || 8), Number(this.poolParams.width || 4));
      if (entry.side === 'front') {
        stripPoints = [
          new THREE.Vector2(innerBox.min.x, innerBox.min.y),
          new THREE.Vector2(innerBox.max.x, innerBox.min.y),
          new THREE.Vector2(innerBox.max.x, outerBox.min.y),
          new THREE.Vector2(innerBox.min.x, outerBox.min.y)
        ];
      } else if (entry.side === 'back') {
        stripPoints = [
          new THREE.Vector2(innerBox.max.x, innerBox.max.y),
          new THREE.Vector2(innerBox.min.x, innerBox.max.y),
          new THREE.Vector2(innerBox.min.x, outerBox.max.y),
          new THREE.Vector2(innerBox.max.x, outerBox.max.y)
        ];
      } else if (entry.side === 'left') {
        stripPoints = [
          new THREE.Vector2(innerBox.min.x, innerBox.max.y),
          new THREE.Vector2(innerBox.min.x, innerBox.min.y),
          new THREE.Vector2(outerBox.min.x, innerBox.min.y),
          new THREE.Vector2(outerBox.min.x, innerBox.max.y)
        ];
      } else {
        stripPoints = [
          new THREE.Vector2(innerBox.max.x, innerBox.min.y),
          new THREE.Vector2(innerBox.max.x, innerBox.max.y),
          new THREE.Vector2(outerBox.max.x, innerBox.max.y),
          new THREE.Vector2(outerBox.max.x, innerBox.min.y)
        ];
      }
    } else {
      // Curved and edited pools keep their authored paving contour so the
      // platform follows the shell rather than replacing it with a rectangle.
      let centerIndex = 0;
      let nearest = Infinity;
      for (let i = 0; i < inner.length; i++) {
        const dx = inner[i].x - stepCenter.x;
        const dy = inner[i].y - stepCenter.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearest) { nearest = d2; centerIndex = i; }
      }

      const margin = 0.25;
      const stepSize = stepBounds.getSize(new THREE.Vector3());
      const targetArcLength = Math.max(0.8, Math.max(stepSize.x, stepSize.y) + margin * 2);
      const halfArc = targetArcLength * 0.5;
      const n = inner.length;
      const walk = (direction) => {
        const indices = [centerIndex];
        let travelled = 0;
        let current = centerIndex;
        while (travelled < halfArc && indices.length < n) {
          const next = (current + direction + n) % n;
          travelled += inner[current].distanceTo(inner[next]);
          indices.push(next);
          current = next;
        }
        return indices;
      };
      const arcIndices = walk(-1).reverse().concat(walk(1).slice(1));
      if (arcIndices.length < 2) return;
      const innerArc = arcIndices.map((i) => new THREE.Vector2(inner[i].x, inner[i].y));
      const outerArc = arcIndices.map((i) => new THREE.Vector2(outer[i].x, outer[i].y));
      const squareOuterEndpoint = (innerPoint, innerNeighbour, originalOuter) => {
        const tangent = innerNeighbour.clone().sub(innerPoint).normalize();
        let across = new THREE.Vector2(-tangent.y, tangent.x);
        const wanted = originalOuter.clone().sub(innerPoint);
        if (across.dot(wanted) < 0) across.multiplyScalar(-1);
        return innerPoint.clone().addScaledVector(across, Math.max(0.05, wanted.length()));
      };
      outerArc[0] = squareOuterEndpoint(innerArc[0], innerArc[1], outerArc[0]);
      const last = innerArc.length - 1;
      outerArc[last] = squareOuterEndpoint(innerArc[last], innerArc[last - 1], outerArc[last]);
      stripPoints = [...innerArc, ...outerArc.slice().reverse()];
    }
    if (!stripPoints?.length) return;

    const shape = new THREE.Shape(stripPoints);

    // Anchor the extrusion to the actual ground surface and terminate it at the
    // same top level as the normal paving. This avoids both floating and double-raising.
    ground.updateWorldMatrix?.(true, false);
    standardPaving.updateWorldMatrix?.(true, false);
    const groundBounds = new THREE.Box3().setFromObject(ground);
    const pavingBounds = new THREE.Box3().setFromObject(standardPaving);
    const groundTop = Number.isFinite(groundBounds.max.z) ? groundBounds.max.z : 0;
    const pavingTop = Number.isFinite(pavingBounds.max.z) ? pavingBounds.max.z : groundTop;
    // A raised individual wall must never lift the paving. Resolve the authored
    // base coping datum (including whole-pool elevation) and ignore wall-extra
    // height when sizing the entry paving platform.
    const copingTop = this._getBasePoolCopingTopWorldZ();
    const platformTop = Number.isFinite(copingTop)
      ? copingTop
      : Math.max(pavingTop, groundTop + elevation);
    const platformHeight = Math.max(0.05, platformTop - groundTop);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: platformHeight,
      bevelEnabled: false,
      curveSegments: 1,
      steps: 1
    });

    // Match the standard paving's world-planar tile scale on both top and walls.
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    if (pos && uv) {
      const tileSize = 2.4;
      for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, pos.getX(i) / tileSize, pos.getY(i) / tileSize);
      }
      uv.needsUpdate = true;
      geometry.setAttribute('uv2', new THREE.BufferAttribute(new Float32Array(uv.array), 2));
    }

    const platform = new THREE.Mesh(geometry, standardPaving.material);
    platform.name = 'Raised entry-step paving platform';
    platform.position.z = groundTop;
    platform.castShadow = true;
    platform.receiveShadow = true;
    platform.renderOrder = standardPaving.renderOrder || 2;
    platform.userData.isPoolPaving = true;
    platform.userData.isRaisedEntryPaving = true;

    const group = new THREE.Group();
    group.name = 'Raised entry-step paving';
    group.add(platform);
    this.scene.add(group);
    ground.userData.raisedEntryPavingGroup = group;
  }

  applyPoolElevation() {
    const elevation = this.getPoolElevation();
    this.poolParams.poolElevation = elevation;

    // The pool group contains the shell, floor, water, coping, steps and benches.
    this._applyElevationDelta(this.poolGroup, elevation);

    // The infinity catch tank is ground-fixed even though its feature group is
    // parented to the raised pool. Counteract the pool elevation only for the
    // tank floor, tank walls, tank coping and catch water. Pool-wall extensions
    // remain attached to the raised pool as intended.
    this.poolFeatureGroup?.traverse?.((object) => {
      if (object?.userData?.isInfinityTankGroundFixed && object.position) {
        if (!Number.isFinite(object.userData.infinityTankBaseZ)) {
          object.userData.infinityTankBaseZ = object.position.z + elevation;
        }
        object.position.z = object.userData.infinityTankBaseZ - elevation;
      }

      // Keep only the bottom edge of the infinity sheet fixed to the catch-water
      // surface. The top vertices stay local to the raised pool and therefore
      // continue following the main pool water level.
      if (object?.userData?.isInfinitySpillover && object.geometry?.attributes?.position) {
        const fixedBottomZ = Number(object.userData.infinitySheetBottomFixedZ);
        const bottomIndices = object.userData.infinitySheetBottomVertexIndices;
        if (Number.isFinite(fixedBottomZ) && Array.isArray(bottomIndices)) {
          const positions = object.geometry.attributes.position;
          for (const vertexIndex of bottomIndices) {
            positions.setZ(vertexIndex, fixedBottomZ - elevation);
          }
          positions.needsUpdate = true;
          object.geometry.computeVertexNormals?.();
          object.geometry.computeBoundingSphere?.();
        }
      }

      // The two pool-wall extensions beside the infinity sheet must reach the
      // fixed catch-tank floor. Their top edges remain part of the raised pool,
      // while only their lower vertices are counteracted as elevation changes.
      if ((object?.userData?.isInfinityPoolWallExtension || object?.userData?.isInfinitySpillwayWall) && object.geometry?.attributes?.position) {
        const fixedBottomZ = Number(object.userData.infinityPoolWallBottomFixedZ);
        const bottomIndices = object.userData.infinityPoolWallBottomVertexIndices;
        if (Number.isFinite(fixedBottomZ) && Array.isArray(bottomIndices)) {
          const positions = object.geometry.attributes.position;
          const localBottomZ = fixedBottomZ - elevation - Number(object.position?.z || 0);
          for (const vertexIndex of bottomIndices) {
            positions.setZ(vertexIndex, localBottomZ);
          }
          positions.needsUpdate = true;
          object.geometry.computeVertexNormals?.();
          object.geometry.computeBoundingBox?.();
          object.geometry.computeBoundingSphere?.();
        }
      }
    });

    // The spa and channel are separate scene roots, so move them by the same delta.
    this._applyElevationDelta(this.spa, elevation);
    this._applyElevationDelta(this.ground?.userData?.spaChannelGroup, elevation);
    this._applyElevationDelta(this.ground?.userData?.spaChannelWaterGroup, elevation);

    // Every spa throat/coping/wall/water void is authored in WORLD coordinates,
    // not as a child transform of the pool. Refresh those clipping planes after
    // the pool + spa + channel have all reached the new elevation. This keeps the
    // voids rigidly locked to the same height during both raising and lowering.
    this.poolGroup?.updateWorldMatrix?.(true, true);
    this.spa?.updateWorldMatrix?.(true, true);
    this.ground?.userData?.spaChannelGroup?.updateWorldMatrix?.(true, true);
    this.ground?.userData?.spaChannelWaterGroup?.updateWorldMatrix?.(true, true);
    try { updatePoolWaterVoid(this.poolGroup, this.spa); } catch (_) {}

    // For a raised pool, replace the full perimeter paving with one raised
    // platform behind the entry steps. Its vertical paving faces remain
    // attached to the unchanged ground plane.
    this._updateRaisedEntryPaving();
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => this._updateRaisedEntryPaving());
    }

    this._updateDimensionHandles?.();
    this._updateSpaDimensionHandles?.();
    this._updateSectionDimensionHandles?.();
  }

  async setPoolRaised(enabled, { captureUndo = true, focusCamera = false } = {}) {
    const next = !!enabled;
    if (!!this.poolParams.raised === next) {
      this.applyPoolElevation();
      this.syncPoolRaisedControl();
      return;
    }

    if (captureUndo) this.captureUndoState?.(next ? "Raise pool" : "Lower pool");
    this.poolParams.raised = next;
    if (next) {
      const current = Number(this.poolParams.poolElevation);
      this.poolParams.poolElevation = Number.isFinite(current) && current > 0 ? current : RAISED_POOL_HEIGHT;
    } else {
      this.poolParams.poolElevation = 0;
    }
    this.applyPoolElevation();
    if (!next) {
      // The standard paving outline is calculated from the pool's world-space
      // shell. Rebuild it only after the shell has returned to ground level so
      // lowering a previously raised pool cannot retain the raised platform or
      // a stale elevated paving ring.
      try {
        updateGroundVoid(this.ground || this.scene?.userData?.ground, this.poolGroup, this.spa);
        updateGrassForPool(this.scene, this.poolGroup);
        this._updateRaisedEntryPaving();
      } catch (_) {}
    }
    this.syncPoolRaisedControl();
    this.rebuildPoolFeatures?.();
    this._syncInternalFeatureControls?.();

    document.dispatchEvent(new CustomEvent("poolElevationChanged", {
      detail: { raised: next, elevation: this.poolParams.poolElevation }
    }));
  }

  async setPoolElevationHeight(height, { captureUndo = false } = {}) {
    const nextHeight = THREE.MathUtils.clamp(Number(height) || RAISED_POOL_HEIGHT, 0.1, 1.5);
    if (captureUndo) this.captureUndoState?.("Change raised pool height");
    this.poolParams.raised = true;
    this.poolParams.poolElevation = nextHeight;
    this.applyPoolElevation();
    this.syncPoolRaisedControl();
    document.dispatchEvent(new CustomEvent("poolElevationChanged", {
      detail: { raised: true, elevation: nextHeight }
    }));
  }

  syncPoolRaisedControl() {
    const btn = document.getElementById("raisedPoolToggle");
    if (!btn) return;
    const raised = !!this.poolParams?.raised;
    btn.setAttribute("aria-pressed", raised ? "true" : "false");
    btn.classList.toggle("active", raised);
    btn.textContent = raised ? "Lower Pool to Ground" : "Raise Pool 0.7 m";
  }

  setupPoolElevationControl() {
    const btn = document.getElementById("raisedPoolToggle");
    if (!btn || btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";
    btn.addEventListener("click", async () => {
      await this.setPoolRaised(!this.poolParams?.raised);
    });
    this.syncPoolRaisedControl();
  }

  // --------------------------------------------------------------
  // OPTIONAL POOL FEATURES
  // --------------------------------------------------------------
  _disposePoolFeatureGroup() {
    const ground = this.ground || this.scene?.userData?.ground;
    if (ground?.userData?.extraGroundVoids) {
      ground.userData.extraGroundVoids = ground.userData.extraGroundVoids.filter(
        (entry) => entry?.name !== 'infinity-catch-tank' && !String(entry?.name || '').startsWith('wet-edge-tank-')
      );
    }
    const group = this.poolFeatureGroup;
    if (!group) return;
    if (Array.isArray(this.poolGroup?.userData?.animatables)) {
      const belongsToDisposedGroup = (object) => {
        let current = object;
        while (current) {
          if (current === group) return true;
          current = current.parent;
        }
        return false;
      };
      this.poolGroup.userData.animatables = this.poolGroup.userData.animatables.filter(
        (object) => !belongsToDisposedGroup(object)
      );
    }
    group.parent?.remove(group);
    group.traverse((object) => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => material.dispose?.());
    });
    this.poolFeatureGroup = null;
  }

  _featureMaterial(color, options = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? 0.42,
      metalness: options.metalness ?? 0.08,
      transparent: !!options.transparent,
      opacity: options.opacity ?? 1,
      side: options.side ?? THREE.FrontSide,
      depthWrite: options.depthWrite ?? true
    });
  }

  _addFeatureMesh(group, geometry, material, position, rotation = null, name = '') {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x || 0, position.y || 0, position.z || 0);
    if (rotation) mesh.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    group.add(mesh);
    return mesh;
  }

  _getGroundTopLocalZ() {
    const ground = this.ground || this.scene?.userData?.ground;
    if (!ground || !this.poolGroup) return -Math.max(Number(this.poolParams?.deep || 1.8), 1.8);
    ground.updateWorldMatrix?.(true, false);
    this.poolGroup.updateWorldMatrix?.(true, false);
    const bounds = new THREE.Box3().setFromObject(ground);
    const poolWorld = this.poolGroup.getWorldPosition(new THREE.Vector3());
    return (Number.isFinite(bounds.max.z) ? bounds.max.z : 0) - poolWorld.z;
  }


  _getPoolCopingWorldTopZ() {
    if (!this.poolGroup) return this.getPoolElevation() + 0.05;
    this.poolGroup.updateWorldMatrix?.(true, true);

    const candidates = [];
    this.poolGroup.traverse((object) => {
      if (!object?.isMesh || !object.userData?.isCoping) return;
      const name = String(object.name || '').toLowerCase();
      // Prefer the pool perimeter coping, not raised/tank/return coping that can
      // legitimately sit at a different level.
      if (
        object.userData?.isInfinityTankGroundFixed ||
        name.includes('tank') || name.includes('catch') ||
        name.includes('raised') || name.includes('return')
      ) return;
      const box = new THREE.Box3().setFromObject(object);
      if (!box.isEmpty() && Number.isFinite(box.max.z)) candidates.push(box.max.z);
    });

    if (candidates.length) {
      // Multiple coping segments should share the same level. Using the lowest
      // valid top avoids a raised special coping segment lifting every handle.
      return Math.min(...candidates);
    }

    // If an infinity rebuild temporarily hides/replaces coping metadata, derive
    // the stable world coping level from the ground datum rather than water bounds.
    return this.getPoolElevation() + this._getGroundTopLocalZ() + 0.05;
  }


  _getInfinityHandleWorldZ() {
    return this._getPoolCopingWorldTopZ() + 0.006;
  }


  _getPoolWaterSurfaceLocalZ(defaultZ = -0.10) {
    const water = this.poolGroup?.userData?.waterMesh || null;
    if (!water?.geometry) return defaultZ;
    water.geometry.computeBoundingBox?.();
    const maxZ = Number(water.geometry.boundingBox?.max?.z);
    const positionZ = Number(water.position?.z || 0);
    return Number.isFinite(maxZ) ? positionZ + maxZ : defaultZ;
  }

  _getEntryStepInfo(length, width) {
    const steps = [];
    this.poolGroup?.traverse?.((obj) => {
      if (obj?.isMesh && obj.userData?.isStep && !obj.userData?.isStepAddon) steps.push(obj);
    });
    if (!steps.length) return { side: 'front', center: new THREE.Vector3(0, -width / 2, 0), topZ: 0 };

    const combined = new THREE.Box3();
    steps.forEach(step => {
      step.updateWorldMatrix?.(true, false);
      combined.union(new THREE.Box3().setFromObject(step));
    });
    const worldCenter = combined.getCenter(new THREE.Vector3());
    const localCenter = this.poolGroup.worldToLocal(worldCenter.clone());
    const dxLeft = Math.abs(localCenter.x + length / 2);
    const dxRight = Math.abs(length / 2 - localCenter.x);
    const dyFront = Math.abs(localCenter.y + width / 2);
    const dyBack = Math.abs(width / 2 - localCenter.y);
    const min = Math.min(dxLeft, dxRight, dyFront, dyBack);
    const side = min === dxLeft ? 'left' : min === dxRight ? 'right' : min === dyFront ? 'front' : 'back';

    let topStep = null;
    let topZ = -Infinity;
    for (const step of steps) {
      const box = new THREE.Box3().setFromObject(step);
      if (box.max.z > topZ) { topZ = box.max.z; topStep = step; }
    }
    let topCenter = localCenter;
    if (topStep) {
      const box = new THREE.Box3().setFromObject(topStep);
      topCenter = this.poolGroup.worldToLocal(box.getCenter(new THREE.Vector3()));
      topZ = this.poolGroup.worldToLocal(new THREE.Vector3(box.getCenter(new THREE.Vector3()).x, box.getCenter(new THREE.Vector3()).y, box.max.z)).z;
    }
    let topStepSpan = 0;
    let topStepTangent = (side === 'front' || side === 'back')
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
    if (topStep) {
      const box = new THREE.Box3().setFromObject(topStep);
      const size = box.getSize(new THREE.Vector3());
      topStepSpan = (side === 'front' || side === 'back') ? size.x : size.y;
    }
    return { side, center: localCenter, topStepCenter: topCenter, topZ, topStepSpan, topStepTangent };
  }

  _oppositeSide(side) {
    return ({ front:'back', back:'front', left:'right', right:'left' })[side] || 'back';
  }

  _sideFrame(side, length, width, outside = 0) {
    if (side === 'front') return { center:new THREE.Vector3(0, -width/2-outside, 0), tangent:new THREE.Vector3(1,0,0), inward:new THREE.Vector3(0,1,0), span:length };
    if (side === 'back') return { center:new THREE.Vector3(0, width/2+outside, 0), tangent:new THREE.Vector3(1,0,0), inward:new THREE.Vector3(0,-1,0), span:length };
    if (side === 'left') return { center:new THREE.Vector3(-length/2-outside, 0, 0), tangent:new THREE.Vector3(0,1,0), inward:new THREE.Vector3(1,0,0), span:width };
    return { center:new THREE.Vector3(length/2+outside, 0, 0), tangent:new THREE.Vector3(0,1,0), inward:new THREE.Vector3(-1,0,0), span:width };
  }

  _hasVisiblePaving() {
    if (this.poolParams?.raised) return !!(this.ground?.userData?.raisedEntryPavingGroup);
    let found = false;
    this.scene?.traverse?.(obj => {
      if (obj?.isMesh && obj.userData?.isPoolPaving && obj.visible !== false) found = true;
    });
    return found;
  }

  _hasRaisedWall() {
    // Raising the complete pool does not create a raised feature wall. Spouts
    // and blades need a wall that has been lifted independently in the scene.
    return Object.values(this.wallRaiseBySourceEdge || {}).some(v => Number(v) > 0.001);
  }

  _syncInternalFeatureControls() {
    const availability = this.getPoolFeatureAvailability?.() || {};
    document.querySelectorAll('[data-model-feature]').forEach((button) => {
      const feature = button.dataset.modelFeature;
      const isCurve = feature === 'curved-wall';
      const selected = isCurve ? (!!this._polygonHasCurves?.() || !!this.customizeMode) : !!this.poolFeatures?.has?.(feature);
      const available = isCurve
        ? !['oval','kidney'].includes(String(this.poolParams?.shape || '').toLowerCase())
        : availability[feature] !== false;
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-disabled', String(!available));
      button.classList.toggle('is-selected', selected);
      if (!available) {
        const reasons = {
          'acrylic-window':'Raise the pool to enable this feature.',
          'infinity-edge':'Raise the pool to enable this feature.',
          'spout-water-features':'Raise a pool wall to enable this feature.',
          'blade-water-features':'Raise a pool wall to enable this feature.',
          'laminar-jets':'Paving is required at the installation edge.',
          'curved-wall':'Curved-wall editing is not available for this pool shape.'
        };
        button.title = reasons[feature] || 'This feature is not available for the current pool configuration.';
      } else {
        button.removeAttribute('title');
      }
    });
  }

  setupInternalFeatureControls() {
    if (this._internalFeatureControlsSetup) return;
    this._internalFeatureControlsSetup = true;
    const note = document.getElementById('modelFeatureNote');
    document.querySelectorAll('[data-model-feature]').forEach((button) => {
      button.addEventListener('click', async () => {
        const feature = button.dataset.modelFeature;
        const unavailable = button.getAttribute('aria-disabled') === 'true';
        if (unavailable) {
          if (feature === 'spout-water-features' || feature === 'blade-water-features') this.promptRaiseWallForFeature?.(feature);
          if (note) note.textContent = button.title || 'This feature is not available for the current pool configuration.';
          return;
        }
        if (feature === 'curved-wall') {
          const enable = !(this._polygonHasCurves?.() || this.customizeMode);
          await this.setCurvedWallEnabled?.(enable);
          if (note) note.textContent = enable
            ? 'Select two adjacent walls to create the curved wall. Drag the blue radius handle after it is applied.'
            : 'Curved wall removed.';
          this._syncInternalFeatureControls();
          return;
        }
        const enabled = !this.poolFeatures.has(feature);
        const changed = this.setPoolFeature(feature, enabled);
        if (note) note.textContent = changed
          ? `${enabled ? 'Added' : 'Removed'} ${String(button.textContent || feature).trim()}.`
          : (button.title || 'That feature cannot be changed for the current pool configuration.');
        this._syncInternalFeatureControls();
      });
    });
    this._syncInternalFeatureControls();
  }

  getPoolFeatureAvailability() {
    const hasPaving = this._hasVisiblePaving();
    const hasRaisedWall = this._hasRaisedWall();
    return {
      'bar-stools': true,
      'laminar-jets': hasPaving,
      'bubblers': true,
      'acrylic-window': !!this.poolParams?.raised && this.getPoolElevation() > 0.001,
      'infinity-edge': !!this.poolParams?.raised && this.getPoolElevation() > 0.001,
      'spout-water-features': hasRaisedWall,
      'blade-water-features': hasRaisedWall
    };
  }

  _getPoolTileMaterial() {
    let material = null;
    this.poolGroup?.traverse?.(obj => {
      if (material || !obj?.isMesh) return;
      if (obj.userData?.isWall || obj.userData?.isPoolFloor) {
        const candidate = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        if (candidate) material = candidate.clone();
      }
    });
    return material || this._featureMaterial(0x2d83b7, { roughness: 0.48 });
  }

  _createBarStools(group, length, width) {
    const steel = this._featureMaterial(0x8e969b, { metalness: 0.68, roughness: 0.24 });
    const seat = this._featureMaterial(0xe9e7df, { roughness: 0.36 });
    const entry = this._getEntryStepInfo(length, width);
    const side = this._oppositeSide(entry.side);
    const frame = this._sideFrame(side, length, width, 0);
    const seatZ = -0.45;
    const floorZ = -Math.max(Number(this.poolParams?.deep || 1.8), 0.6);
    const legTop = seatZ - 0.055;
    const legHeight = Math.max(0.12, legTop - floorZ);
    const savedAnchor = Array.isArray(this.barStoolPlacements) && this.barStoolPlacements[1]
      ? new THREE.Vector2(this.barStoolPlacements[1].x, this.barStoolPlacements[1].y)
      : new THREE.Vector2(frame.center.x, frame.center.y);
    // Bar stools are one coordinated feature set. Re-project the saved centre
    // stool on every rebuild so old projects and resized pools always load with
    // every stool centre exactly 450 mm off the finished internal wall.
    const defaults = this._getBarStoolGroupPlacements(savedAnchor, 1, 0.45);
    this.barStoolPlacements = defaults;
    [-0.8, 0, 0.8].forEach((offset, index) => {
      const placement = this.barStoolPlacements[index] || defaults[index];
      const stool = new THREE.Group();
      stool.name = `bar-stool-${index}`;
      stool.position.set(placement.x, placement.y, 0);
      stool.rotation.z = Number(placement.rotation) || 0;
      stool.userData.isBarStool = true;
      stool.userData.barStoolIndex = index;
      const post = this._addFeatureMesh(stool, new THREE.CylinderGeometry(0.045, 0.055, legHeight, 18), steel.clone(),
        { x:0, y:0, z:floorZ + legHeight / 2 }, { x: Math.PI / 2, y: 0, z: 0 }, `bar-stool-post-${index}`);
      const seatMesh = this._addFeatureMesh(stool, new THREE.CylinderGeometry(0.24, 0.24, 0.09, 28), seat.clone(),
        { x:0, y:0, z:seatZ }, { x: Math.PI / 2, y: 0, z: 0 }, `bar-stool-seat-${index}`);
      // A small foot rail makes the stool's wall orientation visible while the
      // circular seat remains comfortable and visually familiar.
      const rail = this._addFeatureMesh(stool, new THREE.BoxGeometry(0.34, 0.035, 0.035), steel.clone(),
        { x:0, y:0, z:seatZ - 0.32 }, null, `bar-stool-rail-${index}`);
      [post, seatMesh, rail].forEach((mesh) => {
        mesh.userData.isBarStool = true;
        mesh.userData.barStoolIndex = index;
      });
      group.add(stool);
    });
  }

  _getBarStoolGroupPlacements(anchorPoint, anchorIndex = 1, wallOffset = 0.45) {
    const target = anchorPoint?.isVector2
      ? anchorPoint.clone()
      : new THREE.Vector2(Number(anchorPoint?.x) || 0, Number(anchorPoint?.y) || 0);
    const anchor = this._nearestPoolBoundaryPlacement(target, wallOffset);
    if (!anchor) return [];
    const spacing = 0.80;
    return [0, 1, 2].map((index) => {
      const boundaryTarget = anchor.boundary.clone().addScaledVector(
        anchor.tangent,
        (index - anchorIndex) * spacing
      );
      const placement = this._nearestPoolBoundaryPlacement(boundaryTarget, wallOffset) || anchor;
      return {
        x: placement.center.x,
        y: placement.center.y,
        rotation: Math.atan2(placement.tangent.y, placement.tangent.x)
      };
    });
  }

  _nearestPoolBoundaryPlacement(localPoint, offset = 0.4) {
    const source = Array.isArray(this.poolGroup?.userData?.outerPts)
      ? this.poolGroup.userData.outerPts
      : [];
    const points = source
      .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
      .map((point) => new THREE.Vector2(point.x, point.y));
    if (points.length > 3 && points[0].distanceToSquared(points[points.length - 1]) < 1e-10) points.pop();
    if (points.length < 3 || !localPoint) return null;

    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i], b = points[(i + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    const ccw = area > 0;
    const target = new THREE.Vector2(localPoint.x, localPoint.y);
    let best = null;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i], b = points[(i + 1) % points.length];
      const segment = b.clone().sub(a);
      const lengthSq = segment.lengthSq();
      if (lengthSq < 1e-10) continue;
      const t = THREE.MathUtils.clamp(target.clone().sub(a).dot(segment) / lengthSq, 0, 1);
      const boundary = a.clone().addScaledVector(segment, t);
      const distanceSq = boundary.distanceToSquared(target);
      if (best && distanceSq >= best.distanceSq) continue;
      const tangent = segment.normalize();
      const outward = ccw
        ? new THREE.Vector2(tangent.y, -tangent.x)
        : new THREE.Vector2(-tangent.y, tangent.x);
      const inward = outward.clone().multiplyScalar(-1);
      best = {
        edgeIndex: i,
        distanceSq,
        boundary,
        tangent,
        outward,
        inward,
        center: boundary.clone().addScaledVector(inward, Math.max(0, Number(offset) || 0))
      };
    }
    return best;
  }

  _getAutomaticPoolLightElevation(localBoundary, defaultZ = -0.62) {
    if (!this.poolGroup || !localBoundary) return defaultZ;
    this.poolGroup.updateWorldMatrix?.(true, true);
    const inversePoolMatrix = new THREE.Matrix4().copy(this.poolGroup.matrixWorld).invert();
    const lateralTolerance = 0.06;
    const verticalClearance = 0.18;
    let resolvedZ = defaultZ;

    this.poolGroup.traverse((object) => {
      if (!object?.isMesh) return;
      const data = object.userData || {};
      if (!(data.isStep || data.isBench) || data.isStepAddon) return;
      const worldBox = new THREE.Box3().setFromObject(object);
      if (worldBox.isEmpty()) return;
      const localMin = worldBox.min.clone().applyMatrix4(inversePoolMatrix);
      const localMax = worldBox.max.clone().applyMatrix4(inversePoolMatrix);
      const intersectsWallLocation = (
        localBoundary.x >= localMin.x - lateralTolerance &&
        localBoundary.x <= localMax.x + lateralTolerance &&
        localBoundary.y >= localMin.y - lateralTolerance &&
        localBoundary.y <= localMax.y + lateralTolerance
      );
      if (!intersectsWallLocation) return;
      const candidateZ = Math.min(-0.18, localMax.z + verticalClearance);
      resolvedZ = Math.max(resolvedZ, candidateZ);
    });

    return resolvedZ;
  }


  _getPoolBoundarySamples(stepLength = 0.18) {
    const source = Array.isArray(this.poolGroup?.userData?.outerPts)
      ? this.poolGroup.userData.outerPts
      : [];
    const points = source
      .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
      .map((point) => new THREE.Vector2(point.x, point.y));
    if (points.length < 3) return [];

    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i], b = points[(i + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    const ccw = area > 0;
    const sourceEdges = Array.isArray(this.poolGroup?.userData?.outerPtSourceEdgeIndices)
      ? this.poolGroup.userData.outerPtSourceEdgeIndices : [];
    const samples = [];

    for (let i = 0; i < points.length; i += 1) {
      const a = points[i], b = points[(i + 1) % points.length];
      const segment = b.clone().sub(a);
      const length = segment.length();
      if (length < 1e-6) continue;
      const tangent = segment.clone().divideScalar(length);
      const outward = ccw
        ? new THREE.Vector2(tangent.y, -tangent.x)
        : new THREE.Vector2(-tangent.y, tangent.x);
      const inward = outward.clone().multiplyScalar(-1);
      const divisions = Math.max(1, Math.ceil(length / Math.max(0.08, stepLength)));
      for (let s = 0; s <= divisions; s += 1) {
        const t = s / divisions;
        const boundary = a.clone().lerp(b, t);
        samples.push({
          edgeIndex: i,
          sourceEdgeIndex: Number.isFinite(Number(sourceEdges[i])) ? Number(sourceEdges[i]) : i,
          boundary,
          tangent: tangent.clone(),
          outward: outward.clone(),
          inward: inward.clone()
        });
      }
    }
    return samples;
  }

  _getAutomaticPoolLightPlanDimensions(length, width) {
    const fallbackLength = Math.max(0.001, Number(length) || 0.001);
    const fallbackWidth = Math.max(0.001, Number(width) || 0.001);
    const source = Array.isArray(this.poolGroup?.userData?.outerPts)
      ? this.poolGroup.userData.outerPts
      : [];
    const points = source.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));
    if (!points.length) return { length: fallbackLength, width: fallbackWidth };

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach((point) => {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    });
    const spanX = Math.max(0.001, maxX - minX);
    const spanY = Math.max(0.001, maxY - minY);

    // Editable/freeform pools can be stretched after initial creation, so use
    // the live outline extents for light count and spacing rather than the
    // original creation parameters.
    if (String(this.poolParams?.shape || '').toLowerCase() === 'freeform' || this.isCustomShape) {
      return { length: spanX, width: spanY };
    }
    return {
      length: Math.max(fallbackLength, spanX),
      width: Math.max(fallbackWidth, spanY)
    };
  }

  _getAutomaticPoolLightWallPlacements(length, width, count, offset = 0, desiredSpacing = 2.6) {
    const samples = this._getPoolBoundarySamples(0.16);
    if (!samples.length || count <= 0) return [];

    const alongX = (Number(length) || 0) >= (Number(width) || 0);
    const outwardKey = alongX ? 'y' : 'x';
    const coordKey = alongX ? 'x' : 'y';
    const normalThreshold = 0.12;
    let sideSamples = samples.filter((sample) => sample.outward[outwardKey] > normalThreshold);
    if (sideSamples.length < Math.max(2, count)) {
      sideSamples = samples.filter((sample) => sample.outward[outwardKey] > -0.05);
    }
    if (!sideSamples.length) return [];

    const coords = sideSamples.map((sample) => sample.boundary[coordKey]);
    const minCoord = Math.min(...coords);
    const maxCoord = Math.max(...coords);
    const coordSpan = Math.max(0.001, maxCoord - minCoord);
    const coordInset = Math.min(0.45, coordSpan * 0.08, coordSpan * 0.35);
    const targetMin = minCoord + coordInset;
    const targetMax = maxCoord - coordInset;
    const usableSpan = Math.max(0, targetMax - targetMin);
    const requestedSpacing = Math.max(0.5, Number(desiredSpacing) || 2.6);
    const actualSpacing = count > 1
      ? Math.min(requestedSpacing, usableSpan / Math.max(1, count - 1))
      : 0;
    const centerCoord = (targetMin + targetMax) * 0.5;
    const used = new Set();
    const placements = [];

    for (let index = 0; index < count; index += 1) {
      const centeredIndex = index - (count - 1) * 0.5;
      const targetCoord = centerCoord + centeredIndex * actualSpacing;
      const ranked = sideSamples
        .map((sample, sampleIndex) => {
          const outwardStrength = Math.max(0, sample.outward[outwardKey]);
          const coordError = Math.abs(sample.boundary[coordKey] - targetCoord);
          const usedPenalty = used.has(sampleIndex) ? 1000 : 0;
          const normalPenalty = (1 - outwardStrength) * 0.35;
          return { sample, sampleIndex, score: coordError + normalPenalty + usedPenalty };
        })
        .sort((a, b) => a.score - b.score);
      const chosen = ranked[0];
      if (!chosen) continue;
      used.add(chosen.sampleIndex);
      placements.push({
        edgeIndex: chosen.sample.edgeIndex,
        distanceSq: 0,
        boundary: chosen.sample.boundary.clone(),
        tangent: chosen.sample.tangent.clone(),
        outward: chosen.sample.outward.clone(),
        inward: chosen.sample.inward.clone(),
        center: chosen.sample.boundary.clone().addScaledVector(chosen.sample.inward, Math.max(0, Number(offset) || 0))
      });
    }

    placements.sort((a, b) => a.boundary[coordKey] - b.boundary[coordKey]);
    return placements;
  }

  _getFreeformCurvedEdgeLightPlacements(length, width, desiredSpacing = 2.60) {
    const polygon = this.editablePolygon;
    if (!polygon?.vertices?.length || !polygon?.edges?.length) return [];

    const liveDims = this._getAutomaticPoolLightPlanDimensions(length, width);
    const alongX = liveDims.length >= liveDims.width;
    const outwardKey = alongX ? 'y' : 'x';
    const sampledOutline = polygon.sample?.(16) || polygon.vertices;
    let area = 0;
    for (let i = 0; i < sampledOutline.length; i += 1) {
      const a = sampledOutline[i], b = sampledOutline[(i + 1) % sampledOutline.length];
      if (!a || !b) continue;
      area += a.x * b.y - b.x * a.y;
    }
    const ccw = area > 0;
    const spacing = Math.max(1.8, Number(desiredSpacing) || 2.60);

    const bezierPoint = (p0, p1, p2, t) => {
      const inv = 1 - t;
      return new THREE.Vector2(
        inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x,
        inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y
      );
    };
    const bezierTangent = (p0, p1, p2, t) => {
      const tangent = new THREE.Vector2(
        2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
        2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)
      );
      if (tangent.lengthSq() < 1e-10) return p2.clone().sub(p0).normalize();
      return tangent.normalize();
    };

    // Build one arc-length table per qualifying curved edge first. Consecutive
    // curved edges are then joined into a single run before the fittings are
    // distributed. This prevents spacing from restarting at every editable
    // freeform edge and creating a close pair at a curve-to-curve join.
    const curveByEdge = new Map();
    polygon.edges.forEach((edge, edgeIndex) => {
      if (!edge?.isCurved || !edge.control) return;
      const p0 = polygon.vertices[edgeIndex];
      const p2 = polygon.vertices[(edgeIndex + 1) % polygon.vertices.length];
      const p1 = edge.control;
      if (!p0 || !p1 || !p2) return;

      const midTangent = bezierTangent(p0, p1, p2, 0.5);
      const midOutward = ccw
        ? new THREE.Vector2(midTangent.y, -midTangent.x)
        : new THREE.Vector2(-midTangent.y, midTangent.x);
      // Keep the same single primary-side selection used by oval/kidney and
      // straight-wall automatic lights. Curves on the opposite side do not
      // create a second independent row.
      if (midOutward[outwardKey] <= 0.08) return;

      const chord = p0.distanceTo(p2);
      const divisions = Math.max(48, Math.min(160, Math.ceil(chord / 0.08)));
      const samples = [];
      let totalLength = 0;
      let previous = bezierPoint(p0, p1, p2, 0);
      samples.push({ t:0, point:previous.clone(), distance:0 });
      for (let i = 1; i <= divisions; i += 1) {
        const t = i / divisions;
        const point = bezierPoint(p0, p1, p2, t);
        totalLength += point.distanceTo(previous);
        samples.push({ t, point, distance:totalLength });
        previous = point;
      }
      if (totalLength < 0.45) return;

      const sampleAtDistance = (targetDistance) => {
        const d = THREE.MathUtils.clamp(targetDistance, 0, totalLength);
        let hi = 1;
        while (hi < samples.length && samples[hi].distance < d) hi += 1;
        const b = samples[Math.min(hi, samples.length - 1)];
        const a = samples[Math.max(0, hi - 1)];
        const span = Math.max(1e-8, b.distance - a.distance);
        const f = THREE.MathUtils.clamp((d - a.distance) / span, 0, 1);
        const t = THREE.MathUtils.lerp(a.t, b.t, f);
        const boundary = bezierPoint(p0, p1, p2, t);
        const tangent = bezierTangent(p0, p1, p2, t);
        const outward = ccw
          ? new THREE.Vector2(tangent.y, -tangent.x)
          : new THREE.Vector2(-tangent.y, tangent.x);
        const inward = outward.clone().multiplyScalar(-1);
        return {
          edgeIndex,
          sourceFreeformEdgeIndex: edgeIndex,
          distanceSq: 0,
          boundary,
          tangent,
          outward,
          inward,
          center: boundary.clone()
        };
      };

      curveByEdge.set(edgeIndex, { edgeIndex, totalLength, sampleAtDistance });
    });

    if (!curveByEdge.size) return [];

    // Start immediately after a gap so a curved run that crosses edge 0 is
    // grouped correctly instead of being split by the polygon array boundary.
    const edgeCount = polygon.edges.length;
    let startIndex = 0;
    if (curveByEdge.size < edgeCount) {
      for (let i = 0; i < edgeCount; i += 1) {
        const next = (i + 1) % edgeCount;
        if (!curveByEdge.has(i) && curveByEdge.has(next)) {
          startIndex = next;
          break;
        }
      }
    }

    const runs = [];
    let currentRun = [];
    const flushRun = () => {
      if (currentRun.length) runs.push(currentRun);
      currentRun = [];
    };
    for (let offset = 0; offset < edgeCount; offset += 1) {
      const edgeIndex = (startIndex + offset) % edgeCount;
      const curve = curveByEdge.get(edgeIndex);
      if (curve) currentRun.push(curve);
      else flushRun();
    }
    flushRun();

    const placements = [];
    runs.forEach((run) => {
      const runLength = run.reduce((sum, curve) => sum + curve.totalLength, 0);
      if (runLength < 0.45) return;

      const lightCount = Math.max(1, Math.round(runLength / 2.75));
      const edgeInset = Math.min(0.45, runLength * 0.10);
      const usableLength = Math.max(0, runLength - edgeInset * 2);
      const actualSpacing = lightCount > 1
        ? Math.min(spacing, usableLength / Math.max(1, lightCount - 1))
        : 0;
      const centerDistance = runLength * 0.5;
      const firstDistance = centerDistance - actualSpacing * (lightCount - 1) * 0.5;

      const sampleRunAtDistance = (targetDistance) => {
        let remaining = THREE.MathUtils.clamp(targetDistance, 0, runLength);
        for (let i = 0; i < run.length; i += 1) {
          const curve = run[i];
          if (remaining <= curve.totalLength || i === run.length - 1) {
            return curve.sampleAtDistance(remaining);
          }
          remaining -= curve.totalLength;
        }
        return null;
      };

      for (let index = 0; index < lightCount; index += 1) {
        const placement = sampleRunAtDistance(firstDistance + actualSpacing * index);
        if (placement) placements.push(placement);
      }
    });

    return placements;
  }

  _isPointOnFreeformCurvedEdge(point, tolerance = 0.18) {
    const polygon = this.editablePolygon;
    if (!point || !polygon?.vertices?.length || !polygon?.edges?.length) return false;
    const target = new THREE.Vector2(point.x, point.y);
    const toleranceSq = tolerance * tolerance;
    const bezierPoint = (p0, p1, p2, t) => {
      const inv = 1 - t;
      return new THREE.Vector2(
        inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x,
        inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y
      );
    };
    const distanceToSegmentSq = (p, a, b) => {
      const ab = b.clone().sub(a);
      const lenSq = ab.lengthSq();
      if (lenSq < 1e-10) return p.distanceToSquared(a);
      const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / lenSq, 0, 1);
      return p.distanceToSquared(a.clone().addScaledVector(ab, t));
    };

    for (let edgeIndex = 0; edgeIndex < polygon.edges.length; edgeIndex += 1) {
      const edge = polygon.edges[edgeIndex];
      if (!edge?.isCurved || !edge.control) continue;
      const p0 = polygon.vertices[edgeIndex];
      const p2 = polygon.vertices[(edgeIndex + 1) % polygon.vertices.length];
      const p1 = edge.control;
      let previous = bezierPoint(p0, p1, p2, 0);
      for (let i = 1; i <= 48; i += 1) {
        const current = bezierPoint(p0, p1, p2, i / 48);
        if (distanceToSegmentSq(target, previous, current) <= toleranceSq) return true;
        previous = current;
      }
    }
    return false;
  }

  _getFreeformHybridPoolLightPlacements(length, width, count) {
    if (count <= 0) return [];
    const liveDims = this._getAutomaticPoolLightPlanDimensions(length, width);
    const longestSpan = Math.max(1, liveDims.length, liveDims.width);
    const alongX = liveDims.length >= liveDims.width;
    const coordKey = alongX ? 'x' : 'y';
    const straightSpacing = count > 1
      ? THREE.MathUtils.clamp(longestSpan / count, 2.5, 3.0)
      : 0;
    const queryDistance = longestSpan + 2;

    // Curved freeform edges now use the exact curve metadata from EditablePolygon
    // and are spaced by true arc length, matching the successful oval/kidney
    // curved-wall behaviour. Straight portions keep the standard query logic.
    const curvedPlacements = this._getFreeformCurvedEdgeLightPlacements(liveDims.length, liveDims.width, 2.60);
    const straightPlacements = [];

    for (let index = 0; index < count; index += 1) {
      const along = count === 1 ? 0 : (index - (count - 1) * 0.5) * straightSpacing;
      const query = alongX
        ? new THREE.Vector3(along, queryDistance, 0)
        : new THREE.Vector3(queryDistance, along, 0);
      const candidate = this._nearestPoolBoundaryPlacement(query, 0);
      if (!candidate) continue;
      // Do not let straight-wall slots pile onto a curved edge. That curved edge
      // has its own arc-length placements above.
      if (this._isPointOnFreeformCurvedEdge(candidate.boundary, 0.20)) continue;
      straightPlacements.push(candidate);
    }

    const placements = [...curvedPlacements];
    const minimumSeparation = 1.65;
    straightPlacements.forEach((candidate) => {
      if (placements.some((existing) => existing.boundary.distanceTo(candidate.boundary) < minimumSeparation)) return;
      placements.push(candidate);
    });
    placements.sort((a, b) => (a.boundary?.[coordKey] || 0) - (b.boundary?.[coordKey] || 0));
    return placements;
  }

  setupBarStoolDragging() {
    if (this._barStoolDraggingSetup || !this.renderer?.domElement || !this.camera) return;
    this._barStoolDraggingSetup = true;
    const dom = this.renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const stoolRoot = (object) => {
      let current = object;
      while (current && current !== this.poolFeatureGroup) {
        if (current.userData?.isBarStool && Number.isInteger(current.userData?.barStoolIndex) && current.type === 'Group') return current;
        current = current.parent;
      }
      return null;
    };

    dom.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !this.poolFeatureGroup || this.customizeMode) return;
      const rect = dom.getBoundingClientRect();
      mouse.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(mouse, this.camera);
      const candidates = [];
      this.poolFeatureGroup.traverse?.((object) => {
        if (object?.isMesh && object.userData?.isBarStool) candidates.push(object);
      });
      const hit = candidates.length ? raycaster.intersectObjects(candidates, false)[0] : null;
      const root = hit ? stoolRoot(hit.object) : null;
      if (!root) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      this.captureUndoState?.('Move bar stools');
      const previousControlsEnabled = this.controls ? this.controls.enabled !== false : null;
      if (this.controls) this.controls.enabled = false;
      this.barStoolDrag = {
        pointerId: event.pointerId,
        root,
        index: root.userData.barStoolIndex,
        previousControlsEnabled
      };
      dom.style.cursor = 'grabbing';
      dom.setPointerCapture?.(event.pointerId);
    }, true);

    dom.addEventListener('pointermove', (event) => {
      const drag = this.barStoolDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      const worldPoint = this._screenToPlanePoint(event.clientX, event.clientY, this.getPoolElevation());
      if (!worldPoint) return;
      const local = this.poolGroup.worldToLocal(worldPoint.clone());
      const placements = this._getBarStoolGroupPlacements(local, drag.index, 0.45);
      if (placements.length !== 3) return;
      const stoolRoots = [];
      this.poolFeatureGroup.children.forEach((child) => {
        if (child?.userData?.isBarStool && Number.isInteger(child.userData.barStoolIndex)) {
          stoolRoots[child.userData.barStoolIndex] = child;
        }
      });
      placements.forEach((placement, index) => {
        const stool = stoolRoots[index];
        if (!stool) return;
        stool.position.set(placement.x, placement.y, 0);
        stool.rotation.z = placement.rotation;
      });
      this.barStoolPlacements = placements;
      dom.style.cursor = 'grabbing';
    }, true);

    const finish = (event) => {
      const drag = this.barStoolDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      try { dom.releasePointerCapture?.(event.pointerId); } catch (_) {}
      this.barStoolDrag = null;
      dom.style.cursor = '';
      if (this.controls && drag.previousControlsEnabled !== null) this.controls.enabled = drag.previousControlsEnabled;
      this._notifyDesignerStateChanged?.();
    };
    dom.addEventListener('pointerup', finish, true);
    dom.addEventListener('pointercancel', finish, true);
  }

  _getAutomaticPoolLightZForAcrylic(placement, defaultZ) {
    if (!placement || !this.poolFeatures?.has?.('acrylic-window') || !this.acrylicWindowState?.placement) return defaultZ;
    let windowPlacement = this._nearestPoolBoundaryPlacement(
      new THREE.Vector2(Number(this.acrylicWindowState.placement.x)||0, Number(this.acrylicWindowState.placement.y)||0),
      0
    );
    if (!windowPlacement) return defaultZ;
    windowPlacement = this._constrainAcrylicWindowPlacement(windowPlacement);
    const shape = this.isCustomShape ? 'freeform' : String(this.poolParams?.shape || '').toLowerCase();
    let overlaps = false;
    if (['oval','kidney','freeform'].includes(shape)) {
      const arcs = this._getAcrylicWindowArcSegments(windowPlacement, this.acrylicWindowState.length);
      overlaps = arcs.some(segment => placement.boundary.distanceTo(segment.center) <= segment.span*0.65 + 0.22);
    } else {
      const delta = placement.boundary.clone().sub(windowPlacement.boundary);
      const along = Math.abs(delta.dot(windowPlacement.tangent));
      const across = Math.abs(delta.dot(windowPlacement.outward));
      overlaps = Number(placement.edgeIndex) === Number(windowPlacement.edgeIndex)
        && along <= Number(this.acrylicWindowState.length)*0.5 + 0.22 && across <= 0.34;
    }
    if (!overlaps) return defaultZ;

    const wallDepth = Math.max(0.6, Number(this.poolParams?.deep)||1.8);
    const raisedHeight = this.poolParams?.raised ? Math.max(0,Number(this.getPoolElevation?.())||0) : wallDepth;
    const panelHeight = Math.min(Math.max(0.3,Number(this.acrylicWindowState.height)||0.8), wallDepth, raisedHeight||wallDepth);
    const groundBottom = this.poolParams?.raised ? Math.max(-wallDepth,-raisedHeight) : -wallDepth;
    const panelCenter = THREE.MathUtils.clamp(Number(this.acrylicWindowState.centerZ)||-wallDepth*0.5,groundBottom+panelHeight*0.5,-panelHeight*0.5);
    const panelBottom = panelCenter-panelHeight*0.5;
    return Math.min(defaultZ, Math.max(-wallDepth+0.16,panelBottom-0.20));
  }

  _disposeAutomaticSpaLight() {
    const lightGroup = this.spa?.userData?.automaticSpaLightGroup;
    if (!lightGroup) return;
    lightGroup.traverse?.((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material?.dispose?.());
      else object.material?.dispose?.();
    });
    lightGroup.parent?.remove?.(lightGroup);
    if (this.spa?.userData) this.spa.userData.automaticSpaLightGroup = null;
  }

  _ensureAutomaticSpaLight() {
    if (!this.spa) return;
    this._disposeAutomaticSpaLight();

    const length = Math.max(0.8, Number(this.spa.userData?.spaLength) || 2);
    const width = Math.max(0.8, Number(this.spa.userData?.spaWidth) || 2);
    const circular = this.spa.userData?.spaShape === 'circular';
    const wallThickness = 0.20;
    const wallClearance = 0.08;
    const radius = Math.max(0.4, Math.min(length, width) * 0.5);
    const innerHalfX = circular
      ? Math.max(0.18, radius - wallThickness * 0.5 - 0.018)
      : Math.max(0.18, length * 0.5 - wallThickness * 0.5 - 0.018);
    const innerY = circular
      ? Math.max(0.18, radius - wallThickness * 0.5 - 0.018)
      : Math.max(0.18, width * 0.5 - wallThickness * 0.5 - 0.018);
    // Mount the spa light on the vertical face of the seating footwell rather
    // than on the outer spa wall. The spa seat is authored 450 mm deep and its
    // top sits 500 mm below the spa top, while the footwell floor sits 1.0 m
    // below the spa top. Place the lens roughly mid-height on that riser.
    const spaHeight = Math.max(0.8, Number(this.spa.userData?.height) || 1.2);
    const spaTopLocalZ = spaHeight * 0.5;
    const spaBottomLocalZ = -spaHeight * 0.5;
    const seatDepth = 0.45;
    const seatTopLocalZ = spaTopLocalZ - 0.50;
    const footwellFloorLocalZ = spaTopLocalZ - 1.00;
    const lightZ = THREE.MathUtils.clamp(
      footwellFloorLocalZ + 0.25,
      spaBottomLocalZ + 0.18,
      seatTopLocalZ - 0.10
    );
    const inward = new THREE.Vector3(0, -1, 0);

    // The back-seat inner face is the +Y boundary of the footwell. Match the
    // actual seat geometry in spa.js: rectangular seats extend SPA_SEAT_DEPTH
    // directly inward from the spa plan edge, while circular seats start from
    // the wall inner radius. Do not subtract wall thickness twice here, which
    // previously left the fixture visibly floating away from the bench face.
    const footwellHalfX = circular
      ? Math.max(0.12, radius - wallThickness * 0.5 - seatDepth)
      : Math.max(0.12, length * 0.5 - seatDepth);
    const footwellHalfY = circular
      ? Math.max(0.12, radius - wallThickness * 0.5 - seatDepth)
      : Math.max(0.12, width * 0.5 - seatDepth);
    const fixtureFaceY = footwellHalfY;

    const group = new THREE.Group();
    group.name = 'automatic-spa-light';
    group.userData.isAutomaticSpaLight = true;

    const bodyMat = this._featureMaterial(0xf2f3ef, { metalness:0.04, roughness:0.58 });
    const lensMat = new THREE.MeshBasicMaterial({
      color:0xdff8ff, transparent:true, opacity:0.92,
      depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide
    });
    const haloMat = new THREE.MeshBasicMaterial({
      map:this._poolLightHaloTexture || null,
      color:0x9fe8ff, transparent:true, opacity:0.34,
      depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide
    });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.026,32), bodyMat);
    body.name = 'automatic-spa-light-body';
    body.userData.isAutomaticSpaLight = true;
    body.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), inward);
    // Mount the fixture flush to the vertical seat/footwell face. The body is
    // 26 mm deep, so centring it 13 mm into the footwell puts its rear face
    // exactly on the seat surface while the lens remains just proud of it.
    // This removes the visible air gap without burying the lens in the tiles.
    body.position.set(0, fixtureFaceY - 0.013, lightZ);
    body.userData.preserveMaterial = true;
    group.add(body);

    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.095,32), lensMat);
    lens.name = 'automatic-spa-light-lens';
    lens.userData.isAutomaticSpaLight = true;
    lens.userData.preserveMaterial = true;
    lens.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), inward);
    lens.position.set(0, fixtureFaceY - 0.028, lightZ);
    lens.renderOrder = 24;
    group.add(lens);

    // Keep the visible glow tight to the spa wall. No cone/ray mesh is created,
    // so there is nothing that can visibly project through the opposite wall.
    const glowSize = Math.min(0.58, Math.max(0.34, Math.min(length,width) * 0.28));
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(glowSize,glowSize), haloMat);
    halo.name = 'automatic-spa-light-halo';
    halo.userData.isAutomaticSpaLight = true;
    halo.userData.preserveMaterial = true;
    halo.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), inward);
    halo.position.set(0, fixtureFaceY - 0.031, lightZ);
    halo.renderOrder = 23;
    group.add(halo);

    // Keep the real light volume inside the open footwell, not merely inside the
    // outer spa shell. THREE.SpotLight does not physically occlude at geometry,
    // so distance and cone angle are limited by the opposing seat faces.
    const sourceY = fixtureFaceY - 0.038;
    const oppositeWallDistance = Math.max(0.28, sourceY + footwellHalfY - wallClearance);
    const lateralClearance = Math.max(0.10, footwellHalfX - wallClearance);
    const safeAngle = THREE.MathUtils.clamp(
      Math.atan2(lateralClearance, Math.max(0.45, oppositeWallDistance)),
      0.34,
      0.62
    );
    const illuminationDistance = Math.max(0.28, Math.min(
      oppositeWallDistance,
      Math.max(0.28, Math.min(footwellHalfX, footwellHalfY) * 1.65)
    ));
    const illumination = new THREE.SpotLight(0xb9f4ff, 1.8, illuminationDistance, safeAngle, 0.95, 2);
    illumination.name = 'automatic-spa-light-illumination';
    illumination.userData.isAutomaticSpaLight = true;
    illumination.userData.spaInteriorClipped = true;
    illumination.position.set(0, sourceY, lightZ - 0.02);
    const target = new THREE.Object3D();
    // Aim into the water but stop the lit volume before the opposite spa wall.
    const targetDistance = Math.min(illuminationDistance * 0.62, Math.max(0.28, sourceY));
    target.position.set(0, sourceY - targetDistance, lightZ - 0.24);
    target.name = 'automatic-spa-light-target';
    group.add(target);
    illumination.target = target;
    group.add(illumination);

    this.spa.add(group);
    this.spa.userData.automaticSpaLightGroup = group;
  }

  _createAutomaticPoolLights(group, length, width) {
    const liveDims = this._getAutomaticPoolLightPlanDimensions(length, width);
    const effectiveLength = liveDims.length;
    const effectiveWidth = liveDims.width;
    const longestSpan = Math.max(1, effectiveLength, effectiveWidth);
    const alongX = effectiveLength >= effectiveWidth;
    const count = Math.max(1, Math.round(longestSpan / 2.75));
    const shape = this.isCustomShape ? 'freeform' : String(this.poolParams?.shape || '').toLowerCase();
    const usesCurvedWallSpacing = shape === 'oval' || shape === 'kidney';
    const usesFreeformHybridSpacing = shape === 'freeform';
    const usesLShapeLongestWall = shape === 'l';
    const straightSpacing = count > 1
      ? THREE.MathUtils.clamp(longestSpan / count, 2.5, 3.0)
      : 0;
    const queryDistance = longestSpan + 2;

    // An L pool can have several parallel walls. Pick one actual perimeter
    // segment—the longest—and distribute every fitting on that same wall.
    const lShapePlacements = (() => {
      if (!usesLShapeLongestWall) return [];
      const points = (this.poolGroup?.userData?.outerPts || [])
        .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
        .map(point => new THREE.Vector2(point.x, point.y));
      if (points.length < 3) return [];
      let signedArea = 0;
      let best = null;
      points.forEach((a, edgeIndex) => {
        const b = points[(edgeIndex + 1) % points.length];
        signedArea += a.x * b.y - b.x * a.y;
        const span = a.distanceTo(b);
        if (!best || span > best.span) best = { a, b, span, edgeIndex };
      });
      if (!best || best.span < 0.5) return [];
      const tangent = best.b.clone().sub(best.a).normalize();
      const outward = signedArea > 0
        ? new THREE.Vector2(tangent.y, -tangent.x)
        : new THREE.Vector2(-tangent.y, tangent.x);
      const inward = outward.clone().multiplyScalar(-1);
      const inset = Math.min(0.5, best.span * 0.12);
      const usable = Math.max(0.1, best.span - inset * 2);
      const lightCount = Math.max(1, Math.round(best.span / 2.75));
      return Array.from({ length:lightCount }, (_, index) => {
        const distance = lightCount === 1 ? best.span * 0.5 : inset + usable * index / (lightCount - 1);
        const boundary = best.a.clone().addScaledVector(tangent, distance);
        return { edgeIndex:best.edgeIndex, boundary, tangent:tangent.clone(), outward:outward.clone(), inward:inward.clone(), center:boundary.clone() };
      });
    })();

    const createRadialTexture = (innerStop = 0.18, outerStop = 1) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(innerStop, 'rgba(230,248,255,0.92)');
      gradient.addColorStop(0.48, 'rgba(156,222,255,0.42)');
      gradient.addColorStop(0.76, 'rgba(120,198,255,0.12)');
      gradient.addColorStop(outerStop, 'rgba(120,198,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    };
    const createPoolLightOpticsTexture = () => {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const cx = size * 0.5;
      const cy = size * 0.5;
      const radius = size * 0.41;

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      const base = ctx.createRadialGradient(cx, cy, radius * 0.05, cx, cy, radius);
      base.addColorStop(0, 'rgba(224,246,255,0.98)');
      base.addColorStop(0.22, 'rgba(188,228,255,0.98)');
      base.addColorStop(0.54, 'rgba(142,188,248,0.96)');
      base.addColorStop(1, 'rgba(79,108,193,0.98)');
      ctx.fillStyle = base;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

      ctx.strokeStyle = 'rgba(255,255,255,0.62)';
      ctx.lineWidth = 1.8;
      const cell = 17;
      const rowH = cell * 0.88;
      const dotRadius = 5.8;
      for (let row = -radius; row <= radius; row += rowH) {
        const offset = (Math.round((row + radius) / rowH) % 2) * cell * 0.5;
        for (let col = -radius; col <= radius; col += cell) {
          const x = cx + col + offset;
          const y = cy + row;
          const dx = x - cx;
          const dy = y - cy;
          if ((dx * dx) + (dy * dy) > ((radius - 6) * (radius - 6))) continue;
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.60);
      centerGlow.addColorStop(0, 'rgba(255,255,255,1)');
      centerGlow.addColorStop(0.08, 'rgba(235,250,255,0.98)');
      centerGlow.addColorStop(0.42, 'rgba(183,227,255,0.66)');
      centerGlow.addColorStop(1, 'rgba(183,227,255,0)');
      ctx.fillStyle = centerGlow;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

      ctx.restore();

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    };
    const createPoolLightDiffuserTexture = () => {
      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const cx = size * 0.5;
      const cy = size * 0.5;
      const radius = size * 0.48;
      const inner = size * 0.30;

      ctx.clearRect(0, 0, size, size);
      const ring = ctx.createRadialGradient(cx, cy, inner, cx, cy, radius);
      ring.addColorStop(0, 'rgba(245,251,255,0)');
      ring.addColorStop(0.06, 'rgba(238,246,255,0.38)');
      ring.addColorStop(0.72, 'rgba(205,224,250,0.62)');
      ring.addColorStop(1, 'rgba(242,248,255,0.78)');
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.40, -Math.PI * 0.9, -Math.PI * 0.12);
      ctx.stroke();

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    };

    if (!this._poolLightHaloTexture) {
      this._poolLightHaloTexture = createRadialTexture(0.14, 1);
      this._poolLightSpreadTexture = createRadialTexture(0.28, 1);
      this._poolLightOpticsTexture = createPoolLightOpticsTexture();
      this._poolLightDiffuserTexture = createPoolLightDiffuserTexture();
    }

    const fixtureMaterial = this._featureMaterial(0xf1f2ee, { metalness:0.04, roughness:0.62 });
    const bezelMaterial = this._featureMaterial(0xf6f6f2, { metalness:0.02, roughness:0.54 });
    const diffuserMaterial = new THREE.MeshBasicMaterial({
      map:this._poolLightDiffuserTexture,
      color:0xf1f7ff,
      transparent:true,
      opacity:0.7,
      depthTest:true,
      depthWrite:false,
      polygonOffset:true,
      polygonOffsetFactor:-2,
      polygonOffsetUnits:-2,
      side:THREE.DoubleSide
    });
    const opticsMaterial = new THREE.MeshBasicMaterial({
      map:this._poolLightOpticsTexture,
      color:0xffffff,
      transparent:true,
      opacity:0.92,
      depthTest:true,
      depthWrite:false,
      polygonOffset:true,
      polygonOffsetFactor:-2,
      polygonOffsetUnits:-2,
      side:THREE.DoubleSide
    });
    const centerGlowMaterial = new THREE.MeshBasicMaterial({
      color:0xf6fdff,
      transparent:true,
      opacity:0.9,
      depthTest:true,
      depthWrite:false,
      polygonOffset:true,
      polygonOffsetFactor:-3,
      polygonOffsetUnits:-3,
      blending:THREE.AdditiveBlending,
      side:THREE.DoubleSide
    });
    const screwMaterial = this._featureMaterial(0xc9d0d4, { metalness:0.22, roughness:0.42 });
    const haloMaterial = new THREE.MeshBasicMaterial({
      map:this._poolLightHaloTexture,
      color:0x9fe8ff,
      transparent:true,
      opacity:0.42,
      depthTest:true,
      depthWrite:false,
      polygonOffset:true,
      polygonOffsetFactor:-3,
      polygonOffsetUnits:-3,
      blending:THREE.AdditiveBlending,
      side:THREE.DoubleSide
    });
    const wallWashMaterial = new THREE.MeshBasicMaterial({
      map:this._poolLightSpreadTexture,
      color:0x84daff,
      transparent:true,
      opacity:0.18,
      depthTest:true,
      depthWrite:false,
      polygonOffset:true,
      polygonOffsetFactor:-3,
      polygonOffsetUnits:-3,
      blending:THREE.AdditiveBlending,
      side:THREE.DoubleSide
    });
    const floorWashMaterial = new THREE.MeshBasicMaterial({
      map:this._poolLightSpreadTexture,
      color:0xb9efff,
      transparent:true,
      opacity:0.12,
      depthTest:true,
      depthWrite:false,
      blending:THREE.AdditiveBlending,
      side:THREE.DoubleSide
    });
    const beamMaterial = new THREE.MeshBasicMaterial({
      color:0x9eeaff,
      side:THREE.DoubleSide,
      transparent:true,
      opacity:0.018,
      depthTest:true,
      depthWrite:false,
      blending:THREE.AdditiveBlending
    });
    const baseLightZ = -0.62;
    const waterSurfaceLocalZ = this._getPoolWaterSurfaceLocalZ(-0.10);
    const fixtureScale = 0.75;
    const fixtureDepth = 0.035 * fixtureScale;
    const faceProjection = 0.020; // sit 20 mm proud so the fixture never flickers into the tile
    const wallOffset = faceProjection + fixtureDepth + 0.0015;
    const lightSourceOffset = 0.012;

    const curvedPlacements = usesCurvedWallSpacing
      ? this._getAutomaticPoolLightWallPlacements(effectiveLength, effectiveWidth, count, 0, 2.60)
      : [];
    const freeformPlacements = usesFreeformHybridSpacing
      ? this._getFreeformHybridPoolLightPlacements(effectiveLength, effectiveWidth, count)
      : [];

    const automaticLightCount = usesLShapeLongestWall
      ? lShapePlacements.length
      : (usesFreeformHybridSpacing ? freeformPlacements.length : count);
    for (let index = 0; index < automaticLightCount; index += 1) {
      let placement = null;
      if (usesLShapeLongestWall) {
        placement = lShapePlacements[index] || null;
      } else if (usesCurvedWallSpacing) {
        placement = curvedPlacements[index] || null;
      } else if (usesFreeformHybridSpacing) {
        placement = freeformPlacements[index] || null;
      } else {
        // Standard straight-wall behaviour remains unchanged for rectangle/L.
        const along = count === 1 ? 0 : (index - (count - 1) * 0.5) * straightSpacing;
        const query = alongX
          ? new THREE.Vector3(along, queryDistance, 0)
          : new THREE.Vector3(queryDistance, along, 0);
        placement = this._nearestPoolBoundaryPlacement(query, 0);
      }
      if (!placement) continue;

      const inward = new THREE.Vector3(placement.inward.x, placement.inward.y, 0).normalize();
      const authoredLightZ = this._getAutomaticPoolLightElevation(placement.boundary, baseLightZ);
      const lightZ = this._getAutomaticPoolLightZForAcrylic(placement, authoredLightZ);
      const boundary = new THREE.Vector3(placement.boundary.x, placement.boundary.y, lightZ);
      const up = new THREE.Vector3(0, 0, 1);
      const tangent = new THREE.Vector3().crossVectors(up, inward).normalize();
      const forward = inward.clone();

      const fixture = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * fixtureScale, 0.13 * fixtureScale, fixtureDepth, 28), fixtureMaterial.clone());
      fixture.name = `automatic-pool-light-${index}`;
      fixture.userData.isAutomaticPoolLight = true;

      fixture.userData.preserveMaterial = true;
      fixture.position.copy(boundary).addScaledVector(inward, faceProjection + fixtureDepth * 0.5);
      fixture.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), inward);
      fixture.castShadow = false;
      fixture.frustumCulled = false;
      group.add(fixture);

      const rim = new THREE.Mesh(new THREE.RingGeometry(0.122 * fixtureScale, 0.18 * fixtureScale, 48), bezelMaterial.clone());
      rim.name = `automatic-pool-light-rim-${index}`;
      rim.userData.isAutomaticPoolLight = true;

      rim.userData.preserveMaterial = true;
      rim.position.copy(boundary).addScaledVector(inward, faceProjection + fixtureDepth + 0.002);
      rim.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), inward);
      rim.renderOrder = 11;
      rim.frustumCulled = false;
      group.add(rim);

      const diffuser = new THREE.Mesh(new THREE.CircleGeometry(0.158 * fixtureScale, 48), diffuserMaterial.clone());
      diffuser.name = `automatic-pool-light-diffuser-${index}`;
      diffuser.userData.isAutomaticPoolLight = true;

      diffuser.userData.preserveMaterial = true;
      diffuser.position.copy(boundary).addScaledVector(inward, wallOffset - 0.001);
      diffuser.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), inward);
      diffuser.renderOrder = 12;
      diffuser.frustumCulled = false;
      group.add(diffuser);

      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.136 * fixtureScale, 48), opticsMaterial.clone());
      lens.name = `automatic-pool-light-lens-${index}`;
      lens.userData.isAutomaticPoolLight = true;

      lens.userData.preserveMaterial = true;
      lens.position.copy(boundary).addScaledVector(inward, wallOffset + 0.0015);
      lens.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), inward);
      lens.renderOrder = 13;
      lens.frustumCulled = false;
      group.add(lens);

      const centerGlow = new THREE.Mesh(new THREE.CircleGeometry(0.022 * fixtureScale, 24), centerGlowMaterial.clone());
      centerGlow.name = `automatic-pool-light-center-${index}`;
      centerGlow.userData.isAutomaticPoolLight = true;

      centerGlow.userData.preserveMaterial = true;
      centerGlow.position.copy(boundary).addScaledVector(inward, wallOffset + 0.0035);
      centerGlow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), inward);
      centerGlow.renderOrder = 14;
      centerGlow.frustumCulled = false;
      group.add(centerGlow);

      const screw = new THREE.Mesh(new THREE.CircleGeometry(0.011 * fixtureScale, 20), screwMaterial.clone());
      screw.name = `automatic-pool-light-screw-${index}`;
      screw.userData.isAutomaticPoolLight = true;

      screw.userData.preserveMaterial = true;
      screw.position.copy(boundary)
        .addScaledVector(inward, wallOffset + 0.001)
        .addScaledVector(up, 0.155 * fixtureScale);
      screw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), inward);
      screw.renderOrder = 15;
      screw.frustumCulled = false;
      group.add(screw);

      const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.58), haloMaterial.clone());
      halo.name = `automatic-pool-light-halo-${index}`;
      halo.userData.isAutomaticPoolLight = true;

      halo.userData.preserveMaterial = true;
      halo.position.copy(boundary).addScaledVector(inward, wallOffset + 0.018);
      halo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), inward);
      halo.renderOrder = 10;
      halo.frustumCulled = false;
      group.add(halo);

      const wallWash = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), wallWashMaterial.clone());
      wallWash.name = `automatic-pool-light-wallwash-${index}`;
      wallWash.userData.isAutomaticPoolLight = true;

      wallWash.userData.preserveMaterial = true;
      wallWash.position.copy(boundary).addScaledVector(inward, wallOffset + 0.022);
      wallWash.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), inward);
      wallWash.renderOrder = 9;
      wallWash.frustumCulled = false;
      group.add(wallWash);

      const nearFieldFill = new THREE.SpotLight(0xb9f4ff, 0.65, 1.5, 1.18, 1.0, 2.0);
      nearFieldFill.name = `automatic-pool-illumination-${index}`;
      nearFieldFill.position.copy(boundary).addScaledVector(inward, lightSourceOffset);
      nearFieldFill.position.z -= 0.05;
      nearFieldFill.userData.isAutomaticPoolLight = true;

      nearFieldFill.userData.preserveMaterial = true;
      const nearFieldTarget = new THREE.Object3D();
      nearFieldTarget.name = `automatic-pool-illumination-target-${index}`;
      nearFieldTarget.position.copy(boundary).addScaledVector(inward, 1.8);
      nearFieldTarget.position.z = lightZ - 0.42;
      group.add(nearFieldTarget);
      nearFieldFill.target = nearFieldTarget;
      group.add(nearFieldFill);

      const floorWash = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.95), floorWashMaterial.clone());
      floorWash.name = `automatic-pool-light-floorwash-${index}`;
      floorWash.userData.isAutomaticPoolLight = true;

      floorWash.userData.preserveMaterial = true;
      floorWash.position.copy(boundary)
        .addScaledVector(forward, 1.85)
        .addScaledVector(tangent, 0)
        .setZ(lightZ - 0.85);
      floorWash.lookAt(floorWash.position.clone().add(up));
      floorWash.rotateZ(Math.atan2(tangent.y, tangent.x));
      floorWash.frustumCulled = false;
      floorWash.renderOrder = 8;
      group.add(floorWash);

      // Keep only a very soft hint of underwater haze near the fitting rather
      // than a hard, readable projector cone.
      const beamLength = 4.0;
      const beamRadius = 1.5;
      const addBeam = (radius, opacity, offset) => {
        const geometry = new THREE.ConeGeometry(radius, beamLength, 32, 1, true);
        geometry.translate(0, -beamLength * 0.5, 0); // apex at the fixture
        const material = beamMaterial.clone();
        material.opacity = opacity;
        material.userData = material.userData || {};
        const waterClipUniform = { value: 0 };
        material.userData.poolLightWaterClipUniform = waterClipUniform;
        material.onBeforeCompile = (shader) => {
          shader.uniforms.poolLightWaterSurfaceWorldZ = waterClipUniform;
          shader.vertexShader = shader.vertexShader
            .replace(
              '#include <common>',
              '#include <common>\nvarying vec3 vPoolLightBeamWorldPosition;'
            )
            .replace(
              '#include <worldpos_vertex>',
              '#include <worldpos_vertex>\nvPoolLightBeamWorldPosition = worldPosition.xyz;'
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <common>',
              '#include <common>\nvarying vec3 vPoolLightBeamWorldPosition;\nuniform float poolLightWaterSurfaceWorldZ;'
            )
            .replace(
              '#include <clipping_planes_fragment>',
              '#include <clipping_planes_fragment>\nif (vPoolLightBeamWorldPosition.z > poolLightWaterSurfaceWorldZ - 0.012) discard;'
            );
        };
        material.customProgramCacheKey = () => 'pool-light-underwater-beam-clip-v1';
        material.needsUpdate = true;
        const beam = new THREE.Mesh(geometry, material);
        beam.name = `automatic-pool-light-beam-${index}-${offset}`;
        beam.position.copy(boundary).addScaledVector(inward, lightSourceOffset + offset);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0), inward);
        beam.frustumCulled = false;
        beam.userData.isAutomaticPoolLight = true;

        beam.userData.preserveMaterial = true;
        const updateWaterClip = () => {
          const poolWorldZ = this.poolGroup?.getWorldPosition?.(new THREE.Vector3())?.z || 0;
          waterClipUniform.value = poolWorldZ + waterSurfaceLocalZ;
        };
        updateWaterClip();
        const basePosition = beam.position.clone();
        beam.userData.animate = (_delta, clock) => {
          const time = Number(clock?.elapsedTime) || 0;
          const waveA = Math.sin(time * 1.85 + index * 0.73 + offset * 41);
          const waveB = Math.cos(time * 1.25 + index * 1.07 + offset * 53);
          updateWaterClip();
          beam.material.opacity = opacity * (0.92 + waveA * 0.10);
          beam.position.copy(basePosition)
            .addScaledVector(tangent, 0.016 * waveA)
            .addScaledVector(up, 0.006 * waveB);
          // Preserve a broad horizontal spread while compressing the vertical
          // cone so the visible rays stay submerged instead of forming sails
          // through the water surface. The shader clip above is the final guard.
          const verticalCompression = 0.22;
          beam.scale.set(
            1 + waveA * 0.065,
            1 + waveB * 0.045,
            verticalCompression * (1 + waveA * 0.11)
          );
        };
        group.add(beam);
      };
      addBeam(beamRadius, 0.022, -0.006);
      addBeam(beamRadius * 0.74, 0.030, 0.003);
      addBeam(beamRadius * 0.50, 0.040, 0.012);

      const surfaceWash = new THREE.SpotLight(0xb9f4ff, 2.8, 8.5, 0.68, 0.94, 2.0);
      surfaceWash.name = `automatic-pool-spotlight-${index}`;
      surfaceWash.position.copy(boundary).addScaledVector(inward, lightSourceOffset);
      surfaceWash.position.z -= 0.06;
      surfaceWash.userData.isAutomaticPoolLight = true;

      surfaceWash.userData.preserveMaterial = true;
      const target = new THREE.Object3D();
      target.name = `automatic-pool-spotlight-target-${index}`;
      target.position.copy(boundary).addScaledVector(inward, 5.4);
      target.position.z = lightZ - 1.05;
      group.add(target);
      surfaceWash.target = target;
      group.add(surfaceWash);

      [diffuser, lens, centerGlow].forEach((mesh) => {
        mesh.userData.animate = (_delta, clock) => {
          const time = Number(clock?.elapsedTime) || 0;
          const pulse = 0.97 + Math.sin(time * 1.25 + index * 0.81) * 0.03;
          if (mesh === diffuser) mesh.material.opacity = 0.68 * pulse;
          if (mesh === lens) mesh.material.opacity = 0.90 * pulse;
          if (mesh === centerGlow) mesh.material.opacity = 0.84 * pulse;
        };
      });
      [halo, wallWash, floorWash].forEach((mesh) => {
        const basePosition = mesh.position.clone();
        const baseScale = mesh.scale.clone();
        mesh.userData.animate = (_delta, clock) => {
          const time = Number(clock?.elapsedTime) || 0;
          const pulse = 0.96 + Math.sin(time * 1.35 + index * 0.81) * 0.04;
          const warpA = Math.sin(time * 2.2 + index * 0.83 + basePosition.z * 3.4);
          const warpB = Math.cos(time * 1.7 + index * 1.13 + basePosition.x * 2.1 + basePosition.y * 1.4);
          const tangentShift = 0.0018 * warpA;
          const verticalShift = 0.0012 * warpB;
          mesh.position.copy(basePosition)
            .addScaledVector(tangent, tangentShift)
            .addScaledVector(up, verticalShift);
          const sx = 1 + warpA * 0.018;
          const sy = 1 + warpB * 0.024;
          mesh.scale.set(baseScale.x * sx, baseScale.y * sy, baseScale.z);
          if (mesh === halo) mesh.material.opacity = 0.40 * pulse;
          if (mesh === wallWash) mesh.material.opacity = 0.17 * pulse;
          if (mesh === floorWash) mesh.material.opacity = 0.11 * pulse;
        };
      });
      surfaceWash.userData.animate = (_delta, clock) => {
        const time = Number(clock?.elapsedTime) || 0;
        const shimmer = 0.97 + Math.sin(time * 1.6 + index * 0.64) * 0.03;
        surfaceWash.intensity = 2.1 * shimmer;
        nearFieldFill.intensity = 0.8 * shimmer;
      };
    }
  }

  _createLaminarJets(group, length, width) {
    if (!this._hasVisiblePaving()) return;

    // Laminar jets should read like a clear, continuous glass rod rather than a
    // stream of droplets. Keep the deck hardware almost flush and let the water
    // itself carry the visual interest through refraction/specular highlights.
    const trimMetal = this._featureMaterial(0x8e989d, { metalness: 0.82, roughness: 0.17 });
    const apertureMaterial = this._featureMaterial(0x172126, { metalness: 0.12, roughness: 0.36 });
    const clearWater = createWaterFeatureMaterial({
      transmission:0.88, thickness:0.018, opacity:0.66
    });

    const entry = this._getEntryStepInfo(length, width);
    const frame = this._sideFrame(entry.side, length, width, 0.45);
    const pavingTop = 0.06;
    const waterSurfaceZ = this._getPoolWaterSurfaceLocalZ(-0.05);

    [-0.28, 0, 0.28].forEach((ratio, index) => {
      const along = frame.span * ratio;
      const deckCenter = frame.center.clone().addScaledVector(frame.tangent, along);

      // Flush stainless deck escutcheon with a dark recessed nozzle. The old
      // 160 mm-high cylinder made the laminar look like a fountain fitting
      // sitting on top of the paving rather than a deck-mounted canister.
      const trim = new THREE.Mesh(
        new THREE.RingGeometry(0.052, 0.082, 40),
        trimMetal.clone()
      );
      trim.name = `laminar-deck-trim-${index}`;
      trim.position.set(deckCenter.x, deckCenter.y, pavingTop + 0.0025);
      trim.renderOrder = 4;
      trim.userData.isPoolFeature = true;
      group.add(trim);

      const aperture = new THREE.Mesh(
        new THREE.CircleGeometry(0.050, 36),
        apertureMaterial.clone()
      );
      aperture.name = `laminar-nozzle-aperture-${index}`;
      aperture.position.set(deckCenter.x, deckCenter.y, pavingTop + 0.0028);
      aperture.renderOrder = 4;
      aperture.userData.isPoolFeature = true;
      group.add(aperture);

      // The water starts just above the recessed aperture and follows a clean,
      // stable parabolic arc into the pool. A higher subdivision count keeps the
      // silhouette smooth at grazing camera angles.
      const start = deckCenter.clone();
      start.z = pavingTop + 0.010;
      const end = deckCenter.clone().addScaledVector(frame.inward, 1.10);
      end.z = waterSurfaceZ + 0.006;
      const apex = deckCenter.clone().addScaledVector(frame.inward, 0.50);
      apex.z = Math.max(start.z, end.z) + 0.73;
      const curve = new THREE.QuadraticBezierCurve3(start, apex, end);

      const streamRadius = 0.0135;
      const tubeGeometry = new THREE.TubeGeometry(curve, 72, streamRadius, 16, false);
      const tube = new THREE.Mesh(tubeGeometry, clearWater.clone());
      tube.name = `laminar-water-${index}`;
      tube.frustumCulled = false;
      tube.renderOrder = 5;
      tube.userData.isPoolFeature = true;
      tube.userData.animate = (_delta, clock) => {
        const time = Number(clock?.elapsedTime) || 0;
        tube.material.opacity = 0.64 + Math.sin(time * 1.35 + index * 0.8) * 0.018;
      };
      group.add(tube);

      // A very faint moving internal highlight gives the clear stream readable
      // flow without inserting travelling balls/droplets. Fresnel emphasis makes
      // the edge catch the HDR environment like a real glass-like water rod.
      const highlightMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uPhase: { value: index * 1.37 }
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vNormalView;
          varying vec3 vViewDir;
          void main(){
            vUv = uv;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vNormalView = normalize(normalMatrix * normal);
            vViewDir = normalize(-mvPosition.xyz);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          precision highp float;
          varying vec2 vUv;
          varying vec3 vNormalView;
          varying vec3 vViewDir;
          uniform float uTime;
          uniform float uPhase;
          void main(){
            float facing = abs(dot(normalize(vNormalView), normalize(vViewDir)));
            float fresnel = pow(1.0 - clamp(facing, 0.0, 1.0), 2.2);
            float slowBand = 0.5 + 0.5 * sin(vUv.x * 42.0 - uTime * 1.35 + uPhase);
            float fineBand = 0.5 + 0.5 * sin(vUv.x * 118.0 - uTime * 2.2 + uPhase * 2.0);
            float axial = slowBand * 0.012 + pow(fineBand, 5.0) * 0.016;
            float alpha = 0.022 + fresnel * 0.13 + axial;
            gl_FragColor = vec4(vec3(0.86, 0.98, 1.0), alpha);
          }
        `
      });
      highlightMaterial.toneMapped = true;
      const highlight = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 72, streamRadius * 0.72, 12, false),
        highlightMaterial
      );
      highlight.name = `laminar-water-pulse-highlight-${index}`;
      highlight.frustumCulled = false;
      highlight.renderOrder = 6;
      highlight.userData.isPoolFeature = true;
      highlight.userData.animate = (_delta, clock) => {
        highlightMaterial.uniforms.uTime.value = Number(clock?.elapsedTime) || 0;
      };
      group.add(highlight);

      // Small meniscus where the stream exits the nozzle. It is deliberately
      // restrained: laminar flow should leave the fitting cleanly with no spray.
      const meniscus = new THREE.Mesh(
        new THREE.SphereGeometry(streamRadius * 1.08, 18, 12),
        clearWater.clone()
      );
      meniscus.name = `laminar-nozzle-meniscus-${index}`;
      meniscus.position.copy(start);
      meniscus.scale.set(1.0, 1.25, 0.72);
      meniscus.renderOrder = 5;
      meniscus.userData.isPoolFeature = true;
      group.add(meniscus);

      // Real laminar streams enter quietly and create a tight dimple with only a
      // small set of expanding rings. Avoid the former spray-particle burst,
      // which visually turned the feature into a normal turbulent deck jet.
      const dimpleMaterial = new THREE.MeshBasicMaterial({
        color: 0xe5faff,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const dimple = new THREE.Mesh(new THREE.RingGeometry(0.022, 0.041, 36), dimpleMaterial);
      dimple.name = `laminar-impact-splash-dimple-${index}`;
      dimple.position.set(end.x, end.y, waterSurfaceZ + 0.008);
      dimple.scale.set(1.0, 0.72, 1.0);
      dimple.frustumCulled = false;
      dimple.renderOrder = 4;
      dimple.userData.isPoolFeature = true;
      dimple.userData.animate = (_delta, clock) => {
        const time = Number(clock?.elapsedTime) || 0;
        const pulse = 0.96 + Math.sin(time * 2.15 + index) * 0.04;
        dimple.scale.set(pulse, 0.72 * pulse, 1);
        dimple.material.opacity = 0.11 + Math.sin(time * 1.9 + index * 0.7) * 0.018;
      };
      group.add(dimple);

      for (let ringIndex = 0; ringIndex < 2; ringIndex += 1) {
        const impactMaterial = new THREE.MeshBasicMaterial({
          color: 0xdaf7ff,
          transparent: true,
          opacity: 0.10,
          depthWrite: false,
          side: THREE.DoubleSide
        });
        const impact = new THREE.Mesh(new THREE.RingGeometry(0.038, 0.047, 40), impactMaterial);
        impact.name = `laminar-impact-ripple-${index}-${ringIndex}`;
        impact.position.set(end.x, end.y, waterSurfaceZ + 0.007 + ringIndex * 0.0005);
        impact.frustumCulled = false;
        impact.renderOrder = 4;
        impact.userData.isPoolFeature = true;
        const ringPhase = ringIndex / 2;
        impact.userData.animate = (_delta, clock) => {
          const time = Number(clock?.elapsedTime) || 0;
          const progress = (time * 0.46 + ringPhase + index * 0.09) % 1;
          const scale = 0.85 + progress * 3.0;
          impact.scale.set(scale, scale * 0.72, 1);
          impact.material.opacity = Math.pow(1 - progress, 1.8) * 0.11;
        };
        group.add(impact);
      }
    });
  }

  _createBubblers(group, length, width) {
    const fitting = this._featureMaterial(0xb9c1c5, { metalness: 0.58, roughness: 0.24 });
    const nozzle = this._featureMaterial(0x26383f, { metalness: 0.12, roughness: 0.34 });
    const clearWater = createWaterFeatureMaterial({
      transmission:0.68, thickness:0.008, opacity:0.34
    });
    const aeratedWater = createWaterFeatureMaterial({
      color: 0xf2fbff,
      roughness: 0.10,
      transmission: 0.18,
      thickness: 0.018,
      opacity: 0.57
    });
    const foamWater = new THREE.MeshStandardMaterial({
      color: 0xf8fdff,
      roughness: 0.28,
      metalness: 0,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const entry = this._getEntryStepInfo(length, width);
    const center = entry.topStepCenter || entry.center;
    // Keep the fitting flush with the finished tread. Real shelf bubblers are
    // visually dominated by water, so the fitting is intentionally compact.
    const z = Number.isFinite(entry.topZ) ? entry.topZ - 0.014 : -0.2;
    const fittingTopZ = z + 0.014;
    const waterSurfaceZ = this._getPoolWaterSurfaceLocalZ(-0.10);
    const tangent = entry.topStepTangent || new THREE.Vector3(1,0,0);
    const span = Math.max(0.2, Number(entry.topStepSpan) || 0.9);
    const minSpacing = 0.60;
    const maxSpacing = 0.90;
    const minIntervals = Math.max(1, Math.ceil(span / maxSpacing));
    const maxIntervals = Math.max(1, Math.floor(span / minSpacing));
    const intervalCount = maxIntervals >= minIntervals
      ? THREE.MathUtils.clamp(Math.round(span / 0.75), minIntervals, maxIntervals)
      : 1;
    const spacing = span / intervalCount;
    const count = Math.max(1, intervalCount - 1);

    const makePlume = (point, index, radiusScale = 1, heightScale = 1, phase = 0, material = aeratedWater) => {
      // The visible bubbler starts just below the waterline and forms one
      // turbulent, aerated column rather than several separate "hose" tubes.
      const plumeBaseZ = Math.max(fittingTopZ + 0.01, waterSurfaceZ - 0.028);
      const aboveWaterHeight = 0.30 * heightScale;
      const submergedLead = Math.max(0, waterSurfaceZ - plumeBaseZ);
      const plumeHeight = Math.max(0.24, submergedLead + aboveWaterHeight);
      const radialSegments = 22;
      const verticalSegments = 24;
      const positions = [];
      const base = [];
      const uvs = [];
      const indices = [];

      for (let row = 0; row <= verticalSegments; row += 1) {
        const t = row / verticalSegments;
        // Broad, boiling base; slightly pinched middle; irregular rounded crest.
        const shoulder = Math.exp(-Math.pow((t - 0.76) / 0.20, 2));
        const tipTaper = 1 - 0.50 * THREE.MathUtils.smoothstep(t, 0.78, 1.0);
        const profile = (0.072 * (1 - 0.32 * t) + 0.024 * shoulder) * tipTaper * radiusScale;
        for (let segment = 0; segment <= radialSegments; segment += 1) {
          const u = segment / radialSegments;
          const angle = u * Math.PI * 2;
          const lobes = 1
            + Math.sin(angle * 3 + phase) * 0.070
            + Math.sin(angle * 7 - phase * 1.7) * 0.035;
          const radius = profile * lobes;
          const x = point.x + Math.cos(angle) * radius;
          const y = point.y + Math.sin(angle) * radius;
          const zz = plumeBaseZ + plumeHeight * t;
          positions.push(x, y, zz);
          base.push(x, y, zz);
          uvs.push(u, t);
        }
      }
      const stride = radialSegments + 1;
      for (let row = 0; row < verticalSegments; row += 1) {
        for (let segment = 0; segment < radialSegments; segment += 1) {
          const a = row * stride + segment;
          const b = a + stride;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setIndex(indices);
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.computeVertexNormals();
      const plume = new THREE.Mesh(geometry, material.clone());
      plume.name = `bubbler-plume-${index}-${phase}`;
      plume.frustumCulled = false;
      plume.renderOrder = 5;
      plume.userData.animate = (_delta, clock) => {
        const time = Number(clock?.elapsedTime) || 0;
        const attribute = geometry.attributes.position;
        for (let row = 0; row <= verticalSegments; row += 1) {
          const t = row / verticalSegments;
          const turbulence = THREE.MathUtils.smoothstep(t, 0.12, 0.95);
          const crest = THREE.MathUtils.smoothstep(t, 0.64, 1.0);
          for (let segment = 0; segment <= radialSegments; segment += 1) {
            const u = segment / radialSegments;
            const angle = u * Math.PI * 2;
            const vertex = row * stride + segment;
            const offset = vertex * 3;
            const travelling = Math.sin(time * 8.1 - t * 18.0 + angle * 3.0 + phase);
            const broken = Math.sin(time * 11.7 - t * 31.0 + angle * 7.0 - phase * 0.6);
            const sideways = (travelling * 0.0035 + broken * 0.0025 * crest) * turbulence * radiusScale;
            attribute.array[offset] = base[offset] + Math.cos(angle) * sideways;
            attribute.array[offset + 1] = base[offset + 1] + Math.sin(angle) * sideways;
            attribute.array[offset + 2] = base[offset + 2]
              + travelling * 0.0030 * turbulence
              + broken * 0.0055 * crest;
          }
        }
        attribute.needsUpdate = true;
        geometry.computeVertexNormals();
        plume.material.opacity = (material.opacity ?? 0.5) * (0.94 + Math.sin(time * 5.6 + phase) * 0.06);
      };
      plume.userData.animate(0, this.clock);
      group.add(plume);
      return { plumeBaseZ, plumeHeight };
    };

    for (let index = 0; index < count; index += 1) {
      const along = count === 1 ? 0 : -span * 0.5 + spacing * (index + 1);
      const point = center.clone().addScaledVector(tangent, along);

      this._addFeatureMesh(
        group,
        new THREE.CylinderGeometry(0.055, 0.055, 0.028, 28),
        fitting.clone(),
        { x:point.x, y:point.y, z },
        { x:Math.PI/2, y:0, z:0 },
        `bubbler-fitting-${index}`
      );
      this._addFeatureMesh(
        group,
        new THREE.CylinderGeometry(0.026, 0.026, 0.004, 24),
        nozzle.clone(),
        { x:point.x, y:point.y, z:fittingTopZ + 0.0015 },
        { x:Math.PI/2, y:0, z:0 },
        `bubbler-nozzle-${index}`
      );

      // A narrow coherent underwater feed connects the flush nozzle to the
      // aerated plume at the surface. It is deliberately subtle so it reads as
      // moving water, not a rigid transparent rod.
      const underwaterHeight = Math.max(0.025, waterSurfaceZ - fittingTopZ + 0.010);
      const feedCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(point.x, point.y, fittingTopZ + 0.006),
        new THREE.Vector3(point.x + 0.002, point.y - 0.001, fittingTopZ + underwaterHeight * 0.45),
        new THREE.Vector3(point.x - 0.002, point.y + 0.002, fittingTopZ + underwaterHeight)
      ]);
      const feed = new THREE.Mesh(new THREE.TubeGeometry(feedCurve, 10, 0.016, 9, false), clearWater.clone());
      feed.name = `bubbler-stream-${index}-feed`;
      feed.frustumCulled = false;
      feed.userData.animate = (_delta, clock) => {
        const time = Number(clock?.elapsedTime) || 0;
        feed.material.opacity = 0.28 + Math.sin(time * 7.4 + index * 0.8) * 0.045;
      };
      group.add(feed);

      // Two nested irregular shells give the column a translucent outer skin
      // and a denser white aerated core, closer to a real shelf bubbler plume.
      const outerInfo = makePlume(point, index, 1.0, 1.0, index * 0.63, aeratedWater);
      makePlume(point, index, 0.63, 0.91, 1.7 + index * 0.49, foamWater);

      // Boiling water at the surface: several low-opacity rings expand at
      // different phases rather than one oversized perfectly circular ripple.
      for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
        const rippleMaterial = clearWater.clone();
        rippleMaterial.opacity = 0.20;
        const ripple = new THREE.Mesh(new THREE.RingGeometry(0.070, 0.090, 36), rippleMaterial);
        ripple.name = `bubbler-ripple-${index}-${ringIndex}`;
        ripple.position.set(point.x, point.y, waterSurfaceZ + 0.002 + ringIndex * 0.0005);
        ripple.frustumCulled = false;
        const phase = ringIndex / 3;
        ripple.userData.animate = (_delta, clock) => {
          const time = Number(clock?.elapsedTime) || 0;
          const progress = (time * 0.60 + phase + index * 0.17) % 1;
          const scale = 0.9 + progress * 2.5;
          ripple.scale.set(scale, scale, 1);
          ripple.material.opacity = Math.pow(1 - progress, 1.6) * 0.22;
        };
        ripple.userData.animate(0, this.clock);
        group.add(ripple);
      }

      // Small beads shed from the turbulent crest and fall back into the pool.
      // They are intentionally much smaller than the previous "bubble balls".
      for (let dropletIndex = 0; dropletIndex < 16; dropletIndex += 1) {
        const dropletMaterial = aeratedWater.clone();
        dropletMaterial.opacity = 0.42;
        const radius = 0.006 + (dropletIndex % 4) * 0.0018;
        const droplet = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), dropletMaterial);
        droplet.name = `bubbler-bubble-${index}-${dropletIndex}`;
        droplet.frustumCulled = false;
        const phase = dropletIndex / 16;
        const angle = dropletIndex * 2.399 + index * 0.71;
        const crestZ = outerInfo.plumeBaseZ + outerInfo.plumeHeight * (0.62 + (dropletIndex % 5) * 0.055);
        droplet.userData.animate = (_delta, clock) => {
          const time = Number(clock?.elapsedTime) || 0;
          const progress = (time * (0.80 + (dropletIndex % 4) * 0.035) + phase) % 1;
          const radial = 0.020 + progress * (0.065 + (dropletIndex % 3) * 0.012);
          const hop = Math.sin(Math.PI * progress) * (0.055 + (dropletIndex % 4) * 0.012);
          droplet.position.set(
            point.x + Math.cos(angle) * radial,
            point.y + Math.sin(angle) * radial,
            crestZ + hop - progress * 0.055
          );
          const fade = Math.sin(Math.PI * progress);
          droplet.material.opacity = fade * 0.38;
          droplet.scale.set(0.78, 0.78, 1.22 + fade * 0.35);
        };
        droplet.userData.animate(0, this.clock);
        group.add(droplet);
      }
    }
  }

  _constrainAcrylicWindowPlacement(placement) {
    if (!placement) return null;
    const points = (this.poolGroup?.userData?.outerPts || [])
      .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y))
      .map(point => new THREE.Vector2(point.x, point.y));
    if (points.length > 3 && points[0].distanceToSquared(points[points.length-1]) < 1e-10) points.pop();
    if (points.length < 2) return placement;

    const shape = this.isCustomShape ? 'freeform' : String(this.poolParams?.shape || '').toLowerCase();
    const sourceEdges = Array.isArray(this.poolGroup?.userData?.outerPtSourceEdgeIndices)
      ? this.poolGroup.userData.outerPtSourceEdgeIndices : [];
    const requested = Math.max(0.5, Number(this.acrylicWindowState?.length) || 1.8);
    const allSegments = points.map((a,index) => ({
      index,
      sourceEdgeIndex:Number.isFinite(Number(sourceEdges[index])) ? Number(sourceEdges[index]) : index,
      a,
      b:points[(index+1)%points.length]
    })).filter(segment => segment.a.distanceToSquared(segment.b) > 1e-10);
    let segments = allSegments;
    if (shape === 'freeform') {
      const sourceEdgeIndex = Number.isFinite(Number(sourceEdges[placement.edgeIndex]))
        ? Number(sourceEdges[placement.edgeIndex]) : Number(placement.sourceEdgeIndex ?? placement.edgeIndex);
      placement.sourceEdgeIndex = sourceEdgeIndex;
      segments = allSegments.filter(segment => segment.sourceEdgeIndex === sourceEdgeIndex);
    } else if (!['oval','kidney'].includes(shape)) {
      segments = allSegments.filter(segment => segment.index === Number(placement.edgeIndex));
    }
    if (!segments.length) return placement;

    let total = 0;
    const measured = segments.map(segment => {
      const span = segment.a.distanceTo(segment.b);
      const entry = { ...segment, start:total, span };
      total += span;
      return entry;
    });
    const wallThickness = Math.max(0.05, Number(this.poolGroup?.userData?.wallThickness) || 0.20);
    // Straight wall openings retain a complete wall-thickness return at each
    // end. This gives an acrylic-to-solid corner the same clean junction as a
    // normal wall-to-wall corner instead of leaving a fragile 50 mm sliver.
    const junctionInset = ['oval','kidney'].includes(shape) ? 0.05 : Math.min(wallThickness, total * 0.24);
    const maxLength = Math.max(0.5, Math.min(5.0, total - junctionInset * 2));
    const boundedLength = Math.min(requested, maxLength);
    if (this.acrylicWindowState) this.acrylicWindowState.length = boundedLength;

    // A continuous oval/kidney wall wraps naturally; its nearest point is
    // already valid once the total window length is capped to the perimeter.
    if (['oval','kidney'].includes(shape)) return placement;

    let best = null;
    measured.forEach(segment => {
      const delta = segment.b.clone().sub(segment.a);
      const lenSq = Math.max(1e-10, delta.lengthSq());
      const t = THREE.MathUtils.clamp(placement.boundary.clone().sub(segment.a).dot(delta)/lenSq,0,1);
      const point = segment.a.clone().lerp(segment.b,t);
      const d2 = point.distanceToSquared(placement.boundary);
      if (!best || d2 < best.d2) best = { segment,t,point,d2,distance:segment.start+segment.span*t };
    });
    if (!best) return placement;
    const margin = Math.min(junctionInset,total*0.24);
    const half = boundedLength*0.5;
    const centerDistance = THREE.MathUtils.clamp(best.distance, half+margin, Math.max(half+margin,total-half-margin));
    const active = measured.find(segment => centerDistance <= segment.start+segment.span+1e-8) || measured[measured.length-1];
    const t = THREE.MathUtils.clamp((centerDistance-active.start)/Math.max(1e-8,active.span),0,1);
    const tangent = active.b.clone().sub(active.a).normalize();
    const ccw = (() => { let area=0; points.forEach((a,i)=>{const b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y;}); return area>0; })();
    const outward = ccw ? new THREE.Vector2(tangent.y,-tangent.x) : new THREE.Vector2(-tangent.y,tangent.x);
    placement.edgeIndex = active.index;
    placement.sourceEdgeIndex = active.sourceEdgeIndex;
    placement.boundary = active.a.clone().lerp(active.b,t);
    placement.tangent = tangent;
    placement.outward = outward;
    placement.inward = outward.clone().multiplyScalar(-1);
    return placement;
  }

  _getAcrylicWindowArcSegments(placement, length) {
    const samples = this._getPoolBoundarySamples?.(0.11) || [];
    if (!placement || samples.length < 4) return [];
    let centerIndex = 0;
    let nearest = Infinity;
    samples.forEach((sample,index) => {
      const d2 = sample.boundary.distanceToSquared(placement.boundary);
      if (d2 < nearest) { nearest=d2; centerIndex=index; }
    });
    const half = Math.max(0.25, Number(length)||1.8) * 0.5;
    const shape = this.isCustomShape ? 'freeform' : String(this.poolParams?.shape || '').toLowerCase();
    const sourceEdgeIndex = Number(placement.sourceEdgeIndex ?? samples[centerIndex]?.sourceEdgeIndex);
    const accepts = sample => shape !== 'freeform' || Number(sample?.sourceEdgeIndex) === sourceEdgeIndex;
    const result = [];
    const addSegment = (fromIndex,toIndex,prepend=false) => {
      const from=samples[fromIndex], to=samples[toIndex];
      if (!accepts(from) || !accepts(to)) return 0;
      const span=from.boundary.distanceTo(to.boundary);
      if (span < 0.008) return 0;
      const tangent=to.boundary.clone().sub(from.boundary).normalize();
      const entry={ center:from.boundary.clone().lerp(to.boundary,0.5), tangent, outward:from.outward.clone(), span, edgeIndex:from.edgeIndex, sourceEdgeIndex:from.sourceEdgeIndex };
      if (prepend) result.unshift(entry); else result.push(entry);
      return span;
    };
    let cursor=centerIndex, distance=0, guard=0;
    while (distance < half && guard++ < samples.length && result.length < 48) {
      const previous=(cursor-1+samples.length)%samples.length;
      const added=addSegment(previous,cursor,true);
      if (!added) break;
      distance+=added; cursor=previous;
    }
    cursor=centerIndex; distance=0; guard=0;
    while (distance < half && guard++ < samples.length && result.length < 48) {
      const next=(cursor+1)%samples.length;
      const added=addSegment(cursor,next,false);
      if (!added) break;
      distance+=added; cursor=next;
    }
    return result;
  }

  _isAcrylicPlacementOnEntryWall(placement) {
    if (!placement) return false;
    const authoredRaw=this.poolGroup?.userData?.wallMeshes;
    const authored=Array.isArray(authoredRaw)?authoredRaw.filter(Boolean):(authoredRaw?.isObject3D?[authoredRaw]:Object.values(authoredRaw||{}).filter(Boolean));
    const targetWall=authored.find((wall)=>
      Number(wall?.userData?.edgeIndex)===Number(placement.edgeIndex) ||
      Number(wall?.userData?.sourceEdgeIndex)===Number(placement.sourceEdgeIndex ?? placement.edgeIndex)
    );
    return !!(targetWall && this._isEntryStepWall?.(targetWall));
  }

  _findFallbackAcrylicPlacement() {
    const authoredRaw=this.poolGroup?.userData?.wallMeshes;
    const authored=Array.isArray(authoredRaw)?authoredRaw.filter(Boolean):(authoredRaw?.isObject3D?[authoredRaw]:Object.values(authoredRaw||{}).filter(Boolean));
    for (const wall of authored) {
      if (!wall || this._isEntryStepWall?.(wall)) continue;
      wall.updateWorldMatrix?.(true,false);
      const center=new THREE.Box3().setFromObject(wall).getCenter(new THREE.Vector3());
      const local=this.poolGroup.worldToLocal(center.clone());
      let placement=this._nearestPoolBoundaryPlacement(new THREE.Vector2(local.x,local.y),0);
      if (!placement) continue;
      placement=this._constrainAcrylicWindowPlacement(placement);
      if (placement && !this._isAcrylicPlacementOnEntryWall(placement)) return placement;
    }
    return null;
  }

  _placeAcrylicWindowRoot(root, targetPoint) {
    if (!root || !targetPoint) return null;
    let placement = this._nearestPoolBoundaryPlacement(targetPoint, 0);
    if (!placement) return null;
    placement = this._constrainAcrylicWindowPlacement(placement);
    // Entry steps and the full-width bench share the same entry wall. Acrylic
    // panels are not allowed to occupy that wall because the geometry would
    // overlap the stair/bench system. When first adding the feature, choose a
    // safe alternative wall; while dragging, simply refuse the invalid move.
    if (this._isAcrylicPlacementOnEntryWall(placement)) {
      const hasExistingPlacement=!!this.acrylicWindowState?.placement;
      if (hasExistingPlacement) return null;
      placement=this._findFallbackAcrylicPlacement();
      if (!placement) return null;
    }
    const rotation = Math.atan2(placement.tangent.y, placement.tangent.x);
    const wallThickness = Math.max(0.08, Number(this.poolGroup?.userData?.wallThickness) || 0.20);
    const wallCenter = placement.boundary.clone().addScaledVector(placement.outward, wallThickness * 0.5);
    // Use the authored wall for the exact sampled edge, as in the previously
    // stable acrylic implementation. Matching by sourceEdgeIndex can select a
    // neighbouring sampled wall near a corner, shifting the replacement skin
    // and causing the wall/coping return to miss the adjoining corner.
    const authored = Array.isArray(this.poolGroup?.userData?.wallMeshes)
      ? this.poolGroup.userData.wallMeshes.filter(Boolean) : [];
    const targetWall = authored.find((wall) => Number(wall?.userData?.edgeIndex) === Number(placement.edgeIndex));
    const side = targetWall?.userData?.side;
    if (targetWall && (side === 'north' || side === 'south')) wallCenter.y = targetWall.position.y;
    if (targetWall && (side === 'east' || side === 'west')) wallCenter.x = targetWall.position.x;
    root.position.set(wallCenter.x, wallCenter.y, 0);
    root.rotation.z = rotation;
    root.userData.acrylicEdgeIndex = placement.edgeIndex;
    this.acrylicWindowState.placement = { x: wallCenter.x, y: wallCenter.y, rotation };
    return placement;
  }

  _restoreAcrylicWindowWallCut() {
    const cut = this._acrylicWindowCut;
    if (!cut) return;
    (cut.entries || []).forEach(({ mesh, material, visible }) => {
      if (!mesh) return;
      if (material) mesh.material = material;
      if (typeof visible === 'boolean') mesh.visible = visible;
      if (mesh.userData) mesh.userData.acrylicSuppressed = false;
    });
    (cut.copingMaterialEntries || []).forEach(({ mesh, material, visible }) => {
      if (!mesh) return;
      if (material) mesh.material = material;
      if (typeof visible === 'boolean') mesh.visible = visible;
    });
    if (cut.mesh && cut.originalMaterial) cut.mesh.material = cut.originalMaterial;
    if (cut.mesh && typeof cut.originalVisible === 'boolean') cut.mesh.visible = cut.originalVisible;
    if (cut.mesh?.userData) cut.mesh.userData.acrylicSuppressed = false;
    if (cut.copingMesh && typeof cut.originalCopingVisible === 'boolean') cut.copingMesh.visible = cut.originalCopingVisible;
    (cut.copingEntries || []).forEach(({ mesh, visible }) => {
      if (mesh) mesh.visible = visible;
    });
    const generated = [cut.cutMaterial, ...(cut.generatedMaterials || [])].flatMap(item => Array.isArray(item) ? item : [item]);
    const materials = generated;
    materials.filter(Boolean).forEach((material) => material.dispose?.());
    (cut.replacements || []).forEach((mesh) => {
      mesh?.parent?.remove?.(mesh);
      mesh?.geometry?.dispose?.();
      const replacementMaterials = Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
      replacementMaterials.filter(Boolean).forEach(material => material.dispose?.());
    });
    this._acrylicWindowCut = null;
  }

  _applyAcrylicWindowWallCut(placement, root, panelCenterZ, panelHeight) {
    this._restoreAcrylicWindowWallCut();
    const authored = this.poolGroup?.userData?.wallMeshes;
    const wallMeshes = Array.isArray(authored)
      ? authored.filter(Boolean)
      : authored?.isObject3D ? [authored] : Object.values(authored || {}).filter(Boolean);
    let targetWall = wallMeshes.find((wall) =>
      Number(wall?.userData?.edgeIndex) === Number(placement?.edgeIndex)
      || Number(wall?.userData?.sourceEdgeIndex) === Number(placement?.edgeIndex)
    );
    if (!targetWall && wallMeshes.length === 1) targetWall = wallMeshes[0];
    if (!targetWall?.material || !this.poolGroup) return;

    // Rectangle walls are simple authored boxes, so make a real structural
    // opening rather than relying on a shader discard. Hide the original wall
    // and rebuild its four solid regions around the frameless acrylic panel.
    // This remains visible from every camera angle and leaves an actual void in
    // the wall where the glass sits.
    const structuralShape = String(this.poolParams?.shape || '').toLowerCase();
    if (!this.isCustomShape && (structuralShape === 'rectangular' || structuralShape === 'l' || structuralShape === 'lap' || structuralShape === 'plunge' || structuralShape === 'wet-edge') && (targetWall.userData?.side || structuralShape === 'l')) {
      targetWall.geometry?.computeBoundingBox?.();
      const bounds = targetWall.geometry?.boundingBox;
      const size = bounds?.getSize(new THREE.Vector3()) || new THREE.Vector3();
      const side = targetWall.userData.side;
      const spanAxis = structuralShape === 'l' ? 'x' : (side === 'north' || side === 'south' ? 'x' : 'y');
      const outline = (this.poolGroup?.userData?.outerPts || []).filter(point=>Number.isFinite(point?.x)&&Number.isFinite(point?.y));
      const edgeA = outline[Number(placement.edgeIndex)];
      const edgeB = outline.length ? outline[(Number(placement.edgeIndex)+1)%outline.length] : null;
      const authoredSpan = edgeA && edgeB ? new THREE.Vector2(edgeA.x,edgeA.y).distanceTo(new THREE.Vector2(edgeB.x,edgeB.y)) : 0;
      const wallSpan = Math.max(0.6, authoredSpan || size[spanAxis] * Math.abs(targetWall.scale?.[spanAxis] || 1));
      const wallThickness = Math.max(0.08, Number(this.poolGroup?.userData?.wallThickness) || 0.20);
      const wallHeight = Math.max(0.6, size.z * Math.abs(targetWall.scale?.z || 1));
      const wallTop = Number(targetWall.position?.z) + wallHeight * 0.5;
      const wallBottom = wallTop - wallHeight;
      const panelTop = panelCenterZ + panelHeight * 0.5;
      const panelBottom = panelCenterZ - panelHeight * 0.5;
      const openingLength = Math.min(Math.max(0.5, Number(this.acrylicWindowState?.length) || 1.8), wallSpan - 0.12);
      const tangent = new THREE.Vector2(placement.tangent.x, placement.tangent.y).normalize();
      const edgeStartOffset = edgeA
        ? new THREE.Vector2(edgeA.x-root.position.x,edgeA.y-root.position.y).dot(tangent)
        : -wallSpan*0.5;
      const edgeEndOffset = edgeB
        ? new THREE.Vector2(edgeB.x-root.position.x,edgeB.y-root.position.y).dot(tangent)
        : wallSpan*0.5;

      // Use the authored wall's actual mitered endpoints for the replacement
      // extents. outerPts describes the centreline edge and can stop short of
      // the real wall return at a corner. Rebuilding from those centreline
      // endpoints left visible gaps where the acrylic wall met its neighbours.
      const projectedObjectSpan = (object) => {
        if (!object?.geometry || !this.poolGroup) return null;
        object.geometry.computeBoundingBox?.();
        const box = object.geometry.boundingBox;
        if (!box) return null;
        object.updateWorldMatrix?.(true,false);
        const xs=[box.min.x,box.max.x], ys=[box.min.y,box.max.y], zs=[box.min.z,box.max.z];
        let min=Infinity,max=-Infinity;
        for (const x of xs) for (const y of ys) for (const z of zs) {
          const world=object.localToWorld(new THREE.Vector3(x,y,z));
          const local=this.poolGroup.worldToLocal(world.clone());
          const along=new THREE.Vector2(local.x-root.position.x,local.y-root.position.y).dot(tangent);
          min=Math.min(min,along); max=Math.max(max,along);
        }
        return Number.isFinite(min)&&Number.isFinite(max)&&max>min ? {min,max} : null;
      };
      const authoredWallSpan=projectedObjectSpan(targetWall);
      const wallStart = authoredWallSpan?.min ?? Math.min(edgeStartOffset,edgeEndOffset);
      const wallEnd = authoredWallSpan?.max ?? Math.max(edgeStartOffset,edgeEndOffset);
      const openingStart = Math.max(wallStart, -openingLength * 0.5);
      const openingEnd = Math.min(wallEnd, openingLength * 0.5);
      const sourceMaterials = Array.isArray(targetWall.material) ? targetWall.material : [targetWall.material];
      const replacements = [];
      const cloneTileMaterial = () => {
        const cloned = sourceMaterials.map((material) => {
          const next = material.clone();
          next.side = THREE.DoubleSide;
          next.needsUpdate = true;
          return next;
        });
        return Array.isArray(targetWall.material) ? cloned : cloned[0];
      };
      const makePlainMaterial = () => {
        const source=sourceMaterials[0];
        const next=source?.clone?.() || new THREE.MeshStandardMaterial({color:0xe8e5df,roughness:0.8});
        ['map','normalMap','bumpMap','roughnessMap','metalnessMap','aoMap','displacementMap'].forEach((key)=>{ if(key in next) next[key]=null; });
        next.side=THREE.DoubleSide; next.needsUpdate=true;
        return next;
      };
      const addWallSection = (name, span, height, x, z) => {
        if (span <= 0.001 || height <= 0.001) return;
        let sectionMaterial=cloneTileMaterial();
        // The underside of the solid wall immediately above the acrylic panel
        // should read as a clean structural return, not as a tiled horizontal face.
        if (name === 'top') {
          const tileFace=Array.isArray(sectionMaterial)?(sectionMaterial[0]||makePlainMaterial()):sectionMaterial;
          const plainTop=makePlainMaterial(), plainBottom=makePlainMaterial();
          sectionMaterial=[tileFace,tileFace,plainTop,plainBottom,tileFace,tileFace];
        }
        const section = this._addFeatureMesh(
          root,
          new THREE.BoxGeometry(span, wallThickness, height),
          sectionMaterial,
          { x, y:0, z },
          null,
          `acrylic-wall-${name}`
        );
        section.userData.isWall = true;
        section.userData.forceVerticalUV = true;
        section.userData.isAcrylicWallReplacement = true;
        section.castShadow = true;
        section.receiveShadow = true;
        section.frustumCulled = false;
        replacements.push(section);
        try { this.updateScaledBoxTilingUVs(section); } catch (_) {}
      };
      const leftSpan = Math.max(0, openingStart - wallStart);
      const rightSpan = Math.max(0, wallEnd - openingEnd);
      addWallSection('left', leftSpan, wallHeight, wallStart + leftSpan * 0.5, wallTop - wallHeight * 0.5);
      addWallSection('right', rightSpan, wallHeight, openingEnd + rightSpan * 0.5, wallTop - wallHeight * 0.5);
      const topHeight = Math.max(0, wallTop - panelTop);
      const bottomHeight = Math.max(0, panelBottom - wallBottom);
      const openingSpan = Math.max(0, openingEnd - openingStart);
      const openingCenter = (openingStart + openingEnd) * 0.5;
      addWallSection('top', openingSpan, topHeight, openingCenter, panelTop + topHeight * 0.5);
      addWallSection('bottom', openingSpan, bottomHeight, openingCenter, wallBottom + bottomHeight * 0.5);

      let copingMesh = null;
      let originalCopingVisible = null;
      if (panelTop >= wallTop - 0.025) {
        const copingSource = this.poolGroup?.userData?.copingSegments;
        const copingMeshes = Array.isArray(copingSource) ? copingSource : Object.values(copingSource || {});
        copingMesh = copingMeshes.find(mesh =>
          Number(mesh?.userData?.edgeIndex ?? mesh?.userData?.copingIndex) === Number(placement.edgeIndex)
          || (side && mesh?.userData?.side === side)
        ) || null;
        if (copingMesh?.geometry && copingMesh?.material) {
          copingMesh.geometry.computeBoundingBox?.();
          const copingSize = copingMesh.geometry.boundingBox?.getSize(new THREE.Vector3()) || new THREE.Vector3(wallSpan,0.25,0.05);
          const localNormal = new THREE.Vector2(-tangent.y,tangent.x);
          const copingOffset = new THREE.Vector2(copingMesh.position.x-root.position.x,copingMesh.position.y-root.position.y);
          const copingY = copingOffset.dot(localNormal);
          const copingZ = Number(copingMesh.position.z)||0.026;

          // Rectangle/plunge coping meshes are authored differently by axis:
          // north/south segments are long in geometry X, while east/west
          // segments are long in geometry Y.  Using raw geometry.size.y as the
          // replacement's cross-wall width therefore worked on one axis and
          // made the perpendicular replacement as wide as the whole wall.
          // Measure the source coping in pool space along the acrylic wall's
          // local normal so both orientations rebuild with the same true width.
          const projectedObjectWidth = (object, direction) => {
            if (!object?.geometry || !this.poolGroup) return 0;
            object.geometry.computeBoundingBox?.();
            const box = object.geometry.boundingBox;
            if (!box) return 0;
            object.updateWorldMatrix?.(true,false);
            let min=Infinity,max=-Infinity;
            for (const x of [box.min.x,box.max.x]) for (const y of [box.min.y,box.max.y]) for (const z of [box.min.z,box.max.z]) {
              const world=object.localToWorld(new THREE.Vector3(x,y,z));
              const local=this.poolGroup.worldToLocal(world.clone());
              const value=new THREE.Vector2(local.x,local.y).dot(direction);
              min=Math.min(min,value); max=Math.max(max,value);
            }
            return Number.isFinite(min)&&Number.isFinite(max) ? Math.max(0,max-min) : 0;
          };
          const copingCrossWidth = Math.max(0.08, projectedObjectWidth(copingMesh,localNormal) || Math.min(copingSize.x||0.25,copingSize.y||0.25));
          const copingHeight = Math.max(0.02, (copingSize.z||0.05) * Math.abs(copingMesh.scale?.z || 1));
          const addCopingSection = (name,span,x) => {
            if (span<=0.001) return;
            const material = Array.isArray(copingMesh.material)
              ? copingMesh.material.map(item=>item.clone())
              : copingMesh.material.clone();
            const mesh=this._addFeatureMesh(root,new THREE.BoxGeometry(span,copingCrossWidth,copingHeight),material,{x,y:copingY,z:copingZ},null,`acrylic-coping-${name}`);
            mesh.userData.isCoping=true; mesh.userData.isAcrylicCopingReplacement=true;
            replacements.push(mesh);
          };

          // L-shape coping is authored as a mitered prism for each perimeter edge.
          // Replacing that prism with simple boxes destroys the authored miters at
          // concave/convex L-shape corners and is the reason one acrylic orientation
          // leaves a bad coping return.  For L-shapes only, preserve the original
          // coping mesh and cut the acrylic opening directly out of its material.
          // All other pool types keep the proven physical replacement path below.
          if (structuralShape === 'l') {
            const originalCopingMaterial = copingMesh.material;
            const openingWorldCenter = root.localToWorld(new THREE.Vector3(openingCenter, 0, copingZ));
            const openingWorldQuaternion = root.getWorldQuaternion(new THREE.Quaternion());
            const openingWorldTangent = new THREE.Vector3(1,0,0).applyQuaternion(openingWorldQuaternion).normalize();
            const openingHalfLength = Math.max(0.001, openingSpan * 0.5);
            const openingAcross = Math.max(0.16, copingCrossWidth * 0.75);
            const patchLShapeCoping = (source, materialIndex) => {
              const material = source.clone();
              material.side = THREE.DoubleSide;
              material.onBeforeCompile = (shader) => {
                shader.uniforms.acrylicLCopingCenter = { value: openingWorldCenter.clone() };
                shader.uniforms.acrylicLCopingTangent = { value: openingWorldTangent.clone() };
                shader.uniforms.acrylicLCopingHalfLength = { value: openingHalfLength };
                shader.uniforms.acrylicLCopingAcross = { value: openingAcross };
                shader.vertexShader = `varying vec3 vAcrylicLCopingWorldPosition;\n${shader.vertexShader}`.replace(
                  '#include <worldpos_vertex>',
                  '#include <worldpos_vertex>\n vAcrylicLCopingWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;'
                );
                shader.fragmentShader = `uniform vec3 acrylicLCopingCenter;\nuniform vec3 acrylicLCopingTangent;\nuniform float acrylicLCopingHalfLength;\nuniform float acrylicLCopingAcross;\nvarying vec3 vAcrylicLCopingWorldPosition;\n${shader.fragmentShader}`.replace(
                  '#include <clipping_planes_fragment>',
                  `#include <clipping_planes_fragment>\n vec3 acrylicLCopingDelta = vAcrylicLCopingWorldPosition - acrylicLCopingCenter;\n float acrylicLCopingAlong = abs(dot(acrylicLCopingDelta, acrylicLCopingTangent));\n vec2 acrylicLCopingAcrossVec = acrylicLCopingDelta.xy - acrylicLCopingTangent.xy * dot(acrylicLCopingDelta.xy, acrylicLCopingTangent.xy);\n if (acrylicLCopingAlong < acrylicLCopingHalfLength && length(acrylicLCopingAcrossVec) < acrylicLCopingAcross) discard;`
                );
              };
              material.customProgramCacheKey = () => `acrylic-l-coping-cut-v1-${placement.edgeIndex}-${materialIndex}`;
              material.needsUpdate = true;
              return material;
            };
            const cutCopingMaterial = Array.isArray(originalCopingMaterial)
              ? originalCopingMaterial.map((material,index)=>patchLShapeCoping(material,index))
              : patchLShapeCoping(originalCopingMaterial,0);
            copingMesh.material = cutCopingMaterial;
            originalCopingVisible = copingMesh.visible;
            copingMesh.visible = true;
            copingMesh.userData.acrylicCopingMaterialCut = true;
            if (!Array.isArray(this._pendingAcrylicCopingMaterialEntries)) this._pendingAcrylicCopingMaterialEntries = [];
            this._pendingAcrylicCopingMaterialEntries.push({mesh:copingMesh, material:originalCopingMaterial, visible:originalCopingVisible});
          } else {
            // Coping commonly overhangs the structural wall at both corners.
            // Rebuild to the coping mesh's real endpoints instead of reusing the
            // wall spans, otherwise the cut coping terminates short of adjoining
            // coping and exposes a notch at each acrylic/window corner.
            const authoredCopingSpan=projectedObjectSpan(copingMesh);
            const copingStart=authoredCopingSpan?.min ?? wallStart;
            const copingEnd=authoredCopingSpan?.max ?? wallEnd;
            const copingLeftSpan=Math.max(0,openingStart-copingStart);
            const copingRightSpan=Math.max(0,copingEnd-openingEnd);
            addCopingSection('left',copingLeftSpan,copingStart+copingLeftSpan*0.5);
            addCopingSection('right',copingRightSpan,openingEnd+copingRightSpan*0.5);
            originalCopingVisible=copingMesh.visible;
            copingMesh.visible=false;
          }
        }
      }

      const originalVisible = targetWall.visible;
      targetWall.visible = false;
      targetWall.userData.acrylicSuppressed = true;
      const copingMaterialEntries = Array.isArray(this._pendingAcrylicCopingMaterialEntries)
        ? this._pendingAcrylicCopingMaterialEntries.splice(0)
        : [];
      const generatedMaterials = copingMaterialEntries.flatMap(({mesh,material}) => {
        if (!mesh?.material || mesh.material === material) return [];
        return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      });
      this._acrylicWindowCut = {
        mesh:targetWall,
        originalMaterial:targetWall.material,
        originalVisible,
        cutMaterial:null,
        physical:true,
        replacements,
        copingMesh,
        originalCopingVisible,
        copingMaterialEntries,
        generatedMaterials
      };
      return;
    }

    this.poolGroup.updateWorldMatrix?.(true, false);
    const centerWorld = this.poolGroup.localToWorld(new THREE.Vector3(root.position.x, root.position.y, panelCenterZ));
    const worldQuaternion = this.poolGroup.getWorldQuaternion(new THREE.Quaternion());
    const tangentWorld = new THREE.Vector3(placement.tangent.x, placement.tangent.y, 0).applyQuaternion(worldQuaternion).normalize();
    const halfLength = Math.max(0.25, Number(this.acrylicWindowState?.length) * 0.5);
    const halfHeight = Math.max(0.15, Number(panelHeight) * 0.5);
    const arcSegments = Array.isArray(root.userData?.acrylicArcSegments) && root.userData.acrylicArcSegments.length
      ? root.userData.acrylicArcSegments.slice(0,48)
      : null;
    const cutCenters = (arcSegments || [{ center:new THREE.Vector2(root.position.x,root.position.y) }]).map(segment =>
      this.poolGroup.localToWorld(new THREE.Vector3(segment.center.x,segment.center.y,panelCenterZ))
    );
    const cutTangents = (arcSegments || [{ tangent:new THREE.Vector2(placement.tangent.x,placement.tangent.y) }]).map(segment =>
      new THREE.Vector3(segment.tangent.x,segment.tangent.y,0).applyQuaternion(worldQuaternion).normalize()
    );
    const cutHalfLengths = (arcSegments || [{ span:halfLength*2 }]).map(segment => Math.max(0.02,Number(segment.span)*0.56));
    const cutCount = Math.min(48,cutCenters.length);
    const paddedCutCenters = Array.from({length:48},(_,index)=>(cutCenters[index]||cutCenters[0]).clone());
    const paddedCutTangents = Array.from({length:48},(_,index)=>(cutTangents[index]||cutTangents[0]).clone());
    const paddedCutHalfLengths = Array.from({length:48},(_,index)=>Number(cutHalfLengths[index]??cutHalfLengths[0]??halfLength));
    const patchMaterial = (source, materialIndex, verticalClip = true) => {
      const material = source.clone();
      material.side = THREE.DoubleSide;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.acrylicCutCenter = { value:centerWorld.clone() };
        shader.uniforms.acrylicCutTangent = { value:tangentWorld.clone() };
        shader.uniforms.acrylicCutHalfLength = { value:halfLength };
        shader.uniforms.acrylicCutHalfHeight = { value:halfHeight };
        shader.uniforms.acrylicCutCount = { value:cutCount };
        shader.uniforms.acrylicCutCenters = { value:paddedCutCenters };
        shader.uniforms.acrylicCutTangents = { value:paddedCutTangents };
        shader.uniforms.acrylicCutHalfLengths = { value:paddedCutHalfLengths };
        shader.vertexShader = `varying vec3 vAcrylicWorldPosition;\n${shader.vertexShader}`.replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\n vAcrylicWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        );
        shader.fragmentShader = `uniform vec3 acrylicCutCenter;\nuniform vec3 acrylicCutTangent;\nuniform float acrylicCutHalfLength;\nuniform float acrylicCutHalfHeight;\nuniform int acrylicCutCount;\nuniform vec3 acrylicCutCenters[48];\nuniform vec3 acrylicCutTangents[48];\nuniform float acrylicCutHalfLengths[48];\nvarying vec3 vAcrylicWorldPosition;\n${shader.fragmentShader}`.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>\n float acrylicVertical = abs(vAcrylicWorldPosition.z - acrylicCutCenter.z);\n if (${verticalClip ? 'acrylicVertical < acrylicCutHalfHeight' : 'true'}) {\n   for (int acrylicIndex=0; acrylicIndex<48; acrylicIndex++) {\n     if (acrylicIndex < acrylicCutCount) {\n       vec3 acrylicDelta = vAcrylicWorldPosition - acrylicCutCenters[acrylicIndex];\n       float acrylicAlong = abs(dot(acrylicDelta, acrylicCutTangents[acrylicIndex]));\n       float acrylicAcross = length(acrylicDelta.xy - acrylicCutTangents[acrylicIndex].xy * dot(acrylicDelta.xy, acrylicCutTangents[acrylicIndex].xy));\n       if (acrylicAlong < acrylicCutHalfLengths[acrylicIndex] && acrylicAcross < 0.34) discard;\n     }\n   }\n }`
        );
      };
      material.customProgramCacheKey = () => `acrylic-wall-cut-v11-${placement.edgeIndex}-${materialIndex}-${verticalClip?'wall':'coping'}`;
      material.needsUpdate = true;
      return material;
    };
    const shapeKey = this.isCustomShape ? 'freeform' : String(this.poolParams?.shape || '').toLowerCase();
    const arcEdgeIndices = new Set((arcSegments || []).map(segment => Number(segment.edgeIndex)));
    const targetWalls = shapeKey === 'freeform' && arcEdgeIndices.size
      ? wallMeshes.filter(wall => arcEdgeIndices.has(Number(wall?.userData?.edgeIndex)))
      : [targetWall];
    const entries = [];
    const generatedMaterials = [];
    targetWalls.filter(Boolean).forEach((wall, wallIndex) => {
      const originalMaterial = wall.material;
      const cutMaterial = Array.isArray(originalMaterial)
        ? originalMaterial.map((material,index) => patchMaterial(material,wallIndex*10+index,true))
        : patchMaterial(originalMaterial,wallIndex*10,true);
      entries.push({ mesh:wall, material:originalMaterial, visible:wall.visible });
      generatedMaterials.push(cutMaterial);
      wall.material = cutMaterial;
      wall.visible = true;
      wall.userData.acrylicSuppressed = true;
    });
    const copingEntries = [];
    const copingMaterialEntries = [];
    const wallTop = 0;
    if (panelCenterZ + panelHeight * 0.5 >= wallTop - 0.025) {
      const copingSource = this.poolGroup?.userData?.copingSegments;
      const copingMeshes = [
        ...(Array.isArray(copingSource) ? copingSource : Object.values(copingSource || {})),
        this.poolGroup?.userData?.copingMesh
      ].filter((mesh,index,array) => mesh && array.indexOf(mesh) === index);
      const halfLengthWithJoint = halfLength + 0.14;
      copingMeshes.filter(Boolean).forEach((coping) => {
        if (shapeKey === 'freeform' && arcEdgeIndices.has(Number(coping?.userData?.edgeIndex))) {
          copingEntries.push({ mesh:coping, visible:coping.visible });
          coping.visible = false;
          return;
        }
        if (['oval','kidney'].includes(shapeKey) && coping.material) {
          const originalMaterial = coping.material;
          const cutMaterial = Array.isArray(originalMaterial)
            ? originalMaterial.map((material,index)=>patchMaterial(material,700+index,false))
            : patchMaterial(originalMaterial,700,false);
          copingMaterialEntries.push({ mesh:coping, material:originalMaterial, visible:coping.visible });
          generatedMaterials.push(cutMaterial);
          coping.material = cutMaterial;
          return;
        }
        const delta = new THREE.Vector2(coping.position.x-root.position.x, coping.position.y-root.position.y);
        const along = Math.abs(delta.dot(new THREE.Vector2(placement.tangent.x, placement.tangent.y)));
        const across = Math.abs(delta.dot(new THREE.Vector2(-placement.tangent.y, placement.tangent.x)));
        if (along <= halfLengthWithJoint && across <= 0.42) {
          copingEntries.push({ mesh:coping, visible:coping.visible });
          coping.visible = false;
        }
      });
    }
    this._acrylicWindowCut = { entries, generatedMaterials, copingEntries, copingMaterialEntries };
  }

  _synchronizePoolTileMaterials() {
    if (!this.poolGroup) return;
    const reference = this._getPoolTileMaterial();
    if (!reference) return;
    const isTileSurface = (object) => {
      if (!object?.isMesh) return false;
      const data = object.userData || {};
      const name = String(object.name || '').toLowerCase();
      if (data.acrylicSuppressed) return false;
      if (data.isPoolWater || data.isInfinityWater || data.isInfinitySpillover || name.includes('water')) return false;
      if (data.isCoping || data.isPoolPaving || name.includes('coping') || name.includes('paving') || name.includes('cap')) return false;
      if (data.isAutomaticPoolLight || data.isAcrylicWindow || name.includes('acrylic-window-panel')) return false;
      return !!(
        data.isWall || data.isFloor || data.isPoolFloor || data.isStep || data.isBench
        || data.isInfinityCatchSurface || data.isAcrylicWallReplacement
        || name.includes('tile-liner') || name.includes('catch-wall')
        || name.includes('tank-end') || name.includes('adjacent-interior')
      );
    };
    const applyReference = (object) => {
      if (!isTileSurface(object)) return;
      const materialCount = Array.isArray(object.material) ? object.material.length : 1;
      const materials = Array.from({ length:Math.max(1, materialCount) }, () => {
        const material = reference.clone();
        material.side = THREE.DoubleSide;
        material.transparent = false;
        material.opacity = 1;

        // Three.js Material.clone() serializes userData. If the reference tile
        // material has already been orange-void patched, that serialization can
        // copy the "patched" flag/uniform payload without copying the live
        // onBeforeCompile shader wrapper. Strip that stale state so the next
        // updatePoolWaterVoid() call installs a fresh, valid orange clip shader.
        material.userData = material.userData || {};
        delete material.userData.orangeInteriorClipPatched;
        delete material.userData.orangeInteriorClipUniforms;

        material.needsUpdate = true;
        return material;
      });
      object.material = Array.isArray(object.material) ? materials : materials[0];
    };
    this.poolGroup.traverse(applyReference);

    // Material replacement invalidates shader-instance state. Reapply the spa
    // clipping system immediately so the orange interior void is never left
    // waiting for a later geometry/paving rebuild.
    if (this.spa) {
      try { updatePoolWaterVoid(this.poolGroup, this.spa); } catch (_) {}
    }
  }

  _createAcrylicWindow(group, length, width) {
    const state = this.acrylicWindowState || (this.acrylicWindowState = { length:1.8, height:0.8, placement:null, centerZ:null });
    state.length = THREE.MathUtils.clamp(Number(state.length) || 1.8, 0.5, 5.0);
    state.height = THREE.MathUtils.clamp(Number(state.height) || 0.8, 0.3, 2.0);
    const alongX = (Number(length) || 0) >= (Number(width) || 0);
    const queryDistance = Math.max(Number(length) || 1, Number(width) || 1) + 2;
    const defaultTarget = alongX
      ? new THREE.Vector2(0, queryDistance)
      : new THREE.Vector2(queryDistance, 0);
    const target = state.placement
      ? new THREE.Vector2(Number(state.placement.x) || 0, Number(state.placement.y) || 0)
      : defaultTarget;

    const root = new THREE.Group();
    root.name = 'acrylic-window';
    root.userData.isAcrylicWindow = true;
    // Resolve and constrain the wall span before creating geometry so the panel
    // and its handles can never be built longer than the selected wall.
    const placement = this._placeAcrylicWindowRoot(root, target);
    const wallDepth = Math.max(0.6, Number(this.poolParams?.deep) || 1.8);
    const raisedHeight = this.poolParams?.raised ? Math.max(0, Number(this.getPoolElevation?.()) || 0) : wallDepth;
    const maxHeight = Math.max(0.3, Math.min(wallDepth, raisedHeight || wallDepth));
    const panelHeight = Math.min(state.height, maxHeight);
    const requestedCenterZ = state.centerZ != null && Number.isFinite(Number(state.centerZ))
      ? Number(state.centerZ)
      : -wallDepth * 0.5;
    const groundBottom = this.poolParams?.raised ? Math.max(-wallDepth, -raisedHeight) : -wallDepth;
    const panelCenterZ = THREE.MathUtils.clamp(requestedCenterZ, groundBottom + panelHeight * 0.5, -panelHeight * 0.5);
    state.centerZ = panelCenterZ;
    const panelTop = panelCenterZ + panelHeight * 0.5;

    const wallThickness = Math.max(0.08, Number(this.poolGroup?.userData?.wallThickness) || 0.20);
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color:0x4fa9c7,
      transparent:true,
      opacity:0.54,
      transmission:0.58,
      roughness:0.08,
      metalness:0,
      thickness:wallThickness,
      ior:1.49,
      clearcoat:0.7,
      clearcoatRoughness:0.12,
      side:THREE.DoubleSide,
      depthWrite:false
    });
    const glass = this._addFeatureMesh(
      root,
      new THREE.BoxGeometry(state.length, wallThickness + 0.012, panelHeight),
      glassMaterial,
      { x:0, y:0, z:panelCenterZ },
      null,
      'acrylic-window-panel'
    );
    glass.userData.isAcrylicWindow = true;
    glass.frustumCulled = false;
    glass.renderOrder = 6;
    const handleMaterial = new THREE.MeshBasicMaterial({
      color:0xffffff, transparent:true, opacity:0.45, depthTest:false, depthWrite:false
    });
    const addResizeHandle = (name, axis, direction, x, z) => {
      const handle = this._addFeatureMesh(root, new THREE.SphereGeometry(0.075, 16, 12), handleMaterial.clone(),
        {x,y:-wallThickness*0.55,z}, null, `acrylic-window-${name}-handle`);
      handle.userData.isAcrylicWindow = true;
      handle.userData.isAcrylicWindowResizeHandle = true;
      handle.userData.acrylicResizeAxis = axis;
      handle.userData.acrylicResizeDirection = direction;
      handle.renderOrder = 2200;
      handle.castShadow = false;
      handle.frustumCulled = false;
      return handle;
    };
    addResizeHandle('left','length',-1,-state.length*0.5,panelCenterZ);
    addResizeHandle('right','length',1,state.length*0.5,panelCenterZ);
    addResizeHandle('top','height',1,0,panelTop);
    addResizeHandle('bottom','height',-1,0,panelTop-panelHeight);
    const shapeKey=this.isCustomShape ? 'freeform' : String(this.poolParams?.shape||'').toLowerCase();
    if (placement && ['oval','kidney','freeform'].includes(shapeKey)) {
      const arcSegments=this._getAcrylicWindowArcSegments(placement,state.length);
      if (arcSegments.length>1) {
        glass.visible=false;
        const cos=Math.cos(-root.rotation.z), sin=Math.sin(-root.rotation.z);
        arcSegments.forEach((segment,index) => {
          const center=segment.center.clone().addScaledVector(segment.outward,wallThickness*0.5);
          const dx=center.x-root.position.x, dy=center.y-root.position.y;
          const localX=dx*cos-dy*sin, localY=dx*sin+dy*cos;
          const panel=this._addFeatureMesh(root,new THREE.BoxGeometry(segment.span+0.008,wallThickness+0.012,panelHeight),glassMaterial.clone(),{x:localX,y:localY,z:panelCenterZ},null,`acrylic-window-curved-panel-${index}`);
          panel.rotation.z=Math.atan2(segment.tangent.y,segment.tangent.x)-root.rotation.z;
          panel.userData.isAcrylicWindow=true; panel.frustumCulled=false; panel.renderOrder=6;
        });
        root.userData.acrylicArcSegments=arcSegments;
      }
    }
    group.add(root);
    if (placement) this._applyAcrylicWindowWallCut(placement, root, panelCenterZ, panelHeight);
  }

  setAcrylicWindowSize(length, height, { captureUndo = false } = {}) {
    if (captureUndo) this.captureUndoState?.('Resize acrylic window');
    if (!this.acrylicWindowState) this.acrylicWindowState = { length:1.8, height:0.8, placement:null, centerZ:null };
    if (Number.isFinite(Number(length))) {
      this.acrylicWindowState.length = THREE.MathUtils.clamp(Number(length), 0.5, 5.0);
    }
    if (Number.isFinite(Number(height))) {
      this.acrylicWindowState.height = THREE.MathUtils.clamp(Number(height), 0.3, 2.0);
    }
    if (this.poolFeatures.has('acrylic-window')) this.rebuildPoolFeatures();
    this._notifyDesignerStateChanged?.();
  }

  _getAcrylicLengthResizeMax(direction, startLength) {
    const state=this.acrylicWindowState;
    if (!state?.placement || !this.poolGroup) return 5;
    const points=(this.poolGroup.userData?.outerPts||[]).filter((point)=>Number.isFinite(point?.x)&&Number.isFinite(point?.y)).map((point)=>new THREE.Vector2(point.x,point.y));
    if(points.length>3 && points[0].distanceToSquared(points[points.length-1])<1e-10) points.pop();
    if(points.length<2) return 5;
    const center=new THREE.Vector2(Number(state.placement.x)||0,Number(state.placement.y)||0);
    let best=null;
    points.forEach((a,index)=>{
      const b=points[(index+1)%points.length]; const ab=b.clone().sub(a); const len=Math.max(1e-8,ab.length());
      const dir=ab.clone().divideScalar(len); const u=THREE.MathUtils.clamp(center.clone().sub(a).dot(dir),0,len);
      const point=a.clone().addScaledVector(dir,u); const d2=point.distanceToSquared(center);
      if(!best||d2<best.d2) best={a,b,len,u,d2};
    });
    if(!best) return 5;
    const wallThickness=Math.max(0.05,Number(this.poolGroup.userData?.wallThickness)||0.2);
    const margin=Math.min(wallThickness,best.len*0.24);
    const half=Math.max(0.25,Number(startLength)||1.8)*0.5;
    // Current left/right endpoints are centre +/- half. Only the dragged end may
    // move; once it reaches its wall return the resize stops instead of moving
    // the opposite end.
    const positiveAvailable=Math.max(0,best.len-margin-(best.u+half));
    const negativeAvailable=Math.max(0,(best.u-half)-margin);
    return Math.min(5,Math.max(0.5,(Number(startLength)||1.8)+(direction>0?positiveAvailable:negativeAvailable)));
  }

  setupAcrylicWindowDragging() {
    if (this._acrylicWindowDraggingSetup || !this.renderer?.domElement || !this.camera) return;
    this._acrylicWindowDraggingSetup = true;
    const dom = this.renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const candidates = (resizeOnly = false) => {
      const meshes = [];
      this.poolFeatureGroup?.traverse?.((object) => {
        if (!object?.isMesh || !object.userData?.isAcrylicWindow) return;
        if (!resizeOnly || object.userData?.isAcrylicWindowResizeHandle) meshes.push(object);
      });
      return meshes;
    };
    const hitAt = (event, resizeOnly = false) => {
      const rect = dom.getBoundingClientRect();
      mouse.set(((event.clientX-rect.left)/rect.width)*2-1, -((event.clientY-rect.top)/rect.height)*2+1);
      raycaster.setFromCamera(mouse, this.camera);
      const meshes = candidates(resizeOnly);
      return meshes.length ? raycaster.intersectObjects(meshes, false)[0] : null;
    };
    const windowRoot = (object) => {
      let current = object;
      while (current && current !== this.poolFeatureGroup) {
        if (current.userData?.isAcrylicWindow && current.type === 'Group') return current;
        current = current.parent;
      }
      return null;
    };
    dom.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !this.poolFeatureGroup || this.customizeMode) return;
      const hit = hitAt(event, false);
      const root = hit ? windowRoot(hit.object) : null;
      if (!root) return;
      event.preventDefault?.(); event.stopPropagation?.(); event.stopImmediatePropagation?.();
      const resizeHandle = hit.object.userData?.isAcrylicWindowResizeHandle ? hit.object : null;
      this.captureUndoState?.(resizeHandle ? 'Resize acrylic window' : 'Move acrylic window');
      const previousControlsEnabled = this.controls ? this.controls.enabled !== false : null;
      if (this.controls) this.controls.enabled = false;
      if (resizeHandle) {
        const axis = resizeHandle.userData.acrylicResizeAxis;
        const rootQuaternion = root.getWorldQuaternion(new THREE.Quaternion());
        const worldAxis = axis === 'height'
          ? new THREE.Vector3(0,0,1)
          : new THREE.Vector3(1,0,0).applyQuaternion(rootQuaternion).normalize();
        const handleWorld = resizeHandle.getWorldPosition(new THREE.Vector3());
        const screenAxis = this._getHandleScreenAxisMetrics({ userData:{ handleAxisVector:worldAxis } }, handleWorld);
        if (!screenAxis) {
          if (this.controls && previousControlsEnabled !== null) this.controls.enabled = previousControlsEnabled;
          return;
        }
        resizeHandle.material.opacity = 1;
        this.acrylicWindowDrag = {
          mode:'resize', pointerId:event.pointerId, root, handle:resizeHandle, axis,
          direction:Number(resizeHandle.userData.acrylicResizeDirection)||1,
          startClientX:event.clientX, startClientY:event.clientY, screenAxis,
          startLength:Number(this.acrylicWindowState?.length)||1.8,
          maxLength:this._getAcrylicLengthResizeMax(Number(resizeHandle.userData.acrylicResizeDirection)||1,Number(this.acrylicWindowState?.length)||1.8),
          startHeight:Number(this.acrylicWindowState?.height)||0.8,
          startCenterZ:this.acrylicWindowState?.centerZ != null && Number.isFinite(Number(this.acrylicWindowState.centerZ))
            ? Number(this.acrylicWindowState.centerZ)
            : null,
          startPlacement:this.acrylicWindowState?.placement ? { ...this.acrylicWindowState.placement } : null,
          localTangent:new THREE.Vector2(Math.cos(root.rotation.z), Math.sin(root.rotation.z)),
          previousControlsEnabled
        };
        dom.style.cursor = axis === 'height' ? 'ns-resize' : 'ew-resize';
      } else {
        this.acrylicWindowDrag = { mode:'move', pointerId:event.pointerId, root, previousControlsEnabled };
        dom.style.cursor = 'grabbing';
      }
      dom.setPointerCapture?.(event.pointerId);
    }, true);
    dom.addEventListener('pointermove', (event) => {
      const drag = this.acrylicWindowDrag;
      if (!drag) {
        const hovered = hitAt(event, true)?.object || null;
        candidates(true).forEach((handle) => { if (handle.material) handle.material.opacity = handle === hovered ? 1 : 0.45; });
        dom.style.cursor = hovered ? (hovered.userData.acrylicResizeAxis === 'height' ? 'ns-resize' : 'ew-resize') : '';
        return;
      }
      if (event.pointerId !== drag.pointerId) return;
      event.preventDefault?.(); event.stopPropagation?.(); event.stopImmediatePropagation?.();
      if (drag.mode === 'resize') {
        const dx = event.clientX - drag.startClientX;
        const dy = event.clientY - drag.startClientY;
        const pixels = dx * drag.screenAxis.x + dy * drag.screenAxis.y;
        const worldDelta = pixels / drag.screenAxis.pixelsPerWorld;
        if (drag.axis === 'length') {
          const next = Math.round(THREE.MathUtils.clamp(drag.startLength + drag.direction * worldDelta, 0.5, Number(drag.maxLength)||5.0) * 10) / 10;
          if (Math.abs(next - Number(this.acrylicWindowState?.length)) > 1e-4) {
            const delta = next - drag.startLength;
            if (drag.startPlacement) {
              this.acrylicWindowState.placement = {
                ...drag.startPlacement,
                x:drag.startPlacement.x + drag.localTangent.x * drag.direction * delta * 0.5,
                y:drag.startPlacement.y + drag.localTangent.y * drag.direction * delta * 0.5
              };
            }
            this.setAcrylicWindowSize(next, this.acrylicWindowState?.height);
          }
        } else {
          const wallDepth = Math.max(0.6, Number(this.poolParams?.deep) || 1.8);
          const raisedHeight = this.poolParams?.raised ? Math.max(0.3, Number(this.getPoolElevation?.()) || 0.3) : wallDepth;
          const maxHeight = Math.min(wallDepth, raisedHeight);
          const next = Math.round(THREE.MathUtils.clamp(drag.startHeight + drag.direction * worldDelta, 0.3, maxHeight) * 10) / 10;
          if (Math.abs(next - Number(this.acrylicWindowState?.height)) > 1e-4) {
            const initialCenter = Number.isFinite(drag.startCenterZ) ? drag.startCenterZ : -wallDepth * 0.5;
            this.acrylicWindowState.centerZ = THREE.MathUtils.clamp(
              initialCenter + drag.direction * (next - drag.startHeight) * 0.5,
              (this.poolParams?.raised ? Math.max(-wallDepth, -raisedHeight) : -wallDepth) + next * 0.5,
              -next * 0.5
            );
            this.setAcrylicWindowSize(this.acrylicWindowState?.length, next);
          }
        }
        return;
      }
      const worldPoint = this._screenToPlanePoint(event.clientX, event.clientY, this.getPoolElevation());
      if (!worldPoint) return;
      const local = this.poolGroup.worldToLocal(worldPoint.clone());
      const placement = this._placeAcrylicWindowRoot(drag.root, new THREE.Vector2(local.x, local.y));
      if (placement) {
        const wallDepth = Math.max(0.6, Number(this.poolParams?.deep) || 1.8);
        const panelHeight = Math.min(Number(this.acrylicWindowState?.height) || 0.8, wallDepth);
        const raisedHeight = this.poolParams?.raised ? Math.max(0, Number(this.getPoolElevation?.()) || 0) : wallDepth;
        const groundBottom = this.poolParams?.raised ? Math.max(-wallDepth, -raisedHeight) : -wallDepth;
        const panelCenterZ = THREE.MathUtils.clamp(Number(this.acrylicWindowState?.centerZ) || -wallDepth*0.5, groundBottom+panelHeight*0.5, -panelHeight*0.5);
        // Re-cut continuously, so moving the glass never previews a tiled wall
        // behind it before the pointer is released.
        this._applyAcrylicWindowWallCut(placement, drag.root, panelCenterZ, panelHeight);
      }
    }, true);
    const finish = (event) => {
      const drag = this.acrylicWindowDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      try { dom.releasePointerCapture?.(event.pointerId); } catch (_) {}
      if (drag.handle?.material) drag.handle.material.opacity = 0.45;
      this.acrylicWindowDrag = null;
      dom.style.cursor = '';
      if (this.controls && drag.previousControlsEnabled !== null) this.controls.enabled = drag.previousControlsEnabled;
      if (drag.mode === 'move') this.rebuildPoolFeatures();
      this._notifyDesignerStateChanged?.();
    };
    dom.addEventListener('pointerup', finish, true);
    dom.addEventListener('pointercancel', finish, true);
  }

  _restoreInfinityEdgeCoping() {
    const geometryEntries = this._infinityCopingGeometryEntries || [];
    geometryEntries.forEach(({ mesh, geometry }) => {
      if (!mesh || !geometry) return;
      mesh.geometry?.dispose?.();
      mesh.geometry = geometry;
    });
    this._infinityCopingGeometryEntries = [];
    const hidden = this._infinityHiddenCoping || [];
    hidden.forEach((mesh) => { if (mesh) { mesh.visible = true; if(mesh.userData) delete mesh.userData.infinitySuppressed; } });
    this._infinityHiddenCoping = [];
  }

  _restoreInfinityWallVoid() {
    const geometryEntries = this._infinityWallGeometryEntries || [];
    geometryEntries.forEach(({ mesh, geometry }) => {
      if (!mesh || !geometry) return;
      mesh.geometry?.dispose?.();
      mesh.geometry = geometry;
    });
    this._infinityWallGeometryEntries = [];
    const entries = this._infinityWallVoidEntries || [];
    entries.forEach(({ mesh, scaleZ, positionZ, visible }) => {
      if (!mesh) return;
      if (typeof visible === 'boolean') mesh.visible = visible;
      if (Number.isFinite(scaleZ)) mesh.scale.z = scaleZ;
      if (Number.isFinite(positionZ)) mesh.position.z = positionZ;
      mesh.updateMatrixWorld?.(true);
    });
    this._infinityWallVoidEntries = [];
  }

  _applyInfinityWallVoid(side) {
    this._restoreInfinityWallVoid();
    const aliases = {
      front: ['front', 'south'], back: ['back', 'north'],
      left: ['left', 'west'], right: ['right', 'east']
    }[side] || [side];
    const walls = Array.isArray(this.poolGroup?.userData?.wallMeshes)
      ? this.poolGroup.userData.wallMeshes.filter(Boolean)
      : [];
    const matching = walls.filter((mesh) => aliases.includes(String(mesh?.userData?.side || '').toLowerCase()));
    this._infinityWallVoidEntries = [];
    matching.forEach((mesh) => {
      mesh.geometry?.computeBoundingBox?.();
      const box = mesh.geometry?.boundingBox;
      if (!box) return;
      const baseHeight = Math.abs((box.max.z - box.min.z) * mesh.scale.z);
      if (!(baseHeight > 0.11)) return;
      const cut = 0.10;
      this._infinityWallVoidEntries.push({ mesh, scaleZ: mesh.scale.z, positionZ: mesh.position.z });
      mesh.scale.z *= (baseHeight - cut) / baseHeight;
      mesh.position.z -= cut * 0.5;
      mesh.updateMatrixWorld?.(true);
    });
  }

  _hideInfinityEdgeCoping(side, frame, span) {
    this._restoreInfinityEdgeCoping();
    const segments = this.poolGroup?.userData?.copingSegments;
    const candidates = Array.isArray(segments)
      ? segments.filter(Boolean)
      : (segments && typeof segments === 'object' ? Object.values(segments).filter(Boolean) : []);
    if (this.poolGroup?.userData?.copingMesh) candidates.push(this.poolGroup.userData.copingMesh);
    this.poolGroup?.traverse?.((obj) => {
      if (obj?.isMesh && String(obj.name || '').toLowerCase().includes('coping') && !candidates.includes(obj)) {
        candidates.push(obj);
      }
    });
    const sideAliases = {
      front: ['front', 'south'], back: ['back', 'north'],
      left: ['left', 'west'], right: ['right', 'east']
    }[side] || [side];

    // Explicitly hide any directly keyed coping segment first. Rectangle and
    // L-shape builders expose named coping segments and should not rely on a
    // spatial centre test, which can miss long segments at the overflow edge.
    if (segments && typeof segments === 'object' && !Array.isArray(segments)) {
      for (const alias of sideAliases) {
        const direct = segments[alias];
        if (direct && direct.visible !== false) {
          direct.visible = false;
          if (!this._infinityHiddenCoping.includes(direct)) this._infinityHiddenCoping.push(direct);
        }
      }
    }

    candidates.forEach((mesh) => {
      const namedSide = String(mesh?.userData?.side || '').toLowerCase();
      let matches = sideAliases.includes(namedSide);
      if (!matches && mesh?.isObject3D) {
        const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
        const local = this.poolGroup.worldToLocal(center.clone());
        const normalDistance = Math.abs((local.x - frame.center.x) * frame.inward.x + (local.y - frame.center.y) * frame.inward.y);
        const along = Math.abs((local.x - frame.center.x) * frame.tangent.x + (local.y - frame.center.y) * frame.tangent.y);
        matches = normalDistance < 0.45 && along <= span * 0.58;
      }
      if (matches) {
        mesh.visible = false;
        this._infinityHiddenCoping.push(mesh);
      }
    });
  }

  _getSpaStyleSpillMaterial() {
    let material = null;
    this.scene?.traverse?.((obj) => {
      if (!material && obj?.isMesh && obj.userData?.isSpaSpillover && obj.material) {
        material = obj.material.clone();
      }
    });
    return material || createWaterFeatureMaterial({
      transmission:0.40,opacity:0.54,roughness:0.025
    });
  }


  _angleDistance(a, b) {
    return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  }

  _createStripGeometry(innerPts, outerPts, z, thickness = 0, uvScale = 1) {
    const positions = [];
    const uvs = [];
    const n = Math.min(innerPts.length, outerPts.length);
    if (n < 2) return new THREE.BufferGeometry();
    const scale = Math.max(0.05, Number(uvScale) || 1);
    const distances = [0];
    for (let i = 1; i < n; i += 1) {
      const previousMid = innerPts[i - 1].clone().add(outerPts[i - 1]).multiplyScalar(0.5);
      const currentMid = innerPts[i].clone().add(outerPts[i]).multiplyScalar(0.5);
      distances.push(distances[i - 1] + currentMid.distanceTo(previousMid));
    }
    const pushQuad = (a,b,c,d, uvA,uvB,uvC,uvD) => {
      positions.push(a.x,a.y,a.z, b.x,b.y,b.z, c.x,c.y,c.z, c.x,c.y,c.z, b.x,b.y,b.z, d.x,d.y,d.z);
      uvs.push(...uvA,...uvB,...uvC, ...uvC,...uvB,...uvD);
    };
    for (let i = 0; i < n - 1; i += 1) {
      const a = innerPts[i], b = innerPts[i + 1], c = outerPts[i], d = outerPts[i + 1];
      const u0 = distances[i] / scale, u1 = distances[i + 1] / scale;
      const w0 = a.distanceTo(c) / scale, w1 = b.distanceTo(d) / scale;
      const aTop=new THREE.Vector3(a.x,a.y,z), bTop=new THREE.Vector3(b.x,b.y,z);
      const cTop=new THREE.Vector3(c.x,c.y,z), dTop=new THREE.Vector3(d.x,d.y,z);
      pushQuad(aTop,cTop,bTop,dTop, [u0,0],[u0,w0],[u1,0],[u1,w1]);
      if (thickness > 0) {
        const zb = z - thickness;
        const aBottom=new THREE.Vector3(a.x,a.y,zb), bBottom=new THREE.Vector3(b.x,b.y,zb);
        const cBottom=new THREE.Vector3(c.x,c.y,zb), dBottom=new THREE.Vector3(d.x,d.y,zb);
        // Bottom, inner fascia and outer fascia make the coping a closed solid.
        pushQuad(cBottom,aBottom,dBottom,bBottom, [u0,w0],[u0,0],[u1,w1],[u1,0]);
        pushQuad(aTop,bTop,aBottom,bBottom, [u0,thickness/scale],[u1,thickness/scale],[u0,0],[u1,0]);
        pushQuad(dTop,cTop,dBottom,cBottom, [u1,thickness/scale],[u0,thickness/scale],[u1,0],[u0,0]);
      }
    }
    if (thickness > 0) {
      const zb = z - thickness;
      for (const [i, reverse] of [[0, true], [n - 1, false]]) {
        const a=innerPts[i], b=outerPts[i];
        const p0=new THREE.Vector3(a.x,a.y,z), p1=new THREE.Vector3(b.x,b.y,z), p2=new THREE.Vector3(a.x,a.y,zb), p3=new THREE.Vector3(b.x,b.y,zb);
        const width=a.distanceTo(b)/scale, height=thickness/scale;
        if (reverse) pushQuad(p1,p0,p3,p2,[width,height],[0,height],[width,0],[0,0]);
        else pushQuad(p0,p1,p2,p3,[0,height],[width,height],[0,0],[width,0]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  }

  _createVerticalArcGeometry(topPts, bottomZ, topZ) {
    const positions = [], uvs = [];
    for (let i = 0; i < topPts.length - 1; i += 1) {
      const a = topPts[i], b = topPts[i + 1];
      const u0 = i / (topPts.length - 1), u1 = (i + 1) / (topPts.length - 1);
      positions.push(a.x,a.y,topZ, a.x,a.y,bottomZ, b.x,b.y,topZ,
                     b.x,b.y,topZ, a.x,a.y,bottomZ, b.x,b.y,bottomZ);
      uvs.push(u0,1,u0,0,u1,1, u1,1,u0,0,u1,0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  }

  _createOvalWallArcGeometry(innerPts, outerPts, bottomZ, topZ) {
    const positions = [];
    const uvs = [];
    const n = Math.min(innerPts.length, outerPts.length);
    if (n < 2) return new THREE.BufferGeometry();

    const pushQuad = (a, b, c, d, u0, u1) => {
      positions.push(
        a.x,a.y,a.z, c.x,c.y,c.z, b.x,b.y,b.z,
        b.x,b.y,b.z, c.x,c.y,c.z, d.x,d.y,d.z
      );
      uvs.push(u0,0,u0,1,u1,0, u1,0,u0,1,u1,1);
    };

    for (let i = 0; i < n - 1; i += 1) {
      const u0 = i / (n - 1), u1 = (i + 1) / (n - 1);
      const ia = innerPts[i], ib = innerPts[i + 1];
      const oa = outerPts[i], ob = outerPts[i + 1];
      pushQuad(
        new THREE.Vector3(ia.x,ia.y,bottomZ), new THREE.Vector3(ib.x,ib.y,bottomZ),
        new THREE.Vector3(ia.x,ia.y,topZ), new THREE.Vector3(ib.x,ib.y,topZ), u0,u1
      );
      pushQuad(
        new THREE.Vector3(ob.x,ob.y,bottomZ), new THREE.Vector3(oa.x,oa.y,bottomZ),
        new THREE.Vector3(ob.x,ob.y,topZ), new THREE.Vector3(oa.x,oa.y,topZ), u0,u1
      );
      pushQuad(
        new THREE.Vector3(ia.x,ia.y,topZ), new THREE.Vector3(ib.x,ib.y,topZ),
        new THREE.Vector3(oa.x,oa.y,topZ), new THREE.Vector3(ob.x,ob.y,topZ), u0,u1
      );
    }

    const addEnd = (index, reverse = false) => {
      const i = index;
      const inner = innerPts[i], outer = outerPts[i];
      const a = new THREE.Vector3(inner.x,inner.y,bottomZ);
      const b = new THREE.Vector3(outer.x,outer.y,bottomZ);
      const c = new THREE.Vector3(inner.x,inner.y,topZ);
      const d = new THREE.Vector3(outer.x,outer.y,topZ);
      if (reverse) pushQuad(b,a,d,c,0,1); else pushQuad(a,b,c,d,0,1);
    };
    addEnd(0, true);
    addEnd(n - 1, false);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  }


  _arcCumulativeDistances(points) {
    const distances = [0];
    for (let i = 1; i < points.length; i += 1) {
      distances.push(distances[i - 1] + points[i].distanceTo(points[i - 1]));
    }
    return distances;
  }

  _applyMeterUVsToBoxGeometry(geometry, tileSize = this.tileSize || 0.3) {
    const pos = geometry?.attributes?.position;
    const normal = geometry?.attributes?.normal;
    if (!pos || !normal) return geometry;
    const tile = Math.max(0.05, Number(tileSize) || 0.3);
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
      let u, v;
      if (nz >= nx && nz >= ny) { u = x / tile; v = y / tile; }
      else if (ny >= nx) { u = x / tile; v = z / tile; }
      else { u = y / tile; v = z / tile; }
      uvs[i * 2] = u; uvs[i * 2 + 1] = v;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    return geometry;
  }

  _createPlanPrismGeometry(points, bottomZ, topZ, uvScale = this.tileSize || 0.3) {
    if (!Array.isArray(points) || points.length < 3) return new THREE.BufferGeometry();
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i].x, points[i].y);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, topZ - bottomZ),
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1
    });
    geometry.translate(0, 0, bottomZ);
    const pos = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const tile = Math.max(0.05, Number(uvScale) || 0.3);
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
      let u, v;
      if (nz >= nx && nz >= ny) { u = x / tile; v = y / tile; }
      else if (ny >= nx) { u = x / tile; v = z / tile; }
      else { u = y / tile; v = z / tile; }
      uvs[i * 2] = u; uvs[i * 2 + 1] = v;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    return geometry;
  }

  _createIndexedArcStripGeometry(innerPts, outerPts, z, thickness = 0) {
    const n = Math.min(innerPts.length, outerPts.length);
    if (n < 2) return new THREE.BufferGeometry();
    const positions = [], uvs = [], indices = [];
    const tile = Math.max(0.05, Number(this.tileSize) || 0.3);
    for (let i = 0; i < n; i += 1) {
      const a = innerPts[i], b = outerPts[i];
      positions.push(a.x, a.y, z, b.x, b.y, z);
      uvs.push(a.x / tile, a.y / tile, b.x / tile, b.y / tile);
    }
    for (let i = 0; i < n - 1; i += 1) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, b, c, c, b, d);
    }
    if (thickness > 0) {
      const base = positions.length / 3;
      for (let i = 0; i < n; i += 1) {
        const a = innerPts[i], b = outerPts[i];
        positions.push(a.x, a.y, z - thickness, b.x, b.y, z - thickness);
        uvs.push(a.x / tile, a.y / tile, b.x / tile, b.y / tile);
      }
      for (let i = 0; i < n - 1; i += 1) {
        const t0=i*2,t1=t0+1,t2=t0+2,t3=t0+3;
        const b0=base+t0,b1=base+t1,b2=base+t2,b3=base+t3;
        indices.push(b0,b2,b1,b2,b3,b1);       // bottom
        indices.push(t0,b0,t2,t2,b0,b2);       // inner fascia
        indices.push(t3,b3,t1,t1,b3,b1);       // outer fascia
      }
      // Close both radial ends.
      indices.push(1,base+1,0,0,base+1,base);
      const last=(n-1)*2, lastBase=base+last;
      indices.push(last,lastBase,last+1,last+1,lastBase,lastBase+1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  _createIndexedVerticalArcGeometry(points, bottomZ, topZ) {
    const n = points.length;
    if (n < 2) return new THREE.BufferGeometry();
    const positions = [], uvs = [], indices = [];
    const tile = Math.max(0.05, Number(this.tileSize) || 0.3);
    const distance = this._arcCumulativeDistances(points);
    for (let i = 0; i < n; i += 1) {
      const u = distance[i] / tile, p = points[i];
      positions.push(p.x, p.y, topZ, p.x, p.y, bottomZ);
      uvs.push(u, topZ / tile, u, bottomZ / tile);
    }
    for (let i = 0; i < n - 1; i += 1) {
      const a=i*2,b=a+1,c=a+2,d=a+3;
      indices.push(a,b,c,c,b,d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  _createIndexedOvalWallArcGeometry(innerPts, outerPts, bottomZ, topZ) {
    const n = Math.min(innerPts.length, outerPts.length);
    if (n < 2) return new THREE.BufferGeometry();
    const positions = [], uvs = [], indices = [];
    const tile = Math.max(0.05, Number(this.tileSize) || 0.3);
    const innerDistance = this._arcCumulativeDistances(innerPts);
    const outerDistance = this._arcCumulativeDistances(outerPts);

    const addVerticalSurface = (points, distances, reverse = false) => {
      const base = positions.length / 3;
      for (let i = 0; i < n; i += 1) {
        const p = points[i], u = distances[i] / tile;
        positions.push(p.x,p.y,bottomZ,p.x,p.y,topZ);
        uvs.push(u,bottomZ / tile,u,topZ / tile);
      }
      for (let i=0;i<n-1;i+=1) {
        const a=base+i*2,b=a+1,c=a+2,d=a+3;
        if (reverse) indices.push(a,c,b,c,d,b); else indices.push(a,b,c,c,b,d);
      }
    };
    addVerticalSurface(innerPts, innerDistance, false);
    addVerticalSurface(outerPts, outerDistance, true);

    // Wall top uses world-planar UVs, matching pool floors and wall caps.
    const topBase = positions.length / 3;
    for (let i=0;i<n;i+=1) {
      const a=innerPts[i], b=outerPts[i];
      positions.push(a.x,a.y,topZ,b.x,b.y,topZ);
      uvs.push(a.x / tile,a.y / tile,b.x / tile,b.y / tile);
    }
    for (let i=0;i<n-1;i+=1) {
      const a=topBase+i*2,b=a+1,c=a+2,d=a+3;
      indices.push(a,b,c,c,b,d);
    }

    const addCap=(i,reverse)=>{
      const base=positions.length/3;
      const inner=innerPts[i], outer=outerPts[i];
      const width=inner.distanceTo(outer);
      positions.push(
        inner.x,inner.y,bottomZ, outer.x,outer.y,bottomZ,
        inner.x,inner.y,topZ, outer.x,outer.y,topZ
      );
      uvs.push(0,bottomZ/tile,width/tile,bottomZ/tile,0,topZ/tile,width/tile,topZ/tile);
      if(reverse) indices.push(base,base+2,base+1,base+2,base+3,base+1);
      else indices.push(base,base+1,base+2,base+2,base+1,base+3);
    };
    addCap(0,true); addCap(n-1,false);
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    g.setIndex(indices); g.computeVertexNormals(); return g;
  }

  _applyOvalInfinityArcCut(side, length, width) {
    this._restoreInfinityEdgeCoping();
    this._restoreInfinityWallVoid();
    const canonicalSide = ({ east:'right', west:'left', north:'back', south:'front' })[side] || side;
    const centerAngle = canonicalSide === 'right' ? 0
      : canonicalSide === 'back' ? Math.PI * 0.5
      : canonicalSide === 'left' ? Math.PI
      : -Math.PI * 0.5;
    const arcState = this._getOvalInfinityArc(canonicalSide);
    const startAngle = arcState.startAngle;
    const endAngle = arcState.endAngle;
    const sweep = this._positiveAngleSweep(startAngle, endAngle);
    const halfArc = sweep * 0.5;
    const a = Math.max(0.3, length * 0.5), b = Math.max(0.3, width * 0.5);

    // The authored oval wall and coping are each single continuous meshes. Hide
    // both and rebuild them as matching arc segments. This creates a real 90°
    // spillway rather than merely placing water in front of a full-height wall.
    const wall = this.poolGroup?.userData?.wallMeshes?.[0];
    if (wall) {
      this._infinityWallVoidEntries.push({ mesh: wall, visible: wall.visible });
      wall.visible = false;
    }
    const coping = this.poolGroup?.userData?.copingMesh;
    if (coping) {
      coping.visible = false;
      if (!this._infinityHiddenCoping.includes(coping)) this._infinityHiddenCoping.push(coping);
    }
    return { centerAngle, halfArc, startAngle, endAngle, sweep, a, b, coping, wall };
  }

  _createOvalInfinityEdge(group, length, width, side) {
    const arc = this._applyOvalInfinityArcCut(side, length, width);
    const tiled = this._getPoolTileMaterial();

    // Rebuild the oval shell as one full-height 270° section and one matching
    // 90° spillway section whose top is exactly 100 mm lower. Both use the same
    // angular limits as the coping opening, overflow strip, water sheet and tank.
    const wallThickness = 0.20;
    const wallDepth = Math.max(0.6, Number(this.poolParams?.deep) || 1.8);
    const sourceWallMaterial = Array.isArray(arc.wall?.material)
      ? arc.wall.material.find(Boolean)
      : arc.wall?.material;
    const ovalWallMaterial = sourceWallMaterial?.clone?.() || sourceWallMaterial || tiled.clone();
    ovalWallMaterial.side = THREE.DoubleSide;
    ovalWallMaterial.needsUpdate = true;
    const makeArcPoints = (startAngle, sweep, count = 96) => {
      const inner = [], outer = [];
      for (let i = 0; i <= count; i += 1) {
        const t = startAngle + sweep * (i / count);
        const p = new THREE.Vector2(arc.a * Math.cos(t), arc.b * Math.sin(t));
        const normal = new THREE.Vector2(Math.cos(t) / arc.a, Math.sin(t) / arc.b).normalize();
        inner.push(p);
        outer.push(p.clone().addScaledVector(normal, wallThickness));
      }
      return { inner, outer };
    };
    // Ground-fixed tank elevations are needed here because the lower portion of
    // the oval infinity wall intentionally continues 500 mm past the visible
    // spillway at both ends. Above tank-top level those 500 mm end zones retain
    // the normal full-height pool wall; below tank-top level they belong to the
    // infinity wall and terminate at the catch-tank floor.
    const groundZ = this._getGroundTopLocalZ();
    const elevation = this.getPoolElevation();
    const tankWall = 0.20, tankDepth = 0.55, copingWidth = 0.25;
    const tankTop = groundZ - 0.005;
    const tankFloorZ = tankTop - tankDepth;
    const ellipseSpeedAt = (angle) => Math.max(
      1e-6,
      Math.hypot(arc.a * Math.sin(angle), arc.b * Math.cos(angle))
    );

    const spillwayStart = arc.startAngle;
    const spillwayEnd = arc.startAngle + arc.sweep;
    const lowerWallStart = spillwayStart - (0.50 / ellipseSpeedAt(spillwayStart));
    const lowerWallEnd = spillwayEnd + (0.50 / ellipseSpeedAt(spillwayEnd));

    const remainingMainSweep = Math.max(
      0,
      (spillwayStart + Math.PI * 2 - (0.50 / ellipseSpeedAt(spillwayStart))) -
      (spillwayEnd + (0.50 / ellipseSpeedAt(spillwayEnd)))
    );
    if (remainingMainSweep > 1e-6) {
      const remainingMainArc = makeArcPoints(lowerWallEnd, remainingMainSweep, 120);
      const remainingWall = this._addFeatureMesh(
        group,
        this._createIndexedOvalWallArcGeometry(remainingMainArc.inner, remainingMainArc.outer, -wallDepth, 0),
        ovalWallMaterial,
        { x:0, y:0, z:0 }, null, 'infinity-oval-remaining-wall'
      );
      remainingWall.userData.isWall = true;
    }

    // The two 500 mm transition zones remain full-depth pool wall. Their former
    // tank-floor lower limit opened two visible holes in the deeper oval liner.
    // Keeping each transition as one wall also removes the horizontal split seam.
    const lowerExtensionDefs = [
      [lowerWallStart, spillwayStart, 'a'],
      [spillwayEnd, lowerWallEnd, 'b']
    ];
    for (const [a0, a1, suffix] of lowerExtensionDefs) {
      const sweep = a1 - a0;
      if (!(sweep > 1e-7)) continue;
      const extArc = makeArcPoints(a0, sweep, 12);
      const transitionWall = this._addFeatureMesh(
        group,
        this._createIndexedOvalWallArcGeometry(extArc.inner, extArc.outer, -wallDepth, 0),
        ovalWallMaterial.clone?.() || ovalWallMaterial,
        { x:0, y:0, z:0 }, null, `infinity-oval-end-transition-wall-${suffix}`
      );
      transitionWall.userData.isWall = true;
      transitionWall.userData.forceVerticalUV = true;
    }

    const spillwayWallArc = makeArcPoints(
      spillwayStart,
      arc.sweep,
      48
    );
    const loweredWall = this._addFeatureMesh(
      group,
      this._createIndexedOvalWallArcGeometry(spillwayWallArc.inner, spillwayWallArc.outer, -wallDepth, -0.10),
      ovalWallMaterial.clone?.() || ovalWallMaterial,
      { x:0, y:0, z:0 }, null, 'infinity-oval-lowered-wall'
    );
    loweredWall.userData.isWall = true;
    loweredWall.userData.isInfinitySpillwayWall = true;
    loweredWall.userData.isInfinityCatchSurface = true;

    // Rebuild the oval coping with the active infinity quadrant omitted.
    // Coping dimensions match the oval builder: 200 mm wall + 50 mm inner
    // overhang = 250 mm total width, with a 50 mm coping thickness.
    const copingThickness = 0.05;
    const copingInnerOverhang = 0.05;
    const copingSegments = 144;
    const copingInnerPts = [];
    const copingOuterPts = [];
    // Let the normal pool coping project 50 mm longitudinally into the
    // infinity opening at both ends. Convert the requested linear overhang to
    // a local ellipse-angle offset so the physical extension stays 50 mm on
    // both the tighter and flatter parts of the oval.
    const copingEndAngleOverhang = 0.05 / ellipseSpeedAt(arc.endAngle);
    const copingStartAngleOverhang = 0.05 / ellipseSpeedAt(arc.startAngle);
    const copingStart = arc.endAngle - copingEndAngleOverhang;
    const copingSweep = Math.PI * 2 - arc.sweep + copingEndAngleOverhang + copingStartAngleOverhang;
    for (let i = 0; i <= copingSegments; i += 1) {
      const t = copingStart + copingSweep * (i / copingSegments);
      const boundary = new THREE.Vector2(arc.a * Math.cos(t), arc.b * Math.sin(t));
      const normal = new THREE.Vector2(Math.cos(t) / arc.a, Math.sin(t) / arc.b).normalize();
      copingInnerPts.push(boundary.clone().addScaledVector(normal, -copingInnerOverhang));
      copingOuterPts.push(boundary.clone().addScaledVector(normal, wallThickness));
    }
    const sourceCoping = arc.coping;
    const sourceMaterial = Array.isArray(sourceCoping?.material)
      ? sourceCoping.material.find(Boolean)
      : sourceCoping?.material;
    const ovalCopingMaterial = sourceMaterial?.clone?.() || sourceMaterial || tiled.clone();
    ovalCopingMaterial.side = THREE.DoubleSide;
    ovalCopingMaterial.needsUpdate = true;
    const sourceTopZ = Number(sourceCoping?.position?.z || 0) + copingThickness;
    const remainingCoping = this._addFeatureMesh(
      group,
      this._createStripGeometry(copingInnerPts, copingOuterPts, sourceTopZ, copingThickness),
      ovalCopingMaterial,
      { x: 0, y: 0, z: 0 },
      null,
      'infinity-oval-remaining-coping'
    );
    remainingCoping.userData.isCoping = true;
    remainingCoping.renderOrder = Number(sourceCoping?.renderOrder || 3);
    const poolWaterMesh = this.poolGroup?.userData?.waterMesh;
    let poolWaterZ = -0.1;
    if (poolWaterMesh?.geometry) {
      poolWaterMesh.geometry.computeBoundingBox?.();
      poolWaterZ = Number(poolWaterMesh.position?.z || 0) + Number(poolWaterMesh.geometry.boundingBox?.max?.z || 0);
    }
    // Position the curved outer tank wall exactly 600 mm beyond the outside
    // face of the pool wall. Offsets are measured from the oval pool boundary,
    // so adding wallThickness first moves to the pool wall's outside face.
    const tankClearWidth = 0.60;
    const tankOuterOffset = wallThickness + tankClearWidth;
    const tankOverallWidth = tankClearWidth;
    const segments = 48;
    const spillSheetClearance = 0.012;
    const spillAngles = Array.from(
      { length: segments + 1 },
      (_, i) => arc.startAngle + (arc.sweep * i / segments)
    );
    const innerWallPts=[], outerWallPts=[];
    for (const t of spillAngles) {
      const p = new THREE.Vector2(arc.a*Math.cos(t), arc.b*Math.sin(t));
      const n = new THREE.Vector2(Math.cos(t)/arc.a, Math.sin(t)/arc.b).normalize();
      innerWallPts.push(p.clone());
      outerWallPts.push(p.clone().addScaledVector(n, wallThickness));
    }
    const sheetTopPts = spillAngles.map((t) => {
      const p = new THREE.Vector2(arc.a*Math.cos(t), arc.b*Math.sin(t));
      const n = new THREE.Vector2(Math.cos(t)/arc.a, Math.sin(t)/arc.b).normalize();
      return p.addScaledVector(n, wallThickness + spillSheetClearance);
    });

    // Use the same draggable angular endpoints for the catch tank and the
    // spillway. This single source of truth keeps every side wall, coping end,
    // water surface and ground void aligned while either handle is moved.
    // Make the oval catch tank 300 mm wider than the spillway at each end.
    // The spillway/handles stay at their existing angles; only the tank floor,
    // water, curved outer wall and radial end walls extend beyond them.
    const tankStartExtensionAngle = 0.30 / ellipseSpeedAt(spillwayStart);
    const tankEndExtensionAngle = 0.30 / ellipseSpeedAt(spillwayEnd);
    const tankStart = spillwayStart - tankStartExtensionAngle;
    const tankEnd = spillwayEnd + tankEndExtensionAngle;
    const tankSegments = 72;
    const tankAngles = Array.from(
      { length: tankSegments + 1 },
      (_, i) => tankStart + ((tankEnd - tankStart) * i / tankSegments)
    );
    // Insert the exact spill-sheet samples into the tank path. The catch-water
    // inner edge then shares vertices with the falling sheet instead of merely
    // approximating the same ellipse at a different segment density.
    tankAngles.push(...spillAngles);
    tankAngles.sort((a,b) => a-b);
    const uniqueTankAngles = tankAngles.filter((angle,index,list) => index===0 || Math.abs(angle-list[index-1])>1e-9);
    const tankInnerPts=[], tankOuterPts=[];
    for (const t of uniqueTankAngles) {
      const p = new THREE.Vector2(arc.a*Math.cos(t), arc.b*Math.sin(t));
      const n = new THREE.Vector2(Math.cos(t)/arc.a, Math.sin(t)/arc.b).normalize();
      tankInnerPts.push(p.clone().addScaledVector(n, wallThickness));
      tankOuterPts.push(p.clone().addScaledVector(n, tankOuterOffset));
    }

    const overflow = createPoolWater(this._createIndexedArcStripGeometry(innerWallPts, sheetTopPts, 0));
    overflow.name='infinity-horizontal-water'; overflow.position.z=poolWaterZ; overflow.userData.isInfinityWater=true; overflow.frustumCulled=false; group.add(overflow);

    const floorMaterial = tiled.clone(); floorMaterial.side = THREE.DoubleSide; floorMaterial.needsUpdate = true;
    const floor = this._addFeatureMesh(group, this._createIndexedArcStripGeometry(tankInnerPts,tankOuterPts,tankFloorZ,0.10), floorMaterial, {x:0,y:0,z:0}, null, 'infinity-catch-floor');
    floor.userData.isFloor=true; floor.userData.isInfinityTankGroundFixed=true; floor.userData.infinityTankBaseZ=elevation;

    // Build the curved outer tank wall as a complete 200 mm-thick wall, not a
    // single one-sided surface. `tankOuterPts` is the inner/water-facing face;
    // the second arc is the outside face. This matches the construction and
    // visibility of the radial side walls from every camera angle.
    const tankOuterFacePts = tankOuterPts.map((p, i) => {
      const q = tankInnerPts[i];
      const outward = p.clone().sub(q).normalize();
      return p.clone().addScaledVector(outward, tankWall);
    });
    const outerWallMaterial = tiled.clone();
    outerWallMaterial.side = THREE.DoubleSide;
    outerWallMaterial.needsUpdate = true;
    const outerWall = this._addFeatureMesh(
      group,
      this._createIndexedOvalWallArcGeometry(tankOuterPts, tankOuterFacePts, tankFloorZ, tankTop),
      outerWallMaterial,
      {x:0,y:0,z:0},
      null,
      'infinity-catch-wall-outer'
    );
    outerWall.userData.isWall=true;
    outerWall.userData.forceVerticalUV=true;
    outerWall.userData.isInfinityCatchSurface=true;
    outerWall.userData.isInfinityTankGroundFixed=true;
    outerWall.userData.infinityTankBaseZ=elevation;

    // Fill the tank water to all enclosing surfaces. Reuse the exact tank
    // boundary vertices so the water meets the pool-side wall, curved outer
    // wall and both radial end walls without visible radial or end gaps.
    const waterInner = uniqueTankAngles.map((t) => {
      const p = new THREE.Vector2(arc.a*Math.cos(t), arc.b*Math.sin(t));
      const n = new THREE.Vector2(Math.cos(t)/arc.a, Math.sin(t)/arc.b).normalize();
      return p.addScaledVector(n, wallThickness + spillSheetClearance);
    });
    const waterOuter = tankOuterPts.map((point) => point.clone());
    const catchWater = createPoolWater(this._createIndexedArcStripGeometry(waterInner,waterOuter,0));
    catchWater.name='infinity-catch-water'; catchWater.position.z=tankTop-0.105; catchWater.userData.isInfinityWater=true; catchWater.userData.isInfinityTankGroundFixed=true; catchWater.userData.infinityTankBaseZ=catchWater.position.z+elevation; catchWater.frustumCulled=false; group.add(catchWater);

    let copingMaterial=tiled.clone();
    const copingSource=this.poolGroup?.userData?.copingMesh?.material;
    if (copingSource) copingMaterial=(Array.isArray(copingSource)?copingSource[0]:copingSource).clone?.() || (Array.isArray(copingSource)?copingSource[0]:copingSource);
    // Build the curved outer-tank coping and both radial side-wall copings as
    // ONE continuous U-shaped plan prism. The former implementation used
    // separate curved/connector/side meshes, which inevitably left a lighting
    // and UV seam at their shared edge even when the coordinates matched.
    // A single mesh removes that internal edge completely: no overlap, no gap,
    // no duplicated normals, and therefore no visible hard line.
    const copingOverhang = Math.max(0, (copingWidth - tankWall) * 0.5);

    // The oval tank now provides the complete radial width itself. There are
    // no raised-pool wall extensions over the tank ends; both radial end walls
    // remain fixed with the catch tank from the pool wall to the curved outer
    // wall.
    const spillwayEndPairs = [
      [tankInnerPts[0], tankOuterFacePts[0], tankStart, -1],
      [tankInnerPts[tankInnerPts.length - 1], tankOuterFacePts[tankOuterFacePts.length - 1], tankEnd, 1]
    ];
    const sideCopingEnds = [];
    spillwayEndPairs.forEach((entry, index) => {
      const [innerPoint, outerPoint, angleAtEnd, directionSign] = entry;
      const tangentDir = new THREE.Vector2(
        -arc.a * Math.sin(angleAtEnd),
        arc.b * Math.cos(angleAtEnd)
      ).normalize().multiplyScalar(directionSign);
      const tangent = tangentDir.clone().multiplyScalar(tankWall);

      // Exact junction polygon: the first radial edge is the tank/water end;
      // the translated radial edge lies outside the tank.
      const wallPlan = [
        innerPoint.clone(),
        outerPoint.clone(),
        outerPoint.clone().add(tangent),
        innerPoint.clone().add(tangent)
      ];
      const sideWallMaterial = tiled.clone();
      sideWallMaterial.side = THREE.DoubleSide;
      sideWallMaterial.needsUpdate = true;
      const sideWall = this._addFeatureMesh(
        group,
        this._createPlanPrismGeometry(wallPlan, tankFloorZ, tankTop),
        sideWallMaterial,
        { x: 0, y: 0, z: 0 },
        null,
        `infinity-catch-side-wall-${index ? 'b' : 'a'}`
      );
      sideWall.userData.isWall = true;
      sideWall.userData.forceVerticalUV = true;
      sideWall.userData.isInfinityCatchSurface = true;
      sideWall.userData.isInfinityTankGroundFixed = true;
      sideWall.userData.infinityTankBaseZ = elevation;

      const radialDir = outerPoint.clone().sub(innerPoint).normalize();
      const innerBase = innerPoint.clone().addScaledVector(radialDir, -copingOverhang);
      const innerFar = innerBase.clone().addScaledVector(tangentDir, tankWall + copingOverhang);
      const outerSeam = outerPoint.clone().addScaledVector(radialDir, copingOverhang);
      const outerFar = outerSeam.clone().addScaledVector(tangentDir, tankWall + copingOverhang);
      sideCopingEnds.push({ innerBase, innerFar, outerSeam, outerFar });
    });

    const copingArcOuter = [];
    const copingArcInner = [];
    const unifiedCopingSegments = Math.max(72, tankSegments);
    for (let i = 0; i <= unifiedCopingSegments; i += 1) {
      const t = tankStart + ((tankEnd - tankStart) * i / unifiedCopingSegments);
      const p = new THREE.Vector2(arc.a * Math.cos(t), arc.b * Math.sin(t));
      const n = new THREE.Vector2(Math.cos(t) / arc.a, Math.sin(t) / arc.b).normalize();
      // Outer tank wall: water-facing face at tankOuterOffset, outside face
      // another 200 mm out. Centre the 250 mm coping over that wall.
      copingArcInner.push(p.clone().addScaledVector(n, tankOuterOffset - copingOverhang));
      copingArcOuter.push(p.clone().addScaledVector(n, tankOuterOffset + tankWall + copingOverhang));
    }

    const endA = sideCopingEnds[0];
    const endB = sideCopingEnds[1];
    if (endA && endB) {
      const unifiedCopingPlan = [
        endA.innerBase.clone(),
        endA.innerFar.clone(),
        endA.outerFar.clone(),
        ...copingArcOuter.map((point) => point.clone()),
        endB.outerFar.clone(),
        endB.innerFar.clone(),
        endB.innerBase.clone(),
        ...copingArcInner.slice().reverse().map((point) => point.clone())
      ];
      const unifiedCopingMaterial = copingMaterial.clone?.() || copingMaterial;
      unifiedCopingMaterial.side = THREE.DoubleSide;
      unifiedCopingMaterial.needsUpdate = true;
      const unifiedCoping = this._addFeatureMesh(
        group,
        this._createPlanPrismGeometry(
          unifiedCopingPlan,
          tankTop,
          tankTop + copingThickness
        ),
        unifiedCopingMaterial,
        { x: 0, y: 0, z: 0 },
        null,
        'infinity-catch-coping-unified'
      );
      unifiedCoping.userData.isCoping = true;
      unifiedCoping.userData.isInfinityTankGroundFixed = true;
      unifiedCoping.userData.infinityTankBaseZ = elevation;
    }

    // A single indexed vertical curtain shares vertices along the whole arc,
    // eliminating the segmented panels and ensuring a true vertical drop.
    // Keep the water sheet physically separated from the tiled outer face of
    // the lowered infinity wall. It used to sit exactly on that wall plane,
    // which caused depth-buffer z-fighting/flicker as the camera moved.
    const catchWaterSurfaceZ=catchWater.position.z;
    const bottomFixed=catchWaterSurfaceZ+elevation, bottomLocal=bottomFixed-elevation;
    const sg=this._createIndexedVerticalArcGeometry(sheetTopPts,bottomLocal,poolWaterZ);
    const sheet=createPoolWater(sg); sheet.name='infinity-water-sheet'; sheet.userData.isInfinitySpillover=true; sheet.userData.infinitySheetBottomFixedZ=bottomFixed;
    sheet.userData.infinitySheetBottomVertexIndices=Array.from({length:sheetTopPts.length},(_,i)=>i*2+1); sheet.frustumCulled=false; group.add(sheet);

    const ground=this.ground||this.scene?.userData?.ground;
    if(ground){
      const tankGroundInnerPts=uniqueTankAngles.map((t)=>{
        const p=new THREE.Vector2(arc.a*Math.cos(t),arc.b*Math.sin(t));
        const n=new THREE.Vector2(Math.cos(t)/arc.a,Math.sin(t)/arc.b).normalize();
        return p.addScaledVector(n,wallThickness+0.025);
      });
      const points=[...tankGroundInnerPts,...tankOuterFacePts.slice().reverse()];
      const existing=Array.isArray(ground.userData.extraGroundVoids)?ground.userData.extraGroundVoids.filter(e=>e?.name!=='infinity-catch-tank'):[];
      ground.userData.extraGroundVoids=[...existing,{name:'infinity-catch-tank',points}];
    }
    if(!Array.isArray(this.poolGroup?.userData?.animatables)) this.poolGroup.userData.animatables=[];
    this.poolGroup.userData.animatables.push(overflow,catchWater,sheet);
  }

  _createKidneyInfinityEdge(group, length, width, side) {
    this._restoreInfinityEdgeCoping?.();
    this._restoreInfinityWallVoid?.();

    const sourceWall = this.poolGroup?.userData?.wallMeshes?.[0] || null;
    const sourceCoping = this.poolGroup?.userData?.copingMesh || null;
    if (sourceWall) {
      this._infinityWallVoidEntries ||= [];
      this._infinityWallVoidEntries.push({ mesh: sourceWall, visible: sourceWall.visible });
      sourceWall.visible = false;
    }
    if (sourceCoping) {
      this._infinityHiddenCoping ||= [];
      sourceCoping.visible = false;
      if (!this._infinityHiddenCoping.includes(sourceCoping)) this._infinityHiddenCoping.push(sourceCoping);
    }

    const wallThickness = 0.20;
    const wallDepth = Math.max(0.6, Number(this.poolParams?.deep) || 1.8);
    const loweredTop = -0.10;
    const spillSheetClearance = 0.012;
    const arcState = this._getOvalInfinityArc(side);
    const spillSweep = this._positiveAngleSweep(arcState.startAngle, arcState.endAngle);
    const spillStart = arcState.startAngle;
    const spillEnd = spillStart + spillSweep;
    const sampleAngles = (start, sweep, count) => Array.from(
      { length: count + 1 },
      (_, index) => start + sweep * index / count
    );
    const samplesFromAngles = (angles) => angles.map((angle) => {
      const sample = this._kidneyBoundarySampleAtAngle(angle);
      return sample ? { ...sample, angle } : null;
    }).filter(Boolean);
    const spillAngles = sampleAngles(spillStart, spillSweep, 64);
    const spillSamples = samplesFromAngles(spillAngles);
    if (spillSamples.length < 2) return;

    const remainingSweep = Math.max(0, Math.PI * 2 - spillSweep);
    const remainingSamples = samplesFromAngles(sampleAngles(spillEnd, remainingSweep, 144));
    const offsetSamples = (samples, distance) => samples.map(({ point, normal }) =>
      point.clone().addScaledVector(normal, distance)
    );
    const spillInner = offsetSamples(spillSamples, 0);
    const spillOuter = offsetSamples(spillSamples, wallThickness);
    const sheetTopPts = offsetSamples(spillSamples, wallThickness + spillSheetClearance);

    const tiled = this._getPoolTileMaterial();
    tiled.side = THREE.DoubleSide;
    tiled.needsUpdate = true;
    const sourceCopingMaterial = Array.isArray(sourceCoping?.material)
      ? sourceCoping.material.find(Boolean)
      : sourceCoping?.material;
    const copingMaterial = sourceCopingMaterial?.clone?.() || sourceCopingMaterial || tiled.clone();
    copingMaterial.side = THREE.DoubleSide;
    copingMaterial.needsUpdate = true;

    if (remainingSamples.length >= 2) {
      const remainingInner = offsetSamples(remainingSamples, 0);
      const remainingOuter = offsetSamples(remainingSamples, wallThickness);
      const remainingWall = this._addFeatureMesh(
        group,
        this._createIndexedOvalWallArcGeometry(remainingInner, remainingOuter, -wallDepth, 0),
        tiled.clone(),
        { x: 0, y: 0, z: 0 }, null, 'infinity-kidney-remaining-wall'
      );
      remainingWall.userData.isWall = true;
      remainingWall.userData.forceVerticalUV = true;

      const copingInner = offsetSamples(remainingSamples, -0.05);
      const copingOuter = offsetSamples(remainingSamples, wallThickness);
      const copingTop = Number(sourceCoping?.position?.z || 0) + 0.05;
      const remainingCoping = this._addFeatureMesh(
        group,
        this._createStripGeometry(copingInner, copingOuter, copingTop, 0.05, 1),
        copingMaterial.clone?.() || copingMaterial,
        { x: 0, y: 0, z: 0 }, null, 'infinity-kidney-remaining-coping'
      );
      remainingCoping.userData.isCoping = true;
      remainingCoping.renderOrder = Number(sourceCoping?.renderOrder || 3);
    }

    // The spillway remains a complete pool wall on its interior face. Lowering
    // only its top creates the infinity opening without deleting the deeper
    // tiled wall below the catch-tank floor.
    const loweredWall = this._addFeatureMesh(
      group,
      this._createIndexedOvalWallArcGeometry(spillInner, spillOuter, -wallDepth, loweredTop),
      tiled.clone(),
      { x: 0, y: 0, z: 0 }, null, 'infinity-kidney-lowered-wall'
    );
    loweredWall.userData.isWall = true;
    loweredWall.userData.forceVerticalUV = true;
    loweredWall.userData.isInfinitySpillwayWall = true;
    loweredWall.userData.isInfinityCatchSurface = true;

    const poolWaterMesh = this.poolGroup?.userData?.waterMesh || null;
    let poolWaterZ = -0.10;
    if (poolWaterMesh?.geometry) {
      poolWaterMesh.geometry.computeBoundingBox?.();
      poolWaterZ = Number(poolWaterMesh.position?.z || 0) + Number(poolWaterMesh.geometry.boundingBox?.max?.z || 0);
    }
    const overflow = createPoolWater(this._createIndexedArcStripGeometry(spillInner, sheetTopPts, 0));
    overflow.name = 'infinity-horizontal-water';
    overflow.position.z = poolWaterZ;
    overflow.userData.isInfinityWater = true;
    overflow.frustumCulled = false;
    group.add(overflow);

    const groundZ = this._getGroundTopLocalZ();
    const elevation = this.getPoolElevation();
    const tankWall = 0.20;
    const tankDepth = 0.55;
    const tankTop = groundZ - 0.005;
    const tankFloorZ = tankTop - tankDepth;
    const tankOuterOffset = wallThickness + 0.60;
    const startRadius = Math.max(0.5, spillSamples[0].point.length());
    const endRadius = Math.max(0.5, spillSamples[spillSamples.length - 1].point.length());
    const tankStart = spillStart - 0.30 / startRadius;
    const tankEnd = spillEnd + 0.30 / endRadius;
    const tankBaseAngles = sampleAngles(tankStart, tankEnd - tankStart, 96);
    tankBaseAngles.push(...spillAngles);
    tankBaseAngles.sort((a, b) => a - b);
    const tankAngles = tankBaseAngles.filter((angle, index, list) =>
      index === 0 || Math.abs(angle - list[index - 1]) > 1e-9
    );
    const tankSamples = samplesFromAngles(tankAngles);
    const tankPoolEdge = offsetSamples(tankSamples, wallThickness);
    const tankWaterInner = offsetSamples(tankSamples, wallThickness + spillSheetClearance);
    const tankOuterInner = offsetSamples(tankSamples, tankOuterOffset);
    const tankOuterFace = offsetSamples(tankSamples, tankOuterOffset + tankWall);

    const floorMaterial = tiled.clone();
    floorMaterial.side = THREE.DoubleSide;
    const floor = this._addFeatureMesh(
      group,
      this._createIndexedArcStripGeometry(tankPoolEdge, tankOuterInner, tankFloorZ, 0.10),
      floorMaterial,
      { x: 0, y: 0, z: 0 }, null, 'infinity-catch-floor'
    );
    floor.userData.isFloor = true;
    floor.userData.isInfinityCatchSurface = true;
    floor.userData.isInfinityTankGroundFixed = true;
    floor.userData.infinityTankBaseZ = elevation;

    const outerWall = this._addFeatureMesh(
      group,
      this._createIndexedOvalWallArcGeometry(tankOuterInner, tankOuterFace, tankFloorZ, tankTop),
      tiled.clone(),
      { x: 0, y: 0, z: 0 }, null, 'infinity-catch-wall-outer'
    );
    outerWall.userData.isWall = true;
    outerWall.userData.forceVerticalUV = true;
    outerWall.userData.isInfinityCatchSurface = true;
    outerWall.userData.isInfinityTankGroundFixed = true;
    outerWall.userData.infinityTankBaseZ = elevation;

    const tankSidePlans = [];
    for (const sample of [tankSamples[0], tankSamples[tankSamples.length - 1]]) {
      const inner = sample.point.clone().addScaledVector(sample.normal, wallThickness);
      const outer = sample.point.clone().addScaledVector(sample.normal, tankOuterOffset + tankWall);
      const half = sample.tangent.clone().multiplyScalar(tankWall * 0.5);
      tankSidePlans.push([
        inner.clone().sub(half), outer.clone().sub(half),
        outer.clone().add(half), inner.clone().add(half)
      ]);
    }
    tankSidePlans.forEach((plan, index) => {
      const sideWall = this._addFeatureMesh(
        group,
        this._createPlanPrismGeometry(plan, tankFloorZ, tankTop),
        tiled.clone(),
        { x: 0, y: 0, z: 0 }, null, `infinity-catch-side-wall-${index ? 'b' : 'a'}`
      );
      sideWall.userData.isWall = true;
      sideWall.userData.forceVerticalUV = true;
      sideWall.userData.isInfinityCatchSurface = true;
      sideWall.userData.isInfinityTankGroundFixed = true;
      sideWall.userData.infinityTankBaseZ = elevation;

      const sideCoping = this._addFeatureMesh(
        group,
        this._createPlanPrismGeometry(plan, tankTop, tankTop + 0.05, 1),
        copingMaterial.clone?.() || copingMaterial,
        { x: 0, y: 0, z: 0 }, null, `infinity-catch-side-coping-${index ? 'b' : 'a'}`
      );
      sideCoping.userData.isCoping = true;
      sideCoping.userData.isInfinityTankGroundFixed = true;
      sideCoping.userData.infinityTankBaseZ = elevation;
    });

    const outerCopingInner = offsetSamples(tankSamples, tankOuterOffset - 0.05);
    const outerCoping = this._addFeatureMesh(
      group,
      this._createStripGeometry(outerCopingInner, tankOuterFace, tankTop + 0.05, 0.05, 1),
      copingMaterial.clone?.() || copingMaterial,
      { x: 0, y: 0, z: 0 }, null, 'infinity-catch-coping-outer'
    );
    outerCoping.userData.isCoping = true;
    outerCoping.userData.isInfinityTankGroundFixed = true;
    outerCoping.userData.infinityTankBaseZ = elevation;

    const catchWaterSurfaceZ = tankTop - 0.105;
    const catchWater = createPoolWater(this._createIndexedArcStripGeometry(tankWaterInner, tankOuterInner, 0));
    catchWater.name = 'infinity-catch-water';
    catchWater.position.z = catchWaterSurfaceZ;
    catchWater.userData.isInfinityWater = true;
    catchWater.userData.isInfinityCatchWater = true;
    catchWater.userData.isInfinityTankGroundFixed = true;
    catchWater.userData.infinityTankBaseZ = catchWaterSurfaceZ + elevation;
    catchWater.frustumCulled = false;
    group.add(catchWater);

    const sheetBottomFixedZ = catchWaterSurfaceZ + elevation;
    const sheetBottomLocalZ = sheetBottomFixedZ - elevation;
    const sheet = createPoolWater(this._createIndexedVerticalArcGeometry(sheetTopPts, sheetBottomLocalZ, poolWaterZ));
    sheet.name = 'infinity-water-sheet';
    sheet.userData.isInfinitySpillover = true;
    sheet.userData.infinitySheetBottomFixedZ = sheetBottomFixedZ;
    sheet.userData.infinitySheetBottomVertexIndices = Array.from({ length: sheetTopPts.length }, (_, index) => index * 2 + 1);
    sheet.frustumCulled = false;
    group.add(sheet);

    const ground = this.ground || this.scene?.userData?.ground;
    if (ground) {
      const tankGroundInner = offsetSamples(tankSamples, wallThickness + 0.025);
      const points = [...tankGroundInner, ...tankOuterFace.slice().reverse()];
      const existing = Array.isArray(ground.userData.extraGroundVoids)
        ? ground.userData.extraGroundVoids.filter((entry) => entry?.name !== 'infinity-catch-tank')
        : [];
      ground.userData.extraGroundVoids = [...existing, { name: 'infinity-catch-tank', points }];
    }

    if (!Array.isArray(this.poolGroup?.userData?.animatables)) this.poolGroup.userData.animatables = [];
    this.poolGroup.userData.animatables.push(overflow, catchWater, sheet);
  }

  _createInfinityEdge(group, length, width) {
    if (!this.poolParams?.raised) return;

    const entry = this._getEntryStepInfo(length, width);
    const side = this._oppositeSide(entry.side);
    if (this.poolParams?.shape === 'oval') {
      this._createOvalInfinityEdge(group, length, width, side);
      return;
    }
    if (String(this.poolParams?.shape || '').toLowerCase() === 'kidney') {
      this._createKidneyInfinityEdge(group, length, width, side);
      return;
    }
    const infinityShape=String(this.poolParams?.shape||'').toLowerCase();
    if (this.poolParams?.shape === 'L' || infinityShape==='rectangular' || infinityShape==='rectangle' || infinityShape==='rect') {
      // Rectangle deliberately shares the complete L-shape perimeter infinity
      // builder so handles, corner traversal, snapping, returns, coping and
      // tank geometry all use one implementation.
      this._createLShapeInfinityEdge(group);
      return;
    }
    let frame = this._sideFrame(side, length, width, 0);
    let wallSpan = Math.max(0.6, frame.span);
    const isFreeformInfinity = this.poolParams?.shape === 'freeform';
    let freeformInfinitySourceEdge = -1;
    let freeformInfinityWallSource = null;

    if (isFreeformInfinity && this.editablePolygon?.vertexCount?.() > 2) {
      const baseFrame = frame;
      const desiredTangent = baseFrame.tangent.clone().normalize();
      const desiredOutward = baseFrame.inward.clone().multiplyScalar(-1).normalize();
      const vertices = [];
      for (let i = 0; i < this.editablePolygon.vertexCount(); i++) {
        const v = this.editablePolygon.getVertex(i);
        if (v) vertices.push(v.clone());
      }
      const centroid = vertices.length
        ? vertices.reduce((acc, v) => acc.add(v), new THREE.Vector2()).multiplyScalar(1 / vertices.length)
        : new THREE.Vector2();
      let best = null;
      for (let i = 0; i < this.editablePolygon.vertexCount(); i++) {
        const a = this.editablePolygon.getVertex(i)?.clone();
        const b = this.editablePolygon.getVertex(this.editablePolygon.nextIndex(i))?.clone();
        if (!a || !b) continue;
        const edge = b.clone().sub(a);
        const len = edge.length();
        if (len < 0.25) continue;
        const tangent = edge.clone().normalize();
        const midpoint = a.clone().add(b).multiplyScalar(0.5);
        const parallel = Math.abs(tangent.dot(desiredTangent));
        const outwardScore = midpoint.clone().sub(centroid).dot(desiredOutward);
        const score = parallel * 10 + outwardScore + Math.min(len, 10) * 0.05;
        if (!best || score > best.score) best = { i, tangent, midpoint, len, score };
      }
      if (best) {
        let inward = new THREE.Vector2(-best.tangent.y, best.tangent.x).normalize();
        if (centroid.clone().sub(best.midpoint).dot(inward) < 0) inward.multiplyScalar(-1);
        frame = { ...baseFrame, center: best.midpoint.clone(), tangent: best.tangent.clone(), inward, span: best.len };
        wallSpan = Math.max(0.6, best.len);
        freeformInfinitySourceEdge = best.i;
      }
    }

    // Rectangle/freeform use the L-shape interaction model: two pull handles
    // select the live infinity opening while all tank geometry follows those ends.
    // Keep the authored full edge separately so normal wall/coping can remain on
    // either side of a shortened infinity opening.
    let straightInfinityFullFrame=null;
    let straightInfinityRange=null;
    let straightInfinityNonSelected=[];
    const isStraightInfinity=this._straightInfinityShapeSupported()&&!isFreeformInfinity
      ? true : isFreeformInfinity;
    if(isStraightInfinity){
      const fullSpan=Math.max(0.6,wallSpan);
      const fullCenter=new THREE.Vector2(frame.center.x,frame.center.y);
      const fullTangent=new THREE.Vector2(frame.tangent.x,frame.tangent.y).normalize();
      const fullInward=new THREE.Vector2(frame.inward.x,frame.inward.y).normalize();
      const key=isFreeformInfinity?`freeform:${freeformInfinitySourceEdge}`:`rect:${side}`;
      straightInfinityRange=this._getStraightInfinityRange(fullSpan,key);
      const start=Math.max(-fullSpan*0.5,Math.min(fullSpan*0.5-0.6,straightInfinityRange.start));
      const end=Math.min(fullSpan*0.5,Math.max(start+0.6,straightInfinityRange.end));
      straightInfinityRange.start=start; straightInfinityRange.end=end;
      const selectedSpan=Math.max(0.6,end-start);
      const selectedMid=(start+end)*0.5;
      straightInfinityFullFrame={center:fullCenter.clone(),tangent:fullTangent.clone(),inward:fullInward.clone(),span:fullSpan,key};
      frame={...frame,center:fullCenter.clone().addScaledVector(fullTangent,selectedMid),tangent:fullTangent.clone(),inward:fullInward.clone(),span:selectedSpan};
      wallSpan=selectedSpan;
      if(start>-fullSpan*0.5+1e-6)straightInfinityNonSelected.push({a:-fullSpan*0.5,b:start});
      if(end< fullSpan*0.5-1e-6)straightInfinityNonSelected.push({a:end,b:fullSpan*0.5});
      this._straightInfinityFrameState={center:fullCenter.clone(),tangent:fullTangent.clone(),inward:fullInward.clone(),span:fullSpan,key,side,sourceEdge:freeformInfinitySourceEdge};
    }else{
      this._straightInfinityFrameState=null;
    }

    // Oval pools do not have a straight rectangular side. Build the infinity
    // feature from a centred chord of the ellipse instead of from the outer
    // bounding-box edge. This keeps the tank, side walls and water sheet
    // attached to the curved shell rather than projecting from an imaginary
    // full-width rectangular wall.
    const isOvalInfinity = this.poolParams?.shape === 'oval';
    if (isOvalInfinity) {
      const alongRadius = (side === 'front' || side === 'back')
        ? Math.max(0.3, length * 0.5)
        : Math.max(0.3, width * 0.5);
      const normalRadius = (side === 'front' || side === 'back')
        ? Math.max(0.3, width * 0.5)
        : Math.max(0.3, length * 0.5);

      // Use a chord equal to 50% of the pool's transverse diameter. At this
      // width the chord remains visibly integrated with the oval and leaves
      // enough curved shell at both ends for clean side-wall connections.
      const chordHalfSpan = Math.max(0.30, alongRadius * 0.50);
      const ratio = Math.min(0.92, chordHalfSpan / alongRadius);
      const chordNormal = normalRadius * Math.sqrt(Math.max(0, 1 - ratio * ratio));
      const sign = (side === 'front' || side === 'left') ? -1 : 1;

      frame = {
        ...frame,
        center: frame.center.clone(),
        span: chordHalfSpan * 2
      };
      if (side === 'front' || side === 'back') frame.center.y = sign * chordNormal;
      else frame.center.x = sign * chordNormal;
      wallSpan = frame.span;
    }

    // Rectangular pools use the complete wall. Oval pools use the calculated
    // chord opening above.
    const span = wallSpan;
    const endReturnLength = 0.20;
    const spillSpan = Math.max(0.20, span - endReturnLength * 2);
    const groundZ = this._getGroundTopLocalZ();
    // Match the infinity surface to the actual main-pool water elevation.
    // Pool water geometry may be offset within its mesh, so read the local
    // geometry bounds rather than relying on a hard-coded height.
    const poolWaterMesh = this.poolGroup?.userData?.waterMesh || null;
    let poolWaterZ = -0.1;
    if (poolWaterMesh?.geometry) {
      poolWaterMesh.geometry.computeBoundingBox?.();
      const waterBounds = poolWaterMesh.geometry.boundingBox;
      if (waterBounds) poolWaterZ = Number(poolWaterMesh.position?.z || 0) + Number(waterBounds.max?.z || 0);
    }
    const tiled = this._getPoolTileMaterial();
    const spillMaterial = this._getSpaStyleSpillMaterial();
    const alongX = Math.abs(frame.tangent.x) > 0.5;

    // Remove coping from the active infinity side and create a 100 mm high
    // invisible wall void by shortening only that structural wall from the top.
    // The existing wall remains authoritative below the overflow notch.
    // Remove coping across the complete infinity wall. The water opening itself
    // remains inset 200 mm from each end.
    if (isFreeformInfinity && freeformInfinitySourceEdge >= 0) {
      this._restoreInfinityEdgeCoping?.();
      this._restoreInfinityWallVoid?.();
      if (!this._infinityHiddenCoping) this._infinityHiddenCoping = [];
      const matchingWalls = [];
      this.poolGroup?.traverse?.((obj) => {
        if (!obj?.isMesh) return;
        if (obj.userData?.isWall && Number(obj.userData?.sourceEdgeIndex) === freeformInfinitySourceEdge) {
          matchingWalls.push(obj);
          obj.visible = false;
          obj.userData.infinitySuppressed = true;
          if (!freeformInfinityWallSource) freeformInfinityWallSource = obj;
          const copingIndex = Number(obj.userData?.copingIndex);
          const coping = Array.isArray(this.poolGroup?.userData?.copingSegments)
            ? this.poolGroup.userData.copingSegments[copingIndex] : null;
          if (coping) {
            coping.visible = false;
            coping.userData.infinitySuppressed = true;
            if (!this._infinityHiddenCoping.includes(coping)) this._infinityHiddenCoping.push(coping);
          }
        }
      });
      this._infinityWallVoidEntries = matchingWalls.map((mesh) => ({ mesh, visible: true }));
    } else {
      this._hideInfinityEdgeCoping(side, frame, wallSpan);
      if (!isOvalInfinity) this._applyInfinityWallVoid(side);
      else this._restoreInfinityWallVoid();
    }

    // The shortened original wall remains the only structural geometry. Ensure
    // its exposed top face and all wall faces use the active pool tile material.
    for (const entry of (this._infinityWallVoidEntries || [])) {
      const wallMesh = entry?.mesh;
      if (!wallMesh?.isMesh) continue;
      wallMesh.material = tiled.clone();
      wallMesh.material.needsUpdate = true;
      try { this.updateScaledBoxTilingUVs(wallMesh); } catch (_) {}
    }

    const existingWallThickness = 0.20;
    const frameAngle = Math.atan2(frame.tangent.y, frame.tangent.x);

    // Keep normal full-height wall on the unselected portions of a straight
    // rectangle/freeform edge. Rectangle's authored wall is lowered as a whole,
    // so only its top 100 mm must be restored. Freeform's source segment is hidden,
    // so recreate the complete wall height on its unselected portions.
    if(straightInfinityFullFrame&&straightInfinityNonSelected.length){
      const fullT=straightInfinityFullFrame.tangent.clone();
      const fullN=straightInfinityFullFrame.inward.clone();
      const depthForRestore=Math.max(0.6,Number(this.poolParams?.deep)||1.8,Number(this.poolParams?.shallow)||1.2);
      for(const seg of straightInfinityNonSelected){
        const segLen=Math.max(0,seg.b-seg.a); if(segLen<0.001)continue;
        const mid=(seg.a+seg.b)*0.5;
        const c=straightInfinityFullFrame.center.clone().addScaledVector(fullT,mid).addScaledVector(fullN,-existingWallThickness*0.5);
        const h=isFreeformInfinity?depthForRestore:0.10;
        const z=isFreeformInfinity?-depthForRestore*0.5:-0.05;
        const g=new THREE.BoxGeometry(segLen,existingWallThickness,h);
        const m=this._addFeatureMesh(group,g,tiled.clone(),{x:c.x,y:c.y,z},{x:0,y:0,z:Math.atan2(fullT.y,fullT.x)},'infinity-normal-wall-restored');
        m.userData.isWall=true; m.userData.forceVerticalUV=true;
        try{this.updateScaledBoxTilingUVs(m);}catch(_){}
      }
    }

    if (isFreeformInfinity && freeformInfinitySourceEdge >= 0) {
      const freeformWallDepth = Math.max(0.6, Number(this.poolParams?.deep) || 1.8, Number(this.poolParams?.shallow) || 1.2);
      const loweredTop = -0.10;
      const loweredHeight = Math.max(0.10, freeformWallDepth + loweredTop);
      const loweredGeo = new THREE.BoxGeometry(wallSpan, existingWallThickness, loweredHeight);
      const loweredCenter = frame.center.clone().addScaledVector(frame.inward, -existingWallThickness * 0.5);
      const loweredWall = this._addFeatureMesh(
        group, loweredGeo, tiled.clone(),
        { x: loweredCenter.x, y: loweredCenter.y, z: (-freeformWallDepth + loweredTop) * 0.5 },
        { x: 0, y: 0, z: frameAngle }, 'infinity-freeform-lowered-wall'
      );
      loweredWall.userData.isWall = true;
      loweredWall.userData.forceVerticalUV = true;
      loweredWall.userData.isInfinityCatchSurface = true;
      this.updateScaledBoxTilingUVs(loweredWall);
    }

    // The oval builder exposes one continuous curved wall mesh, so it cannot be
    // shortened by a side tag like a rectangle. Add a dedicated straight chord
    // wall beneath the overflow strip. It visually and structurally closes the
    // chord opening while the original curved shell remains behind it.
    if (isOvalInfinity) {
      const ovalWallDepth = Math.max(0.6, Number(this.poolParams?.deep) || 1.8);
      const chordWallGeometry = alongX
        ? new THREE.BoxGeometry(span, existingWallThickness, ovalWallDepth)
        : new THREE.BoxGeometry(existingWallThickness, span, ovalWallDepth);
      const chordWallCenter = frame.center.clone().addScaledVector(frame.inward, -existingWallThickness * 0.5);
      const chordWall = this._addFeatureMesh(
        group,
        chordWallGeometry,
        tiled.clone(),
        { x: chordWallCenter.x, y: chordWallCenter.y, z: -ovalWallDepth * 0.5 },
        null,
        'infinity-oval-chord-wall'
      );
      chordWall.userData.isWall = true;
      chordWall.userData.forceVerticalUV = true;
      chordWall.userData.isInfinityCatchSurface = true;
      try { this.updateScaledBoxTilingUVs(chordWall); } catch (_) {}
    }

    // The existing shortened infinity wall now maps its horizontal top face
    // with the same physical tile scale as the pool floor. No separate cap mesh is used.

    // Separate horizontal infinity-water surface, matching the spa-water model:
    // it bridges the pool water to the overflow edge without becoming part of
    // the structural wall mesh.
    // Keep the falling sheet clear of the tiled wall face, but make the pool
    // overflow and catch water terminate at that same seam. This avoids both
    // z-fighting and the former clearance gap/overlap between water meshes.
    const spillSheetClearance = 0.006;
    const overflowWidth = existingWallThickness + spillSheetClearance;
    const overflowCenter = frame.center.clone().addScaledVector(
      frame.inward,
      -overflowWidth * 0.5
    );
    const overflowGeometry = new THREE.PlaneGeometry(
      spillSpan, overflowWidth, Math.max(12, Math.ceil(spillSpan * 18)), 8
    );
    const overflowWater = createPoolWater(overflowGeometry);
    overflowWater.name = 'infinity-horizontal-water';
    overflowWater.position.set(overflowCenter.x, overflowCenter.y, poolWaterZ);
    overflowWater.rotation.z = frameAngle;
    overflowWater.userData.isInfinityWater = true;
    overflowWater.userData.isInfinityHorizontalWater = true;
    overflowWater.frustumCulled = false;
    group.add(overflowWater);

    // Recessed catch tank directly outside the existing pool wall. Its opening
    // remains at ground level and its tiled body extends below the ground plane.
    const tankDepth = 0.55;
    const tankClearWidth = 0.72;
    const tankWallThickness = 0.20;
    const sideWallForwardExtension = 0.30;
    const catchmentCopingWidth = 0.25;
    const copingThickness = 0.05;
    // Match the oval tank depth and fix the structural tank-wall top at the
    // ground-plane level. Coping remains a separate 50 mm cap above the wall.
    const tankTop = groundZ;
    const tankOuterWidth = tankClearWidth + tankWallThickness * 2;
    // Keep a 200 mm clear gap between the outside face of the infinity wall
    // and the open inner edge of the catch tank.
    const tankCenter = frame.center.clone().addScaledVector(
      frame.inward,
      -(existingWallThickness + tankOuterWidth * 0.5)
    );
    // Extend the catchment tank 200 mm beyond each end of the infinity wall.
    const tankLength = wallSpan + 0.40;
    const tankWidth = tankOuterWidth;
    const tankWallHeight = tankDepth;

    // Build the catchment ground void from the exact final exterior footprint,
    // using the same direct-outline principle as the main pool void. The inner
    // edge follows the outside face of the infinity wall, the side edges follow
    // the outside faces of the 200 mm continued pool walls, and the outer edge
    // follows the final 300 mm wall extension. No fixed clearance is added.
    const ground = this.ground || this.scene?.userData?.ground;
    if (ground) {
      const voidTangent = frame.tangent.clone().normalize();
      const voidNormal = frame.inward.clone().normalize();
      const tangentHalfExtent = wallSpan * 0.5 + existingWallThickness;
      // Keep this feature-specific hole clear of the main pool hole. Both are
      // hidden beneath the wall, while non-overlapping paths keep the circular
      // ground mesh triangulation stable.
      const innerNormalDistance = existingWallThickness + 0.025;
      const outerNormalDistance = existingWallThickness + tankWidth;
      const corners = [
        frame.center.clone().addScaledVector(voidTangent,  tangentHalfExtent).addScaledVector(voidNormal, -innerNormalDistance),
        frame.center.clone().addScaledVector(voidTangent, -tangentHalfExtent).addScaledVector(voidNormal, -innerNormalDistance),
        frame.center.clone().addScaledVector(voidTangent, -tangentHalfExtent).addScaledVector(voidNormal, -outerNormalDistance),
        frame.center.clone().addScaledVector(voidTangent,  tangentHalfExtent).addScaledVector(voidNormal, -outerNormalDistance)
      ].map((point) => new THREE.Vector2(point.x, point.y));
      const existing = Array.isArray(ground.userData.extraGroundVoids)
        ? ground.userData.extraGroundVoids.filter((entry) => entry?.name !== 'infinity-catch-tank')
        : [];
      ground.userData.extraGroundVoids = [
        ...existing,
        { name: 'infinity-catch-tank', points: corners }
      ];
    }

    const catchFloor = this._addFeatureMesh(
      group,
      new THREE.BoxGeometry(tankLength, tankWidth, 0.10),
      tiled.clone(),
      {
        x: tankCenter.x,
        y: tankCenter.y,
        z: tankTop - tankDepth
      },
      { x: 0, y: 0, z: frameAngle },
      'infinity-catch-floor'
    );
    // Use the same fixed-density UV projection as the main pool floor.
    // BoxGeometry's default 0..1 UVs stretch one tile across the full tank.
    catchFloor.userData.isFloor = true;
    catchFloor.userData.isInfinityCatchSurface = true;
    catchFloor.userData.isInfinityTankGroundFixed = true;
    catchFloor.userData.infinityTankBaseZ = catchFloor.position.z + this.getPoolElevation();
    this.updateScaledBoxTilingUVs(catchFloor);

    const longWallGeometry = new THREE.BoxGeometry(tankLength, tankWallThickness, tankWallHeight);
    const shortWallGeometry = new THREE.BoxGeometry(tankWallThickness, tankWidth, tankWallHeight);

    const normal = frame.inward.clone().normalize();
    const tangent = frame.tangent.clone().normalize();
    const halfNormal = tankWidth * 0.5 - tankWallThickness * 0.5;
    const halfTangent = tankLength * 0.5 - tankWallThickness * 0.5;
    const wallZ = tankTop - tankWallHeight * 0.5;

    // Leave the pool-side of the catch tank open: only the outer and two end
    // walls are built. This lets the spill sheet drop directly into the tank.
    const outerWallPos = tankCenter.clone().addScaledVector(normal, -halfNormal);
    const outerTankWall = this._addFeatureMesh(group, longWallGeometry.clone(), tiled.clone(),
      { x: outerWallPos.x, y: outerWallPos.y, z: wallZ }, { x: 0, y: 0, z: frameAngle }, 'infinity-catch-wall-outer');
    outerTankWall.userData.isWall = true;
    outerTankWall.userData.forceVerticalUV = true;
    outerTankWall.userData.isInfinityTankGroundFixed = true;
    outerTankWall.userData.infinityTankBaseZ = outerTankWall.position.z + this.getPoolElevation();
    outerTankWall.userData.isInfinityCatchSurface = true;
    this.updateScaledBoxTilingUVs(outerTankWall);

    // Extend each pool side wall exactly 300 mm beyond the pool toward the
    // catchment tank. The remaining catchment depth is completed by a separate
    // 200 mm tank-wall segment, so no wall projects beyond the outer tank wall.
    // Match the 300 mm extensions to the actual adjacent pool walls, not the
    // shallower catchment walls. This makes the original pool shell visibly
    // continue beyond the pool body toward the tank.
    const adjacentSides = (side === 'front' || side === 'back')
      ? ['left', 'right', 'west', 'east']
      : ['front', 'back', 'north', 'south'];
    const wallMeshes = Array.isArray(this.poolGroup?.userData?.wallMeshes)
      ? this.poolGroup.userData.wallMeshes.filter(Boolean)
      : [];
    const adjacentWall = wallMeshes.find((mesh) =>
      adjacentSides.includes(String(mesh?.userData?.side || '').toLowerCase())
    ) || freeformInfinityWallSource;
    let extensionHeight = tankWallHeight;
    let extensionZ = wallZ;
    if (adjacentWall?.geometry) {
      adjacentWall.geometry.computeBoundingBox?.();
      const bounds = adjacentWall.geometry.boundingBox;
      if (bounds) {
        extensionHeight = Math.abs((bounds.max.z - bounds.min.z) * Number(adjacentWall.scale?.z || 1));
        extensionZ = Number(adjacentWall.position?.z || 0)
          + ((bounds.max.z + bounds.min.z) * 0.5 * Number(adjacentWall.scale?.z || 1));
      }
    }
    const poolWallRun = Math.min(sideWallForwardExtension, tankWidth);
    const tankWallRun = Math.max(0, tankWidth - poolWallRun);
    const sideWallOffset = wallSpan * 0.5 + existingWallThickness * 0.5;

    const poolWallGeometry = new THREE.BoxGeometry(existingWallThickness, poolWallRun, extensionHeight);
    const poolWallCenter = frame.center.clone().addScaledVector(
      normal,
      -(existingWallThickness + poolWallRun * 0.5)
    );

    const sideSigns = [1, -1];

    // Match the L-shape endpoint construction: each end of the lowered
    // infinity wall gets a 200 mm full-height return. The spill wall/water
    // above already use spillSpan, so these returns occupy exactly the trimmed
    // 200 mm zones and meet the 300 mm tank-wall extensions at the wall ends.
    const endReturnWalls = [];
    const returnWallGeometry = new THREE.BoxGeometry(
      endReturnLength,
      existingWallThickness,
      extensionHeight
    );
    sideSigns.forEach((sign, index) => {
      const returnCenter = frame.center.clone()
        .addScaledVector(tangent, sign * (span * 0.5 - endReturnLength * 0.5))
        .addScaledVector(normal, -existingWallThickness * 0.5);
      const returnWall = this._addFeatureMesh(
        group,
        returnWallGeometry.clone(),
        tiled.clone(),
        { x: returnCenter.x, y: returnCenter.y, z: extensionZ },
        { x: 0, y: 0, z: frameAngle },
        `infinity-pool-wall-end-return-${index ? 'b' : 'a'}`
      );
      returnWall.userData.isWall = true;
      returnWall.userData.forceVerticalUV = true;
      returnWall.userData.isInfinityCatchSurface = true;
      returnWall.userData.isInfinityPoolWallExtension = true;

      const positions = returnWall.geometry?.attributes?.position;
      if (positions) {
        let minLocalZ = Infinity;
        for (let i = 0; i < positions.count; i++) minLocalZ = Math.min(minLocalZ, positions.getZ(i));
        const bottomIndices = [];
        for (let i = 0; i < positions.count; i++) {
          if (Math.abs(positions.getZ(i) - minLocalZ) < 1e-6) bottomIndices.push(i);
        }
        const fixedBottomZ = tankTop - tankDepth;
        returnWall.userData.infinityPoolWallBottomFixedZ = fixedBottomZ;
        returnWall.userData.infinityPoolWallBottomVertexIndices = bottomIndices;
        const localBottomZ = fixedBottomZ - this.getPoolElevation() - returnWall.position.z;
        bottomIndices.forEach((vertexIndex) => positions.setZ(vertexIndex, localBottomZ));
        positions.needsUpdate = true;
        returnWall.geometry.computeVertexNormals?.();
        returnWall.geometry.computeBoundingBox?.();
        returnWall.geometry.computeBoundingSphere?.();
      }
      this.updateScaledBoxTilingUVs(returnWall);
      endReturnWalls.push({ mesh: returnWall, sign, center: returnCenter });
    });

    sideSigns.forEach((sign, index) => {
      const pos = poolWallCenter.clone().addScaledVector(tangent, sign * sideWallOffset);
      const extension = this._addFeatureMesh(group, poolWallGeometry.clone(), tiled.clone(),
        { x: pos.x, y: pos.y, z: extensionZ }, { x: 0, y: 0, z: frameAngle }, `infinity-pool-wall-extension-${index ? 'b' : 'a'}`);
      extension.userData.isWall = true;
      extension.userData.forceVerticalUV = true;
      extension.userData.isInfinityCatchSurface = true;
      extension.userData.isInfinityPoolWallExtension = true;

      // Anchor the extension bottom to the catch-tank floor rather than letting
      // the complete wall rise with the pool. BoxGeometry duplicates corner
      // vertices per face, so retain every vertex on the original lower plane.
      const extensionPositions = extension.geometry?.attributes?.position;
      if (extensionPositions) {
        let minLocalZ = Infinity;
        for (let i = 0; i < extensionPositions.count; i++) {
          minLocalZ = Math.min(minLocalZ, extensionPositions.getZ(i));
        }
        const bottomIndices = [];
        for (let i = 0; i < extensionPositions.count; i++) {
          if (Math.abs(extensionPositions.getZ(i) - minLocalZ) < 1e-6) bottomIndices.push(i);
        }
        const fixedBottomZ = tankTop - tankDepth;
        extension.userData.infinityPoolWallBottomFixedZ = fixedBottomZ;
        extension.userData.infinityPoolWallBottomVertexIndices = bottomIndices;
        const localBottomZ = fixedBottomZ - this.getPoolElevation() - extension.position.z;
        bottomIndices.forEach((vertexIndex) => extensionPositions.setZ(vertexIndex, localBottomZ));
        extensionPositions.needsUpdate = true;
        extension.geometry.computeVertexNormals?.();
        extension.geometry.computeBoundingBox?.();
        extension.geometry.computeBoundingSphere?.();
      }
      this.updateScaledBoxTilingUVs(extension);
    });

    const tankSideWalls = [];
    if (tankWallRun > 0.001) {
      const tankSideGeometry = new THREE.BoxGeometry(tankWallThickness, tankWallRun, tankWallHeight);
      const tankSideCenter = frame.center.clone().addScaledVector(
        normal,
        -(existingWallThickness + poolWallRun + tankWallRun * 0.5)
      );
      sideSigns.forEach((sign, index) => {
        const pos = tankSideCenter.clone().addScaledVector(tangent, sign * sideWallOffset);
        const tankSide = this._addFeatureMesh(group, tankSideGeometry.clone(), tiled.clone(),
          { x: pos.x, y: pos.y, z: wallZ }, { x: 0, y: 0, z: frameAngle }, `infinity-catch-side-wall-${index ? 'b' : 'a'}`);
        tankSide.userData.isWall = true;
        tankSide.userData.forceVerticalUV = true;
        tankSide.userData.isInfinityCatchSurface = true;
        tankSide.userData.isInfinityTankGroundFixed = true;
        tankSide.userData.infinityTankBaseZ = tankSide.position.z + this.getPoolElevation();
        tankSideWalls.push(tankSide);
        this.updateScaledBoxTilingUVs(tankSide);
      });
    }

    // Continuous tiled liners close the pool-facing sides of both tank-end
    // walls from the raised pool top down to the fixed tank floor. Each liner
    // sits 2 mm proud of the structural face to avoid texture flicker.
    const linerBottom = tankTop - tankDepth - this.getPoolElevation();
    const linerHeight = Math.max(0.10, -linerBottom);
    const linerCenter = frame.center.clone().addScaledVector(
      normal,
      -(existingWallThickness + tankWidth * 0.5)
    );
    sideSigns.forEach((sign, index) => {
      const pos = linerCenter.clone().addScaledVector(
        tangent,
        sign * (wallSpan * 0.5 - 0.002)
      );
      const liner = this._addFeatureMesh(
        group,
        new THREE.BoxGeometry(0.006, tankWidth, linerHeight),
        tiled.clone(),
        { x: pos.x, y: pos.y, z: linerBottom + linerHeight * 0.5 },
        { x: 0, y: 0, z: frameAngle },
        `infinity-tank-end-interior-tile-liner-${index ? 'b' : 'a'}`
      );
      liner.userData.isWall = true;
      liner.userData.forceVerticalUV = true;
      liner.userData.isInfinityEndpointTileGuard = true;
      liner.userData.isInfinityCatchSurface = true;
      liner.frustumCulled = false;
      this.updateScaledBoxTilingUVs(liner);
    });

    // The tank-side return also meets the adjacent internal pool wall. Cover
    // the first 500 mm of that wall with a full-depth tiled skin so the join
    // cannot expose the structural shell when the pool or tank is resized.
    const adjacentLinerRun = 0.50;
    const adjacentLinerDepth = Math.max(
      0.60,
      Number(this.poolParams?.deep) || 1.8,
      Number(this.poolParams?.shallow) || 1.2
    );
    sideSigns.forEach((sign, index) => {
      const pos = frame.center.clone()
        .addScaledVector(tangent, sign * (wallSpan * 0.5 - 0.002))
        .addScaledVector(normal, adjacentLinerRun * 0.5);
      const liner = this._addFeatureMesh(
        group,
        new THREE.BoxGeometry(0.006, adjacentLinerRun, adjacentLinerDepth),
        tiled.clone(),
        { x: pos.x, y: pos.y, z: -adjacentLinerDepth * 0.5 },
        { x: 0, y: 0, z: frameAngle },
        `infinity-pool-adjacent-interior-tile-liner-${index ? 'b' : 'a'}`
      );
      liner.userData.isWall = true;
      liner.userData.forceVerticalUV = true;
      liner.userData.isInfinityEndpointTileGuard = true;
      liner.frustumCulled = false;
      this.updateScaledBoxTilingUVs(liner);
    });

    // Cap the exposed tank walls with the active pool coping material. Fall back
    // to the tile material only if the pool builder does not expose a coping mesh.
    let copingMaterial = null;
    const copingCandidates = [];
    const copingSegments = this.poolGroup?.userData?.copingSegments;
    if (Array.isArray(copingSegments)) copingCandidates.push(...copingSegments);
    else if (copingSegments && typeof copingSegments === 'object') copingCandidates.push(...Object.values(copingSegments));
    if (this.poolGroup?.userData?.copingMesh) copingCandidates.push(this.poolGroup.userData.copingMesh);
    this.poolGroup?.traverse?.((obj) => {
      if (obj?.isMesh && String(obj.name || '').toLowerCase().includes('coping')) copingCandidates.push(obj);
    });
    const copingSource = copingCandidates.find((obj) => obj?.material);
    if (copingSource?.material) {
      const sourceMaterial = Array.isArray(copingSource.material)
        ? copingSource.material.find(Boolean)
        : copingSource.material;
      copingMaterial = sourceMaterial?.clone?.() || sourceMaterial;
    }
    if (!copingMaterial) copingMaterial = tiled.clone();

    // Rebuild the normal coping on unselected parts of rectangle/freeform edges.
    // The active infinity opening itself remains uncapped, exactly like L-shape.
    if(straightInfinityFullFrame&&straightInfinityNonSelected.length){
      const fullT=straightInfinityFullFrame.tangent.clone();
      const fullN=straightInfinityFullFrame.inward.clone();
      const capAngle=Math.atan2(fullT.y,fullT.x);
      const capZ=0.001+copingThickness*0.5;
      for(const seg of straightInfinityNonSelected){
        const segLen=Math.max(0,seg.b-seg.a);if(segLen<0.001)continue;
        const mid=(seg.a+seg.b)*0.5;
        // Rectangle wall reference is the pool-side face: 50 mm overhang inward,
        // 200 mm across the wall and zero rear overhang. Freeform's authored
        // coping is centred on its 50 mm wall centreline, so preserve that profile.
        const normalShift=isFreeformInfinity?0:-0.075;
        const c=straightInfinityFullFrame.center.clone().addScaledVector(fullT,mid).addScaledVector(fullN,normalShift);
        const geo=new THREE.BoxGeometry(segLen,0.25,copingThickness);
        const cap=this._addFeatureMesh(group,geo,copingMaterial.clone?.()||copingMaterial,{x:c.x,y:c.y,z:capZ},{x:0,y:0,z:capAngle},'infinity-normal-coping-restored');
        cap.userData.isCoping=true;
      }
    }

    // Coping over the 200 mm full-height returns follows the accepted L-shape
    // rule: back/pool-side edge flush with the wall, 50 mm overhang toward the
    // catch tank, and 50 mm longitudinal overhang toward the infinity opening.
    const returnCopingWidth = existingWallThickness + 0.05;
    const returnCopingLength = endReturnLength + 0.05;
    const returnCopingGeometry = new THREE.BoxGeometry(
      returnCopingLength,
      returnCopingWidth,
      copingThickness
    );
    const returnCopingZ = extensionZ + extensionHeight * 0.5 + copingThickness * 0.5;
    endReturnWalls.forEach(({ sign, center }, index) => {
      const capCenter = center.clone()
        .addScaledVector(normal, -0.025)
        .addScaledVector(tangent, -sign * 0.025);
      this._addFeatureMesh(
        group,
        returnCopingGeometry.clone(),
        copingMaterial.clone?.() || copingMaterial,
        { x: capCenter.x, y: capCenter.y, z: returnCopingZ },
        { x: 0, y: 0, z: frameAngle },
        `infinity-pool-wall-end-return-coping-${index ? 'b' : 'a'}`
      );
    });

    // Continue the pool coping over the two new 300 mm full-height pool-wall
    // extensions. These caps use the same 250 mm coping width and material as
    // the existing pool coping, and sit at the actual top of the extended walls.
    const extensionCopingWidth = 0.25;
    const extensionCopingGeometry = new THREE.BoxGeometry(extensionCopingWidth, poolWallRun, copingThickness);
    const extensionCopingZ = extensionZ + extensionHeight * 0.5 + copingThickness * 0.5;
    sideSigns.forEach((sign, index) => {
      // Keep the 300 mm raised-wall coping at 250 mm total width: the
      // 200 mm wall is fully covered, with 50 mm overhang toward the tank and
      // the rear/back edge flush with the wall. That requires a 25 mm shift
      // toward the tank centreline across the wall thickness.
      const capPos = poolWallCenter.clone()
        .addScaledVector(tangent, sign * sideWallOffset)
        .addScaledVector(tangent, -sign * 0.025);
      this._addFeatureMesh(
        group,
        extensionCopingGeometry.clone(),
        copingMaterial.clone?.() || copingMaterial,
        { x: capPos.x, y: capPos.y, z: extensionCopingZ },
        { x: 0, y: 0, z: frameAngle },
        `infinity-pool-wall-extension-coping-${index ? 'b' : 'a'}`
      );
    });

    // Build the catchment coping explicitly to the requested 250 mm width.
    // The 200 mm outer wall is fully covered, with the remaining 50 mm
    // overhanging INTO the tank and zero overhang behind the outer wall.
    const longWallCopingLength = tankLength;
    const longCapGeometry = new THREE.BoxGeometry(longWallCopingLength, catchmentCopingWidth, copingThickness);
    const copingZ = tankTop + copingThickness * 0.5;
    const outerCopingCenter = outerWallPos.clone().addScaledVector(normal, 0.025);

    const outerCoping = this._addFeatureMesh(group, longCapGeometry, copingMaterial.clone?.() || copingMaterial,
      { x: outerCopingCenter.x, y: outerCopingCenter.y, z: copingZ }, { x: 0, y: 0, z: frameAngle }, 'infinity-catch-coping-outer');
    outerCoping.userData.isInfinityTankGroundFixed = true;
    outerCoping.userData.infinityTankBaseZ = outerCoping.position.z + this.getPoolElevation();

    // Carry each 250 mm side coping all the way to the OUTER edge of the
    // 250 mm outer coping. The previous version stopped at the inner coping
    // edge, leaving the outer corner 250 mm short. Both pieces now overlap as
    // orthogonal solid caps at the corner, producing a clean square junction.
    // Across each 200 mm side wall the cap is offset 25 mm toward the tank, so
    // it has a 50 mm tank-side overhang and remains flush with the wall back.
    if (tankSideWalls.length) {
      const sideCopingRun = Math.max(0.001, tankWallRun);
      const sideCapGeometry = new THREE.BoxGeometry(catchmentCopingWidth, sideCopingRun, copingThickness);

      tankSideWalls.forEach((tankSide, index) => {
        const sideCapCenter = tankSide.position.clone()
          .addScaledVector(tangent, -sideSigns[index] * 0.025);
        const sideCoping = this._addFeatureMesh(
          group,
          sideCapGeometry.clone(),
          copingMaterial.clone?.() || copingMaterial,
          {
            x: sideCapCenter.x,
            y: sideCapCenter.y,
            z: copingZ
          },
          { x: 0, y: 0, z: frameAngle },
          `infinity-catch-side-coping-${index ? 'b' : 'a'}`
        );
        sideCoping.userData.isInfinityTankGroundFixed = true;
        sideCoping.userData.infinityTankBaseZ = sideCoping.position.z + this.getPoolElevation();
      });
    }

    // The pool-side edge of the tank is open, so the water must continue all
    // the way to the pool wall. Deduct only the outer wall thickness and shift
    // the water centre toward the pool by half that thickness.
    const catchWaterNormalSpan = Math.max(0.1, tankWidth - tankWallThickness - spillSheetClearance);
    const catchWaterTangentSpan = Math.max(0.1, tankLength - tankWallThickness * 2);
    const catchWaterGeometry = new THREE.BoxGeometry(catchWaterTangentSpan, catchWaterNormalSpan, 0.025);

    const catchWaterCenter = tankCenter.clone().addScaledVector(
      normal,
      (tankWallThickness - spillSheetClearance) * 0.5
    );
    const catchWater = createPoolWater(catchWaterGeometry);
    catchWater.name = 'infinity-catch-water';
    const catchWaterThickness = 0.025;
    const catchWaterSurfaceDrop = 0.10;
    catchWater.position.set(
      catchWaterCenter.x,
      catchWaterCenter.y,
      tankTop - catchWaterSurfaceDrop - catchWaterThickness * 0.5
    );
    catchWater.rotation.z = frameAngle;
    catchWater.userData.isInfinityWater = true;
    catchWater.userData.isInfinityCatchWater = true;
    catchWater.userData.isInfinityTankGroundFixed = true;
    catchWater.userData.infinityTankBaseZ = catchWater.position.z + this.getPoolElevation();
    catchWater.frustumCulled = false;
    group.add(catchWater);
    if (!Array.isArray(this.poolGroup?.userData?.animatables)) {
      this.poolGroup.userData.animatables = [];
    }
    this.poolGroup.userData.animatables.push(catchWater);

    // Build the spill sheet from explicit world-aligned corners so its top edge
    // sits on the outside face of the infinity wall and its bottom edge reaches
    // the catch-tank water. This avoids camera/side-dependent plane rotations.
    const outsideFace = frame.center.clone().addScaledVector(
      frame.inward,
      -(existingWallThickness + spillSheetClearance)
    );
    // Fix the lower edge to the visible top surface of the catch-tank water.
    // Because the infinity feature is parented to the raised pool, subtract the
    // current pool elevation here and update these lower vertices whenever the
    // pool height changes. The upper edge remains attached to the pool water.
    const catchWaterSurfaceZ = catchWater.position.z + catchWaterThickness * 0.5;
    const currentPoolElevation = this.getPoolElevation();
    const sheetBottomFixedZ = catchWaterSurfaceZ + currentPoolElevation;
    const sheetBottom = sheetBottomFixedZ - currentPoolElevation;
    const sheetTop = poolWaterZ;
    const halfSpan = spillSpan * 0.5;
    const sheetTangent = frame.tangent.clone().normalize();
    const aTop = outsideFace.clone().addScaledVector(sheetTangent, -halfSpan); aTop.z = sheetTop;
    const bTop = outsideFace.clone().addScaledVector(sheetTangent,  halfSpan); bTop.z = sheetTop;
    const aBottom = outsideFace.clone().addScaledVector(sheetTangent, -halfSpan); aBottom.z = sheetBottom;
    const bBottom = outsideFace.clone().addScaledVector(sheetTangent,  halfSpan); bBottom.z = sheetBottom;
    const sheetGeometry = new THREE.BufferGeometry();
    sheetGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      aTop.x, aTop.y, aTop.z,
      aBottom.x, aBottom.y, aBottom.z,
      bTop.x, bTop.y, bTop.z,
      bTop.x, bTop.y, bTop.z,
      aBottom.x, aBottom.y, aBottom.z,
      bBottom.x, bBottom.y, bBottom.z
    ], 3));
    sheetGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([
      0,1, 0,0, 1,1,
      1,1, 0,0, 1,0
    ], 2));
    sheetGeometry.computeVertexNormals();
    const sheet = createPoolWater(sheetGeometry);
    sheet.name = 'infinity-water-sheet';
    sheet.frustumCulled = false;
    sheet.userData.isInfinitySpillover = true;
    sheet.userData.infinitySheetBottomFixedZ = sheetBottomFixedZ;
    sheet.userData.infinitySheetBottomVertexIndices = [1, 4, 5];
    group.add(sheet);

    // Register all infinity water meshes with the same animation pipeline as
    // the main pool water so their shader timing and visual response match.
    if (!Array.isArray(this.poolGroup?.userData?.animatables)) {
      this.poolGroup.userData.animatables = [];
    }
    for (const waterMesh of [overflowWater, sheet]) {
      if (waterMesh?.userData && typeof waterMesh.userData.animate === 'function') {
        this.poolGroup.userData.animatables.push(waterMesh);
      }
    }
  }

  _getRaisedWallFeatureFrame(featureType) {
    const raised = this._wallCandidatesForRaise().filter((wall) => {
      const key = this._getWallRaiseKey(wall);
      return key != null && Number(this.wallRaiseBySourceEdge?.[key] ?? wall.userData?.extraHeight) > 0.001;
    });
    if (!raised.length) return null;
    const saved = this.raisedWallWaterFeaturePlacements?.[featureType] || null;
    const selectedKey = this._getWallRaiseKey(this.selectedWall);
    const wall = raised.find((candidate) => this._getWallRaiseKey(candidate) === saved?.wallKey)
      || raised.find((candidate) => this._getWallRaiseKey(candidate) === selectedKey)
      || raised[0];
    const wallKey = this._getWallRaiseKey(wall);
    const edgeIndex = Number.isInteger(wall.userData?.sourceEdgeIndex)
      ? wall.userData.sourceEdgeIndex
      : wall.userData?.edgeIndex;
    const source = Array.isArray(this.poolGroup?.userData?.outerPts) ? this.poolGroup.userData.outerPts : [];
    if (!Number.isInteger(edgeIndex) || source.length < 2) return null;
    const a = source[edgeIndex % source.length]?.clone?.();
    const b = source[(edgeIndex + 1) % source.length]?.clone?.();
    if (!a || !b) return null;
    const tangent2 = b.clone().sub(a);
    const span = tangent2.length();
    if (span < 0.2) return null;
    tangent2.divideScalar(span);
    let area = 0;
    for (let i = 0; i < source.length; i += 1) {
      const p = source[i], q = source[(i + 1) % source.length];
      area += p.x * q.y - q.x * p.y;
    }
    const inward2 = area >= 0
      ? new THREE.Vector2(-tangent2.y, tangent2.x)
      : new THREE.Vector2(tangent2.y, -tangent2.x);
    const extra = Math.max(0, Number(this.wallRaiseBySourceEdge?.[wallKey] ?? wall.userData?.extraHeight) || 0);
    return {
      wall,
      wallKey,
      a:new THREE.Vector2(a.x,a.y),
      b:new THREE.Vector2(b.x,b.y),
      tangent:new THREE.Vector3(tangent2.x,tangent2.y,0),
      inward:new THREE.Vector3(inward2.x,inward2.y,0),
      span,
      extra,
      outletZ:Math.max(0.04, extra * 0.75)
    };
  }

  _positionRaisedWallWaterFeatureRoot(root, frame, rawT, save = true) {
    if (!root || !frame) return;
    const halfSpan = Math.max(0.08, Number(root.userData?.featureHalfSpan) || 0.08);
    const marginT = Math.min(0.45, halfSpan / Math.max(frame.span, 0.2));
    const t = THREE.MathUtils.clamp(Number.isFinite(rawT) ? rawT : 0.5, marginT, 1 - marginT);
    const boundary = frame.a.clone().lerp(frame.b, t);
    root.position.set(
      boundary.x + frame.inward.x * 0.08,
      boundary.y + frame.inward.y * 0.08,
      frame.outletZ
    );
    root.rotation.z = Math.atan2(frame.tangent.y, frame.tangent.x);
    root.userData.wallFrame = frame;
    root.userData.wallT = t;
    if (save) {
      this.raisedWallWaterFeaturePlacements[root.userData.featureType] = { wallKey:frame.wallKey, t };
    }
  }

  _addWaterImpactAnimation(root, x, y, z, waterMaterial, phaseOffset = 0) {
    for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
      const material = waterMaterial.clone();
      material.opacity = 0.30;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.045,0.068,28), material);
      ring.position.set(x,y,z + ringIndex * 0.0005);
      ring.name = `raised-wall-water-impact-${phaseOffset}-${ringIndex}`;
      ring.userData.isRaisedWallWaterFeature = true;
      ring.userData.animate = (_delta, clock) => {
        const time = Number(clock?.elapsedTime) || 0;
        const p = (time * 0.72 + ringIndex / 3 + phaseOffset * 0.17) % 1;
        const scale = 0.9 + p * 3.4;
        ring.scale.set(scale,scale,1);
        ring.material.opacity = Math.pow(1-p,1.55) * 0.32;
      };
      root.add(ring);
    }
  }

  _createWaterFeatureWall(group, _length, _width, blade = false) {
    const featureType = blade ? 'blade' : 'spout';
    const frame = this._getRaisedWallFeatureFrame(featureType);
    if (!frame) return;
    const metal = this._featureMaterial(0x69757c, { metalness:0.68, roughness:0.2 });
    const water = createWaterFeatureMaterial({transmission:0.42,opacity:0.48,roughness:0.025});
    water.blending = THREE.AdditiveBlending;
    const root = new THREE.Group();
    root.name = `${featureType}-raised-wall-water-feature`;
    root.userData.isRaisedWallWaterFeatureRoot = true;
    root.userData.featureType = featureType;
    root.userData.wallKey = frame.wallKey;
    const savedT = Number(this.raisedWallWaterFeaturePlacements?.[featureType]?.t);

    if (blade) {
      const bladeWidth = Math.min(
        THREE.MathUtils.clamp(Number(this.bladeLength) || 1.2, 0.3, 2.1),
        Math.max(0.3, frame.span - 0.16)
      );
      root.userData.featureHalfSpan = bladeWidth * 0.5;

      // Recessed stainless sheer-descent outlet. Keep the housing visually slim;
      // the water should appear to leave the front edge of the lip rather than
      // glowing from the middle of a large metal box.
      const outlet = this._addFeatureMesh(
        root,
        new THREE.BoxGeometry(bladeWidth,0.075,0.105),
        metal,
        {x:0,y:0.015,z:0},
        null,
        'blade-outlet'
      );
      outlet.userData.isRaisedWallWaterFeature = true;

      const slotMaterial = this._featureMaterial(0x101a20,{metalness:0.08,roughness:0.50});
      const slot = this._addFeatureMesh(
        root,
        new THREE.BoxGeometry(Math.max(0.22,bladeWidth-0.055),0.012,0.022),
        slotMaterial,
        {x:0,y:0.060,z:-0.013},
        null,
        'blade-outlet-slot'
      );
      slot.userData.isRaisedWallWaterFeature = true;

      const lip = this._addFeatureMesh(
        root,
        new THREE.BoxGeometry(bladeWidth+0.025,0.135,0.018),
        metal.clone(),
        {x:0,y:0.075,z:-0.057},
        null,
        'blade-outlet-lip'
      );
      lip.userData.isRaisedWallWaterFeature = true;

      const drop = Math.max(0.14, frame.outletZ + 0.10);
      const sheetStartY = 0.145;
      const sheetStartZ = -0.066;
      const fallDistance = Math.max(0.08, drop + sheetStartZ);
      // Use a ballistic trajectory instead of an arbitrary bowed plane. A real
      // sheer-descent leaves the lip almost horizontally and gravity creates the
      // curved fall. The projection grows naturally with drop height.
      const flightTime = Math.sqrt((2 * fallDistance) / 9.81);
      const outletVelocity = THREE.MathUtils.clamp(0.50 + bladeWidth * 0.018, 0.50, 0.56);
      const horizontalTravel = THREE.MathUtils.clamp(outletVelocity * flightTime, 0.11, 0.31);
      const widthSegments = Math.max(24,Math.round(bladeWidth*30));
      const dropSegments = 34;
      const positions = [];
      const uvs = [];
      const indices = [];
      const basePositions = [];

      for (let row=0; row<=dropSegments; row+=1) {
        const t=row/dropSegments; // flight-time fraction
        const fall=t*t;
        const breakup=THREE.MathUtils.smoothstep(t,0.55,1.0);
        const reach=sheetStartY + horizontalTravel*t;
        // Surface tension keeps the sheet nearly full-width, then pulls the
        // lower edge in slightly as the sheet starts to break into strands.
        const rowWidth=bladeWidth*(1-0.008*fall-0.028*breakup*breakup);
        for (let column=0; column<=widthSegments; column+=1) {
          const u=column/widthSegments;
          const x=(u-0.5)*rowWidth;
          const z=sheetStartZ-fallDistance*fall;
          positions.push(x,reach,z);
          basePositions.push(x,reach,z);
          uvs.push(u,1-t);
        }
      }
      const stride=widthSegments+1;
      for (let row=0; row<dropSegments; row+=1) {
        for (let column=0; column<widthSegments; column+=1) {
          const a=row*stride+column;
          const b=a+stride;
          indices.push(a,b,a+1,a+1,b,b+1);
        }
      }

      const sheetGeometry=new THREE.BufferGeometry();
      sheetGeometry.setIndex(indices);
      sheetGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      sheetGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
      sheetGeometry.computeVertexNormals();

      const sheetMaterial=createWaterFeatureMaterial({
        transmission:0.62,thickness:0.006,opacity:0.46
      });
      const sheet=new THREE.Mesh(sheetGeometry,sheetMaterial);
      sheet.name='blade-water-ribbon-sheet';
      sheet.frustumCulled=false;
      sheet.renderOrder=5;
      sheet.userData.isRaisedWallWaterFeature=true;
      sheet.userData.animate=(_delta,clock) => {
        const time=Number(clock?.elapsedTime)||0;
        const attribute=sheet.geometry.attributes.position;
        for (let row=0; row<=dropSegments; row+=1) {
          const t=row/dropSegments;
          const breakup=THREE.MathUtils.smoothstep(t,0.52,1.0);
          for (let column=0; column<=widthSegments; column+=1) {
            const u=column/widthSegments;
            const vertex=row*stride+column;
            const offset=vertex*3;
            const edge=Math.pow(Math.abs(u-0.5)*2,5);
            // Fine travelling corrugations and edge flutter. The coherent upper
            // two-thirds stays calm; most breakup is reserved for the lower edge.
            const verticalBand=Math.sin(time*7.0-t*22.0+u*4.2);
            const crossBand=Math.sin(time*3.4+u*34.0+t*5.0);
            const micro=Math.sin(time*11.0-t*41.0+u*13.0);
            attribute.array[offset]=basePositions[offset]
              + crossBand*0.0011*breakup
              + micro*0.0018*edge*breakup;
            attribute.array[offset+1]=basePositions[offset+1]
              + verticalBand*(0.0009+0.0030*breakup)
              + crossBand*0.0012*breakup;
            attribute.array[offset+2]=basePositions[offset+2]
              + micro*0.0011*breakup;
          }
        }
        attribute.needsUpdate=true;
        sheet.geometry.computeVertexNormals();
      };
      root.add(sheet);

      // A very subtle animated streak layer supplies the longitudinal veining
      // visible in real sheer-descent water without turning the whole sheet blue
      // or emissive. It shares the deformed geometry so highlights travel with it.
      const streakMaterial=new THREE.ShaderMaterial({
        transparent:true,
        depthWrite:false,
        side:THREE.DoubleSide,
        uniforms:{uTime:{value:0}},
        vertexShader:`
          varying vec2 vUv;
          void main(){
            vUv=uv;
            gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
          }
        `,
        fragmentShader:`
          precision highp float;
          varying vec2 vUv;
          uniform float uTime;
          float hash(vec2 p){
            p=fract(p*vec2(123.34,456.21));
            p+=dot(p,p+45.32);
            return fract(p.x*p.y);
          }
          float noise(vec2 p){
            vec2 i=floor(p),f=fract(p);
            float a=hash(i),b=hash(i+vec2(1.0,0.0));
            float c=hash(i+vec2(0.0,1.0)),d=hash(i+vec2(1.0,1.0));
            vec2 s=f*f*(3.0-2.0*f);
            return mix(a,b,s.x)+(c-a)*s.y*(1.0-s.x)+(d-b)*s.x*s.y;
          }
          void main(){
            float travel=1.0-vUv.y;
            float edgeFade=smoothstep(0.0,0.022,vUv.x)*smoothstep(0.0,0.022,1.0-vUv.x);
            float fine=noise(vec2(vUv.x*34.0 + sin(travel*6.0)*0.30, travel*7.0-uTime*1.45));
            float longVein=pow(clamp(fine,0.0,1.0),3.2);
            float filament=0.5+0.5*sin(vUv.x*155.0 + travel*8.0 + sin(uTime*1.7)*0.5);
            filament=pow(filament,9.0);
            float lower=smoothstep(0.48,1.0,travel);
            float alpha=(0.020 + longVein*0.075 + filament*0.032*(0.35+0.65*lower))*edgeFade;
            gl_FragColor=vec4(vec3(0.90,0.985,1.0),alpha);
          }
        `
      });
      streakMaterial.toneMapped=true;
      const streakSheet=new THREE.Mesh(sheetGeometry,streakMaterial);
      streakSheet.name='blade-water-longitudinal-streaks';
      streakSheet.position.y=0.0018;
      streakSheet.frustumCulled=false;
      streakSheet.renderOrder=6;
      streakSheet.userData.isRaisedWallWaterFeature=true;
      streakSheet.userData.animate=(_delta,clock) => {
        streakMaterial.uniforms.uTime.value=Number(clock?.elapsedTime)||0;
      };
      root.add(streakSheet);

      // Thin meniscus right at the lip. Keep it restrained: this is a specular
      // highlight, not a glowing neon bar.
      const crestMaterial=new THREE.MeshBasicMaterial({
        color:0xf1fdff,transparent:true,opacity:0.28,depthWrite:false
      });
      const crest=this._addFeatureMesh(
        root,
        new THREE.BoxGeometry(Math.max(0.22,bladeWidth-0.045),0.008,0.008),
        crestMaterial,
        {x:0,y:sheetStartY+0.001,z:sheetStartZ+0.001},
        null,
        'blade-water-crest'
      );
      crest.renderOrder=7;
      crest.userData.isRaisedWallWaterFeature=true;
      crest.userData.animate=(_delta,clock) => {
        const time=Number(clock?.elapsedTime)||0;
        crest.material.opacity=0.25+Math.sin(time*3.1)*0.025;
      };

      // Sparse droplets peel from the lower edge as the sheet loses coherence.
      // Keep point size and opacity low so they read as water, not particles.
      const sprayCount=Math.max(30,Math.round(bladeWidth*28));
      const sprayGeometry=new THREE.BufferGeometry();
      const sprayPositions=new Float32Array(sprayCount*3);
      const spraySeeds=[];
      for (let index=0; index<sprayCount; index+=1) {
        spraySeeds.push({
          x:((index*0.61803398875)%1)-0.5,
          phase:(index*0.754877666)%1,
          speed:0.66+(index%9)*0.025,
          sway:((index*0.41421356237)%1)-0.5,
          lift:0.025+(index%5)*0.008
        });
      }
      sprayGeometry.setAttribute('position',new THREE.BufferAttribute(sprayPositions,3));
      const sprayMaterial=new THREE.ShaderMaterial({
        transparent:true,
        depthWrite:false,
        uniforms:{uColor:{value:new THREE.Color(0xe4faff)},uOpacity:{value:0.34}},
        vertexShader:`
          void main(){
            vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
            gl_PointSize=clamp(48.0/-mvPosition.z,1.2,4.0);
            gl_Position=projectionMatrix*mvPosition;
          }
        `,
        fragmentShader:`
          uniform vec3 uColor;
          uniform float uOpacity;
          void main(){
            float r=length(gl_PointCoord-vec2(0.5));
            float alpha=(1.0-smoothstep(0.10,0.50,r))*uOpacity;
            gl_FragColor=vec4(uColor,alpha);
          }
        `
      });
      sprayMaterial.toneMapped=true;
      const spray=new THREE.Points(sprayGeometry,sprayMaterial);
      spray.name='blade-edge-spray';
      spray.frustumCulled=false;
      spray.renderOrder=7;
      spray.userData.isRaisedWallWaterFeature=true;
      const impactY=sheetStartY+horizontalTravel;
      spray.userData.animate=(_delta,clock) => {
        const time=Number(clock?.elapsedTime)||0;
        const attribute=spray.geometry.attributes.position;
        spraySeeds.forEach((seed,index) => {
          const p=(time*seed.speed+seed.phase)%1;
          const life=Math.sin(Math.PI*p);
          attribute.setXYZ(
            index,
            seed.x*bladeWidth*(0.93+0.035*p),
            impactY + 0.006 + p*0.040 + seed.sway*0.015,
            -drop + 0.020 + seed.lift*life - 0.050*p*p
          );
          if (life<0.05) attribute.setY(index,impactY+0.004);
        });
        attribute.needsUpdate=true;
        spray.material.uniforms.uOpacity.value=0.30+Math.sin(time*2.7)*0.025;
      };
      spray.userData.animate(0,this.clock);
      root.add(spray);

      // Irregular, low-opacity impact foam. The reference effect is a bright
      // broken line where the sheet meets the pool, not a solid glowing disk.
      const impactMaterial=new THREE.ShaderMaterial({
        transparent:true,
        depthWrite:false,
        side:THREE.DoubleSide,
        uniforms:{uTime:{value:0}},
        vertexShader:`
          varying vec2 vUv;
          void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
        `,
        fragmentShader:`
          precision highp float;
          varying vec2 vUv;
          uniform float uTime;
          float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float noise(vec2 p){
            vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
            return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);
          }
          void main(){
            vec2 p=(vUv-0.5)*vec2(2.0,4.5);
            float d=length(p);
            float n=noise(vUv*vec2(15.0,8.0)+vec2(uTime*0.35,-uTime*0.22));
            float broken=smoothstep(0.78,0.28,d + (n-0.5)*0.26);
            float center=smoothstep(0.95,0.15,d);
            float alpha=(0.08+0.18*n)*broken*center;
            gl_FragColor=vec4(vec3(0.91,0.99,1.0),alpha);
          }
        `
      });
      impactMaterial.toneMapped=true;
      const impact=new THREE.Mesh(new THREE.PlaneGeometry(1,1),impactMaterial);
      impact.name='blade-water-impact-foam';
      impact.position.set(0,impactY,-drop+0.012);
      impact.scale.set(Math.max(0.30,bladeWidth*0.72),0.19,1);
      impact.frustumCulled=false;
      impact.renderOrder=4;
      impact.userData.isRaisedWallWaterFeature=true;
      impact.userData.animate=(_delta,clock) => {
        const time=Number(clock?.elapsedTime)||0;
        impactMaterial.uniforms.uTime.value=time;
        const pulse=0.985+Math.sin(time*2.2)*0.025;
        impact.scale.set(Math.max(0.30,bladeWidth*0.72)*pulse,0.19*(2-pulse),1);
      };
      root.add(impact);

      // Subtle surface ripples spreading away from the impact line.
      for (let ringIndex=0; ringIndex<3; ringIndex+=1) {
        const ringMaterial=new THREE.MeshBasicMaterial({
          color:0xdaf7ff,transparent:true,opacity:0.12,depthWrite:false,side:THREE.DoubleSide
        });
        const ring=new THREE.Mesh(new THREE.RingGeometry(0.045,0.057,36),ringMaterial);
        ring.name=`blade-water-impact-ripple-${ringIndex}`;
        ring.position.set(0,impactY,-drop+0.014+ringIndex*0.0004);
        ring.scale.set(Math.max(1.5,bladeWidth*2.0),0.58,1);
        ring.frustumCulled=false;
        ring.renderOrder=4;
        ring.userData.isRaisedWallWaterFeature=true;
        ring.userData.animate=(_delta,clock) => {
          const time=Number(clock?.elapsedTime)||0;
          const p=(time*0.48+ringIndex/3)%1;
          const s=0.75+p*4.4;
          ring.scale.set(Math.max(1.5,bladeWidth*2.0)*s,0.58*s,1);
          ring.material.opacity=Math.pow(1-p,1.7)*0.12;
        };
        root.add(ring);
      }
    } else {
      const featureSpan = Math.min(Math.max(0.9, frame.span * 0.46), 2.4);
      root.userData.featureHalfSpan = featureSpan * 0.5;

      // Wall spouts/scuppers should read as a pressurised, aerated rope of water:
      // coherent at the outlet, gently arcing under gravity, then becoming a
      // little more turbulent immediately before impact. Avoid the old chain of
      // large spheres, which made the flow look like suspended beads.
      [-0.34,0,0.34].forEach((ratio,index) => {
        const x = featureSpan * ratio;

        // Compact architectural stainless-steel spout with a recessed dark slot.
        const backPlate = this._addFeatureMesh(
          root,
          new THREE.BoxGeometry(0.27,0.030,0.17),
          metal.clone(),
          {x,y:-0.018,z:0},
          null,
          `spout-backplate-${index}`
        );
        backPlate.userData.isRaisedWallWaterFeature = true;
        const body = this._addFeatureMesh(
          root,
          new THREE.BoxGeometry(0.24,0.165,0.125),
          metal.clone(),
          {x,y:0.060,z:-0.002},
          null,
          `spout-${index}`
        );
        body.userData.isRaisedWallWaterFeature = true;
        const outletMaterial = this._featureMaterial(0x10171b,{metalness:0.04,roughness:0.54});
        const outletSlot = this._addFeatureMesh(
          root,
          new THREE.BoxGeometry(0.145,0.010,0.031),
          outletMaterial,
          {x,y:0.146,z:-0.022},
          null,
          `spout-outlet-slot-${index}`
        );
        outletSlot.userData.isRaisedWallWaterFeature = true;
        const lowerLip = this._addFeatureMesh(
          root,
          new THREE.BoxGeometry(0.19,0.030,0.012),
          metal.clone(),
          {x,y:0.151,z:-0.044},
          null,
          `spout-lip-${index}`
        );
        lowerLip.userData.isRaisedWallWaterFeature = true;

        const drop = Math.max(0.18, frame.outletZ + 0.10);
        const startY = 0.160;
        const startZ = -0.030;
        const fallDistance = Math.max(0.16, drop + startZ);
        const flightTime = Math.sqrt((2 * fallDistance) / 9.81);
        const outletVelocity = 2.15;
        const horizontalTravel = THREE.MathUtils.clamp(outletVelocity * flightTime, 0.42, 0.82);
        const impactY = startY + horizontalTravel;

        // A quadratic with the control point at the outlet height gives a nearly
        // horizontal initial tangent and a gravity-like z ~= -t^2 fall.
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(x,startY,startZ),
          new THREE.Vector3(x,startY + horizontalTravel * 0.5,startZ),
          new THREE.Vector3(x,impactY,-drop)
        );

        const outerMaterial = createWaterFeatureMaterial({
          transmission:0.66,thickness:0.014,opacity:0.48
        });
        const stream = new THREE.Mesh(
          new THREE.TubeGeometry(curve,72,0.024,10,false),
          outerMaterial
        );
        stream.name = `spout-water-stream-${index}`;
        stream.frustumCulled = false;
        stream.renderOrder = 5;
        stream.userData.isRaisedWallWaterFeature = true;
        stream.userData.animate = (_delta,clock) => {
          const time = Number(clock?.elapsedTime) || 0;
          stream.material.opacity = 0.47 + Math.sin(time*3.1 + index*0.9) * 0.025;
        };
        root.add(stream);

        // Fine moving white veining inside the clear outer stream mimics entrained
        // air without turning the entire jet into an opaque white tube.
        const coreMaterial = new THREE.ShaderMaterial({
          transparent:true,
          depthWrite:false,
          side:THREE.DoubleSide,
          uniforms:{uTime:{value:0}},
          vertexShader:`
            varying vec2 vUv;
            void main(){
              vUv=uv;
              gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
            }
          `,
          fragmentShader:`
            precision highp float;
            varying vec2 vUv;
            uniform float uTime;
            void main(){
              float flowA=0.5+0.5*sin(vUv.x*76.0-uTime*9.2+sin(vUv.y*6.283)*2.1);
              float flowB=0.5+0.5*sin(vUv.x*143.0-uTime*15.0+vUv.y*11.0);
              float aeration=mix(flowA,flowB,0.38);
              float lower=smoothstep(0.55,1.0,vUv.x);
              float alpha=0.055+0.12*aeration+0.10*lower*aeration;
              gl_FragColor=vec4(vec3(0.95,0.995,1.0),alpha);
            }
          `
        });
        coreMaterial.toneMapped = true;
        const core = new THREE.Mesh(
          new THREE.TubeGeometry(curve,72,0.0125,8,false),
          coreMaterial
        );
        core.name = `spout-aerated-core-${index}`;
        core.frustumCulled = false;
        core.renderOrder = 6;
        core.userData.isRaisedWallWaterFeature = true;
        core.userData.animate = (_delta,clock) => {
          coreMaterial.uniforms.uTime.value = Number(clock?.elapsedTime) || 0;
        };
        root.add(core);

        // Tiny entrained-air flecks travel inside the stream. They stay small and
        // mostly contained, unlike the previous oversized bead-like droplets.
        const fleckCount = 22;
        const fleckPositions = new Float32Array(fleckCount*3);
        const fleckGeometry = new THREE.BufferGeometry();
        fleckGeometry.setAttribute('position',new THREE.BufferAttribute(fleckPositions,3));
        const fleckMaterial = new THREE.PointsMaterial({
          color:0xf4fdff,
          size:0.010,
          transparent:true,
          opacity:0.32,
          depthWrite:false,
          sizeAttenuation:true
        });
        const flecks = new THREE.Points(fleckGeometry,fleckMaterial);
        flecks.name = `spout-air-flecks-${index}`;
        flecks.frustumCulled = false;
        flecks.renderOrder = 7;
        flecks.userData.isRaisedWallWaterFeature = true;
        const fleckSeeds = Array.from({length:fleckCount},(_,i) => ({
          phase:i/fleckCount,
          speed:0.42 + (i%5)*0.018,
          a:Math.sin(i*12.9898)*0.5+0.5,
          b:Math.sin(i*7.233+1.7)*0.5+0.5
        }));
        flecks.userData.animate = (_delta,clock) => {
          const time = Number(clock?.elapsedTime) || 0;
          const attribute = flecks.geometry.attributes.position;
          fleckSeeds.forEach((seed,i) => {
            const t = (time*seed.speed + seed.phase + index*0.07) % 1;
            const p = curve.getPoint(t);
            const turbulence = THREE.MathUtils.smoothstep(t,0.62,1.0);
            const jitter = 0.003 + turbulence*0.006;
            attribute.setXYZ(
              i,
              p.x + (seed.a-0.5)*jitter,
              p.y + Math.sin(time*8.0+i*1.9)*jitter*0.45,
              p.z + (seed.b-0.5)*jitter
            );
          });
          attribute.needsUpdate = true;
        };
        flecks.userData.animate(0,this.clock);
        root.add(flecks);

        // Restrict visible breakup to the final part of the fall, where real
        // scupper water starts to feather just before hitting the pool surface.
        const sprayCount = 10;
        const sprayPositions = new Float32Array(sprayCount*3);
        const sprayGeometry = new THREE.BufferGeometry();
        sprayGeometry.setAttribute('position',new THREE.BufferAttribute(sprayPositions,3));
        const sprayMaterial = new THREE.PointsMaterial({
          color:0xf2fcff,
          size:0.012,
          transparent:true,
          opacity:0.26,
          depthWrite:false,
          sizeAttenuation:true
        });
        const spray = new THREE.Points(sprayGeometry,sprayMaterial);
        spray.name = `spout-aerated-droplet-lower-breakup-${index}`;
        spray.frustumCulled = false;
        spray.renderOrder = 7;
        spray.userData.isRaisedWallWaterFeature = true;
        const spraySeeds = Array.from({length:sprayCount},(_,i) => ({
          phase:i/sprayCount,
          side:Math.sin(i*5.17),
          lift:0.014+(i%4)*0.004
        }));
        spray.userData.animate = (_delta,clock) => {
          const time = Number(clock?.elapsedTime) || 0;
          const attribute = spray.geometry.attributes.position;
          spraySeeds.forEach((seed,i) => {
            const q = (time*0.70 + seed.phase + index*0.11) % 1;
            const t = 0.76 + q*0.24;
            const p = curve.getPoint(Math.min(1,t));
            const feather = q*q;
            attribute.setXYZ(
              i,
              p.x + seed.side*0.007*feather,
              p.y + seed.side*0.010*feather,
              p.z + seed.lift*Math.sin(Math.PI*q)*0.35
            );
          });
          attribute.needsUpdate = true;
        };
        spray.userData.animate(0,this.clock);
        root.add(spray);

        // A restrained bright patch and soft expanding rings sell the contact
        // with the pool surface without the previous neon/additive splash.
        const foamMaterial = new THREE.MeshBasicMaterial({
          color:0xf1fcff,
          transparent:true,
          opacity:0.16,
          depthWrite:false,
          side:THREE.DoubleSide
        });
        const foam = new THREE.Mesh(new THREE.CircleGeometry(0.085,28),foamMaterial);
        foam.name = `spout-impact-foam-${index}`;
        foam.position.set(x,impactY,-drop+0.012);
        foam.scale.set(1.15,0.72,1);
        foam.frustumCulled = false;
        foam.renderOrder = 4;
        foam.userData.isRaisedWallWaterFeature = true;
        foam.userData.animate = (_delta,clock) => {
          const time = Number(clock?.elapsedTime) || 0;
          const pulse = 0.96 + Math.sin(time*4.0 + index)*0.05;
          foam.scale.set(1.15*pulse,0.72*(2-pulse),1);
          foam.material.opacity = 0.13 + Math.sin(time*3.3+index*0.8)*0.025;
        };
        root.add(foam);

        const rippleMaterial = new THREE.MeshBasicMaterial({
          color:0xdff8ff,
          transparent:true,
          opacity:0.13,
          depthWrite:false,
          side:THREE.DoubleSide
        });
        this._addWaterImpactAnimation(root,x,impactY,-drop+0.014,rippleMaterial,index+1);
      });
    }
    this._positionRaisedWallWaterFeatureRoot(root,frame,Number.isFinite(savedT)?savedT:0.5,true);
    group.add(root);
  }

  setBladeLength(length, { captureUndo = true } = {}) {
    const allowed = [0.3,0.6,0.9,1.2,1.8,2.1];
    const requested = Number(length);
    const next = allowed.reduce((best, value) => Math.abs(value-requested) < Math.abs(best-requested) ? value : best, 1.2);
    if (captureUndo) this.captureUndoState?.('Change blade length');
    this.bladeLength = next;
    const keepPinned = !!this._bladeLengthSceneControl?.pinned;
    if (this.poolFeatures.has('blade-water-features')) this.rebuildPoolFeatures();
    if (keepPinned && this._bladeLengthSceneControl) {
      let replacement = null;
      this.poolFeatureGroup?.traverse?.((object) => {
        if (!replacement && object?.userData?.isRaisedWallWaterFeatureRoot && object.userData.featureType === 'blade') replacement = object;
      });
      this._bladeLengthSceneControl.root = replacement;
      this._bladeLengthSceneControl.pinned = !!replacement;
      this._updateBladeLengthSceneControl();
    }
    this._notifyDesignerStateChanged?.();
  }

  _updateBladeLengthSceneControl() {
    const control = this._bladeLengthSceneControl;
    const root = control?.root;
    if (!control?.button || !root || !root.parent || !this.camera || !this.renderer?.domElement) {
      if (control?.button) control.button.style.display='none';
      if (control?.menu) control.menu.style.display='none';
      return;
    }
    const rect=this.renderer.domElement.getBoundingClientRect();
    const projected=root.getWorldPosition(new THREE.Vector3()).project(this.camera);
    if (projected.z < -1 || projected.z > 1) {
      control.button.style.display='none'; control.menu.style.display='none'; return;
    }
    const x=rect.left+(projected.x*0.5+0.5)*rect.width;
    const y=rect.top+(-projected.y*0.5+0.5)*rect.height-30;
    control.button.style.left=`${Math.round(x-14)}px`;
    control.button.style.top=`${Math.round(y-14)}px`;
    control.button.style.display='grid';
    if (control.menu.style.display !== 'none') {
      control.menu.style.left=`${Math.round(Math.min(window.innerWidth-142,x+18))}px`;
      control.menu.style.top=`${Math.round(Math.min(window.innerHeight-230,y-4))}px`;
    }
  }

  setupRaisedWallWaterFeatureDragging() {
    if (this._raisedWallWaterFeatureDraggingSetup || !this.renderer?.domElement || !this.camera) return;
    this._raisedWallWaterFeatureDraggingSetup = true;
    const dom = this.renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const bladePicker = document.createElement('button');
    bladePicker.type='button';
    bladePicker.className='blade-length-scene-picker';
    bladePicker.setAttribute('aria-label','Choose blade length');
    bladePicker.textContent='⌄';
    Object.assign(bladePicker.style,{position:'fixed',zIndex:'5000',display:'none',placeItems:'center',width:'28px',height:'28px',padding:'0 0 5px',border:'1px solid rgba(21,86,111,.55)',borderRadius:'50%',background:'rgba(255,255,255,.92)',color:'#15566f',font:'700 20px/1 Inter,Arial,sans-serif',boxShadow:'0 5px 16px rgba(0,0,0,.16)',cursor:'pointer'});
    const bladeMenu=document.createElement('div');
    Object.assign(bladeMenu.style,{position:'fixed',zIndex:'5001',display:'none',width:'124px',padding:'6px',border:'1px solid rgba(21,86,111,.28)',borderRadius:'10px',background:'rgba(255,255,255,.97)',boxShadow:'0 8px 24px rgba(0,0,0,.18)'});
    [0.3,0.6,0.9,1.2,1.8,2.1].forEach(value=>{
      const option=document.createElement('button');
      option.type='button'; option.textContent=`${Math.round(value*1000)} mm`;
      Object.assign(option.style,{display:'block',width:'100%',padding:'7px 8px',border:'0',borderRadius:'6px',background:'transparent',textAlign:'left',font:'600 12px Inter,Arial,sans-serif',cursor:'pointer'});
      option.addEventListener('pointerenter',()=>{option.style.background='#eaf4f7';});
      option.addEventListener('pointerleave',()=>{option.style.background='transparent';});
      option.addEventListener('click',(event)=>{event.stopPropagation();this.setBladeLength(value,{captureUndo:true});bladeMenu.style.display='none';});
      bladeMenu.appendChild(option);
    });
    document.body.append(bladePicker,bladeMenu);
    this._bladeLengthSceneControl={button:bladePicker,menu:bladeMenu,root:null,pinned:false};
    [bladePicker,bladeMenu].forEach(element=>element.addEventListener('pointerdown',event=>event.stopPropagation()));
    bladePicker.addEventListener('click',(event)=>{event.stopPropagation();bladeMenu.style.display=bladeMenu.style.display==='none'?'block':'none';this._updateBladeLengthSceneControl();});
    const showBladeControl = (root, pinned = false) => {
      if (!root || root.userData?.featureType!=='blade') return;
      this._bladeLengthSceneControl.root=root;
      this._bladeLengthSceneControl.pinned=!!pinned;
      this._updateBladeLengthSceneControl();
    };
    const hideBladeControl = () => {
      bladeMenu.style.display='none';
      this._bladeLengthSceneControl.root=null;
      this._bladeLengthSceneControl.pinned=false;
      this._updateBladeLengthSceneControl();
    };
    const findRoot = (object) => {
      let current = object;
      while (current && current !== this.poolFeatureGroup) {
        if (current.userData?.isRaisedWallWaterFeatureRoot) return current;
        current = current.parent;
      }
      return null;
    };
    const hitFeature = (event) => {
      const rect = dom.getBoundingClientRect();
      pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
      raycaster.setFromCamera(pointer,this.camera);
      const candidates = [];
      this.poolFeatureGroup?.traverse?.((object) => { if (object?.isMesh && object.userData?.isRaisedWallWaterFeature) candidates.push(object); });
      const hit = candidates.length ? raycaster.intersectObjects(candidates,false)[0] : null;
      return hit ? findRoot(hit.object) : null;
    };
    dom.addEventListener('pointerdown',(event) => {
      if (event.button !== 0 || !this.poolFeatureGroup || this.customizeMode) return;
      const root = hitFeature(event);
      if (!root) { hideBladeControl(); return; }
      if (root.userData.featureType === 'blade') {
        showBladeControl(root,true);
      } else hideBladeControl();
      event.preventDefault?.(); event.stopPropagation?.(); event.stopImmediatePropagation?.();
      this.captureUndoState?.(`Move ${root.userData.featureType} water feature`);
      const previousControlsEnabled = this.controls ? this.controls.enabled !== false : null;
      if (this.controls) this.controls.enabled = false;
      this.raisedWallWaterFeatureDrag = { pointerId:event.pointerId,root,frame:root.userData.wallFrame,previousControlsEnabled };
      dom.setPointerCapture?.(event.pointerId); dom.style.cursor='grabbing';
    },true);
    dom.addEventListener('pointermove',(event) => {
      const drag = this.raisedWallWaterFeatureDrag;
      if (!drag) return;
      if (event.pointerId !== drag.pointerId || !drag.frame) return;
      event.preventDefault?.(); event.stopPropagation?.(); event.stopImmediatePropagation?.();
      const worldZ = this.poolGroup.getWorldPosition(new THREE.Vector3()).z + drag.frame.outletZ;
      const worldPoint = this._screenToPlanePoint(event.clientX,event.clientY,worldZ);
      if (!worldPoint) return;
      const local = this.poolGroup.worldToLocal(worldPoint.clone());
      const target = new THREE.Vector2(local.x,local.y);
      const t = target.clone().sub(drag.frame.a).dot(new THREE.Vector2(drag.frame.tangent.x,drag.frame.tangent.y)) / drag.frame.span;
      this._positionRaisedWallWaterFeatureRoot(drag.root,drag.frame,t,true);
    },true);
    const finish = (event) => {
      const drag = this.raisedWallWaterFeatureDrag;
      if (!drag || event.pointerId !== drag.pointerId) return;
      this.raisedWallWaterFeatureDrag = null;
      try { dom.releasePointerCapture?.(event.pointerId); } catch (_) {}
      dom.style.cursor='';
      if (this.controls && drag.previousControlsEnabled !== null) this.controls.enabled=drag.previousControlsEnabled;
      this._notifyDesignerStateChanged?.();
    };
    dom.addEventListener('pointerup',finish,true);
    dom.addEventListener('pointercancel',finish,true);
    document.addEventListener('pointerdown',(event) => {
      if (bladePicker.contains(event.target) || bladeMenu.contains(event.target) || dom.contains(event.target)) return;
      hideBladeControl();
    },true);
  }

  _createWetEdgeSystem(group, length, width) {
    const tankWidth = 0.30;
    const shell = 0.20;
    const poolWaterZ = this._getPoolWaterSurfaceLocalZ(-0.10);
    const tankWaterZ = Math.min(poolWaterZ - 0.16, -0.24);
    const wallDepth = Math.max(0.6, Number(this.poolParams?.deep) || 1.8, Number(this.poolParams?.shallow) || 1.2);
    const tile = this._getPoolTileMaterial?.()?.clone?.() || new THREE.MeshStandardMaterial({ color:0x87c9dc, roughness:0.58 });
    tile.side = THREE.DoubleSide;
    const water = createWaterFeatureMaterial({transmission:0.38,opacity:0.50,roughness:0.025});

    const coping = this.poolGroup?.userData?.copingSegments;
    const copingMeshes = Array.isArray(coping) ? coping : Object.values(coping || {});
    copingMeshes.filter(Boolean).forEach(mesh => { mesh.visible = false; mesh.userData.wetEdgeSuppressed = true; });

    // The wet-edge shell is one continuous four-sided overflow wall. Suppress
    // the authored full-height walls and replace them with a common lowered
    // liner so every spill edge has the same 100 mm reveal and no doubled skin.
    const authoredWalls = [];
    this.poolGroup?.traverse?.((object) => {
      if (object?.isMesh && object.userData?.isWall && !object.userData?.isPoolFeature) {
        authoredWalls.push(object);
        object.visible = false;
        object.userData.wetEdgeSuppressed = true;
      }
    });
    const loweredTop = poolWaterZ - 0.01;
    const loweredHeight = Math.max(0.20, wallDepth + loweredTop);
    const loweredZ = (-wallDepth + loweredTop) * 0.5;
    const addLoweredWall = (name, sx, sy, x, y) => {
      const mesh = this._addFeatureMesh(group, new THREE.BoxGeometry(sx,sy,loweredHeight), tile.clone(), {x,y,z:loweredZ}, null, `wet-edge-${name}-lowered-wall`);
      mesh.userData.isWall = true;
      mesh.userData.isInfinityCatchSurface = true;
      mesh.userData.forceVerticalUV = true;
      try { this.updateScaledBoxTilingUVs(mesh); } catch (_) {}
    };
    addLoweredWall('north',length+shell*2,shell,0,width*0.5+shell*0.5);
    addLoweredWall('south',length+shell*2,shell,0,-width*0.5-shell*0.5);
    addLoweredWall('east',shell,width, length*0.5+shell*0.5,0);
    addLoweredWall('west',shell,width,-length*0.5-shell*0.5,0);

    const sides = [
      { name:'north', span:length + (shell+tankWidth)*2, x:0, y: width*0.5 + shell + tankWidth*0.5, sx:1, sy:0, nx:0,ny:1 },
      { name:'south', span:length + (shell+tankWidth)*2, x:0, y:-width*0.5 - shell - tankWidth*0.5, sx:1, sy:0, nx:0,ny:-1 },
      { name:'east',  span:width + shell*2, x: length*0.5 + shell + tankWidth*0.5, y:0, sx:0, sy:1, nx:1,ny:0 },
      { name:'west',  span:width + shell*2, x:-length*0.5 - shell - tankWidth*0.5, y:0, sx:0, sy:1, nx:-1,ny:0 }
    ];
    const ground = this.ground || this.scene?.userData?.ground;
    if (ground) {
      const existing = Array.isArray(ground.userData.extraGroundVoids)
        ? ground.userData.extraGroundVoids.filter(entry => !String(entry?.name || '').startsWith('wet-edge-tank-'))
        : [];
      const tankVoids = sides.map(side => {
        const halfX = (side.sx ? side.span : tankWidth) * 0.5 + 0.015;
        const halfY = (side.sy ? side.span : tankWidth) * 0.5 + 0.015;
        return {
          name:`wet-edge-tank-${side.name}`,
          points:[
            {x:side.x-halfX,y:side.y-halfY},
            {x:side.x+halfX,y:side.y-halfY},
            {x:side.x+halfX,y:side.y+halfY},
            {x:side.x-halfX,y:side.y+halfY}
          ]
        };
      });
      ground.userData.extraGroundVoids = [...existing, ...tankVoids];
    }
    sides.forEach(side => {
      const sizeX = side.sx ? side.span : tankWidth;
      const sizeY = side.sy ? side.span : tankWidth;
      const floor = this._addFeatureMesh(group, new THREE.BoxGeometry(sizeX,sizeY,0.10), tile.clone(), {x:side.x,y:side.y,z:-0.56}, null, `wet-edge-${side.name}-tank-floor`);
      floor.userData.isInfinityCatchSurface = true;
      const surface = this._addFeatureMesh(group, new THREE.PlaneGeometry(sizeX,sizeY), water.clone(), {x:side.x,y:side.y,z:tankWaterZ}, null, `wet-edge-${side.name}-water`);
      surface.userData.isInfinityWater = true;
      surface.renderOrder = 7;

      const outerX = side.x + side.nx * (tankWidth*0.5 + shell*0.5);
      const outerY = side.y + side.ny * (tankWidth*0.5 + shell*0.5);
      const outerSizeX = side.sx ? side.span : shell;
      const outerSizeY = side.sy ? side.span : shell;
      const outerHeight = Math.max(0.30, -tankWaterZ + 0.10);
      const outerWall = this._addFeatureMesh(group,new THREE.BoxGeometry(outerSizeX,outerSizeY,outerHeight),tile.clone(),{x:outerX,y:outerY,z:-outerHeight*0.5},null,`wet-edge-${side.name}-outer-wall`);
      outerWall.userData.isWall=true;
      outerWall.userData.isInfinityCatchSurface=true;
      outerWall.userData.forceVerticalUV=true;
      try { this.updateScaledBoxTilingUVs(outerWall); } catch (_) {}

      const sheetSpan = side.sx ? length : width;
      const sheetHeight = Math.max(0.04, poolWaterZ-tankWaterZ);
      const sheet = this._addFeatureMesh(
        group,
        new THREE.PlaneGeometry(sheetSpan,sheetHeight,Math.max(12,Math.ceil(sheetSpan*10)),6),
        water.clone(),
        {
          x: side.sx ? 0 : side.nx*(length*0.5+shell+0.004),
          y: side.sy ? 0 : side.ny*(width*0.5+shell+0.004),
          z: tankWaterZ+sheetHeight*0.5
        },
        {x:Math.PI*0.5,y:0,z:side.sy?Math.PI*0.5:0},
        `wet-edge-${side.name}-spill-sheet`
      );
      sheet.userData.isInfinityWater=true;
      sheet.userData.isInfinitySpillover=true;
      sheet.frustumCulled=false;
    });
  }

  rebuildPoolFeatures() {
    this._restoreInfinityEdgeCoping?.();
    this._restoreInfinityWallVoid?.();
    this._restoreAcrylicWindowWallCut?.();
    this._disposePoolFeatureGroup();
    if (!this.poolGroup) return;
    const availability = this.getPoolFeatureAvailability();
    [...this.poolFeatures].forEach(feature => { if (availability[feature] === false) this.poolFeatures.delete(feature); });
    const group = new THREE.Group();
    group.name = 'pool-features'; group.userData.isPoolFeatureGroup = true;
    const length = Number(this.poolParams.length || 8);
    const width = Number(this.poolParams.width || 4);
    // Pool and spa lights are standard safety/visualisation elements rather
    // than optional features. Recreate them whenever dependent geometry changes.
    this._createAutomaticPoolLights(group,length,width);
    this._ensureAutomaticSpaLight?.();
    if (String(this.poolParams?.shape || '').toLowerCase() === 'wet-edge') this._createWetEdgeSystem(group,length,width);
    if (this.poolFeatures.has('bar-stools')) this._createBarStools(group,length,width);
    if (this.poolFeatures.has('laminar-jets')) this._createLaminarJets(group,length,width);
    if (this.poolFeatures.has('bubblers')) this._createBubblers(group,length,width);
    if (this.poolFeatures.has('acrylic-window')) this._createAcrylicWindow(group,length,width);
    if (this.poolFeatures.has('infinity-edge') && String(this.poolParams?.shape || '').toLowerCase() !== 'wet-edge') this._createInfinityEdge(group,length,width);
    if (this.poolFeatures.has('spout-water-features')) this._createWaterFeatureWall(group,length,width,false);
    if (this.poolFeatures.has('blade-water-features')) this._createWaterFeatureWall(group,length,width,true);
    this.poolGroup.add(group); this.poolFeatureGroup = group;
    // Feature-generated tank, return, replacement and liner meshes must use the
    // exact same active tile material as the authored pool shell.
    this._synchronizePoolTileMaterials();
    if (!Array.isArray(this.poolGroup.userData.animatables)) this.poolGroup.userData.animatables = [];
    group.traverse((object) => {
      if (typeof object?.userData?.animate === 'function' && !this.poolGroup.userData.animatables.includes(object)) {
        this.poolGroup.userData.animatables.push(object);
      }
    });
    this._updateOvalInfinityHandles?.();
    this._updateLInfinityHandles?.();
    this._updateStraightInfinityHandles?.();
    this._syncInternalFeatureControls?.();
    try {
      updateGroundVoid(this.ground || this.scene?.userData?.ground, this.poolGroup, this.spa);
      this.applyPoolElevation?.();
    } catch (_) {}
  }

  setPoolFeature(feature, enabled) {
    const valid = new Set(['bar-stools','laminar-jets','bubblers','acrylic-window','infinity-edge','spout-water-features','blade-water-features']);
    if (!valid.has(feature)) return false;
    const availability = this.getPoolFeatureAvailability();
    if (enabled && availability[feature] === false) return false;
    const wasEnabled = this.poolFeatures.has(feature);
    if (enabled && !wasEnabled && feature === 'infinity-edge' && (this.poolParams?.shape === 'rectangular' || this.poolParams?.shape === 'L')) {
      this.lInfinityRange = null;
    }
    if (enabled) this.poolFeatures.add(feature); else this.poolFeatures.delete(feature);
    this.rebuildPoolFeatures(); this._updateOvalInfinityHandles?.(); this._updateLInfinityHandles?.(); this._updateStraightInfinityHandles?.(); this._notifyDesignerStateChanged?.(); return true;
  }

  // --------------------------------------------------------------
  // REBUILD POOL
  // --------------------------------------------------------------
  async rebuildPoolForCurrentShape() {
    // Construction-safe minimums: every tread/bench projection and the clear
    // distance to the next element is at least 250 mm.
    this.poolParams.stepDepth = Math.max(0.25, Number(this.poolParams.stepDepth) || 0.25);
    this.poolParams.stepExtension = Math.max(0.25, Number(this.poolParams.stepExtension) || 0.25);
    // The front edge of the top 300 mm tread must remain at least 250 mm
    // behind the front edge of the bench below it.
    this.poolParams.bench2Extension = Math.max(0.55, Number(this.poolParams.bench2Extension) || 0.60);
    this.poolParams.diagonalStepSize = Math.max(0.25, Number(this.poolParams.diagonalStepSize) || 0.25);
    if (this.poolGroup) {
      this._removePoolGroupSafely(this.poolGroup);
    }

    let group;

    if (this.isPolygonShape()) {
      if (!this.editablePolygon) {
        this.editablePolygon = EditablePolygon.fromRectangle(
          this.poolParams.length,
          this.poolParams.width
        );
        this.editablePolygon.isRectangular = true;
        this.editablePolygon.minVertices = 3;
      }

      group = createPoolGroup(
        this.poolParams,
        this.tileSize,
        this.editablePolygon
      );
    } else {
      this.editablePolygon = null;
      this.destroyPoolEditor();

      const shape = this.poolParams.shape;

      if (shape === "rectangular")
        group = createRectanglePool(this.poolParams, this.tileSize);
      else if (["lap", "plunge", "wet-edge"].includes(shape)) {
        group = createRectanglePool({ ...this.poolParams, shape:"rectangular" }, this.tileSize);
        group.userData.designShape = shape;
        if (group.userData.poolParams) group.userData.poolParams.shape = shape;
      }
      else if (shape === "oval")
        group = createOvalPool(this.poolParams, this.tileSize);
      else if (shape === "kidney")
        group = createKidneyPool(this.poolParams, this.tileSize);
      else if (shape === "L")
        group = createLShapePool(this.poolParams, this.tileSize);
      else group = createRectanglePool(this.poolParams, this.tileSize);
    }

    this.poolGroup = group;

    // Ensure fixed tile density + snapped grout after any rebuild (shape/params)
    this.rebakePoolTilingUVs();

    if (this.scene && this.poolGroup) {
      this.scene.add(this.poolGroup);
      this.applyPoolElevation();
      updateGroundVoid(this.ground || this.scene.userData.ground, this.poolGroup, this.spa);
      updateGrassForPool(this.scene, this.poolGroup);
      // updateGroundVoid rebuilds the standard paving mesh. Reapply the raised
      // state afterwards so the new paving is hidden and the entry platform is
      // regenerated against the new pool shape at the correct elevation.
      this.applyPoolElevation();
    }

    if (this.pbrManager && this.poolGroup) {
      this.pbrManager.setPoolGroup(this.poolGroup);
      this.pbrManager.updatePoolParamsRef(this.poolParams);
      if (this.poolParams?.tileColor) this.pbrManager.currentTileKey = this.poolParams.tileColor;
      await this.pbrManager.applyCurrentToGroup();
    }

    if (this.spa && this.poolGroup) {
      this.spa.userData.poolGroup = this.poolGroup || null;
      this.spa.userData.poolParams = this.poolParams;
      snapToPool(this.spa);
      updateSpa(this.spa);
      this.applyPoolElevation();
      if (this.pbrManager) await this.pbrManager.applyTilesToSpa(this.spa);
      this._refreshSpaDependentGeometry({ resnapSpa: true });
      this.applyPoolElevation();
    }

    this._clearEntryWallRaiseState();
    this._reapplySavedWallRaiseState();

    if (this.poolParams.shape === "freeform" && this.editablePolygon) {
      this.setupPoolEditor();
    } else {
      this.destroyPoolEditor();
    }

    if (this.sectionViewEnabled) {
      await this._refreshSectionViewAfterGeometryEdit({ moveCamera: false, fullReset: true });
    }

    // Clear step selection and notify UI
    const hadSelection = !!this.selectedStep;
    this.clearHoverHighlight();
    this.clearSelectedHighlight();
    if (hadSelection) {
      document.dispatchEvent(new CustomEvent("stepSelectionCleared"));
      document.dispatchEvent(new CustomEvent("stepsPanelClosed"));
      this.restoreWater();
    }

    // Clear wall selection and notify UI
    const hadWallSel = !!this.selectedWall;
    this.clearWallHoverHighlight();
    this.clearWallSelectedHighlight();
    if (hadWallSel) {
      document.dispatchEvent(new CustomEvent("wallSelectionCleared"));
    }

    if (!this.spa) {
      this.selectedSpa = null;
    this.hoveredSpa = null;
    this.hoverSpaHighlight = null;
    this.selectedSpaHighlight = null;
      setSelectedSpa(null);
    }

    // If steps panel currently open (from UI), keep water ghosted
    const stepsPanel = document.getElementById("panel-steps");
    if (stepsPanel?.classList.contains("open")) this.ghostifyWater();

    // Reset any preview scaling and capture baseline params after an expensive rebuild
    try { this.poolGroup.scale.set(1, 1, 1); } catch (_) {}
    this._live.baseParams = { ...this.poolParams };
    this._live.commitNeeded = false;
    this._live.dirty.clear();
    this.rebuildPoolFeatures();
    if (this.spa) this._refreshSpaDependentGeometry({ resnapSpa: true });

    // Caustics v14 back-projects submerged receivers to one horizontal water plane and derives brightness from differential refracted-ray focusing.
    // Refresh the water/receiver relationship after every geometry rebuild, then
    // attach overlays to any newly-created floor/wall/step/bench meshes.
    try {
      this.caustics?.setPrimaryGroup?.(this.poolGroup);
      this.caustics?.attachToGroup?.(this.poolGroup);
    } catch (err) {
      console.warn('[PoolApp] caustics domain refresh failed', err);
    }
  }


  // --------------------------------------------------------------
  // STARTER PRESET SCREEN
  // --------------------------------------------------------------
  setupStarterPresetScreen() {
    const overlay = document.getElementById("starterPresetOverlay");
    const grid = document.getElementById("starterPresetGrid");
    if (!overlay || !grid || grid.dataset.initialized === "true") return;

    grid.dataset.initialized = "true";
    grid.innerHTML = "";

    STARTER_POOL_PRESETS.forEach((preset) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "starter-card";
      card.dataset.presetId = preset.id;
      card.dataset.preview = preset.preview || "rectangle";
      card.dataset.spa = preset.spa ? "true" : "false";
      if (preset.spa?.shape) card.dataset.spaShape = preset.spa.shape;
      card.innerHTML = `
        <div class="starter-preview" aria-hidden="true"></div>
        <div class="starter-card-body">
          <h2 class="starter-card-title">${preset.title}</h2>
          <p class="starter-card-desc">${preset.description}</p>
          <span class="starter-card-action">Start Design</span>
        </div>
      `;

      card.addEventListener("click", async () => {
        card.disabled = true;
        try {
          await this.applyStarterPreset(preset);
          overlay.classList.add("hidden");
        } catch (err) {
          console.error("[PoolApp] Failed to apply starter preset", preset, err);
          card.disabled = false;
        }
      });

      grid.appendChild(card);
    });
  }

  async applyStarterPreset(preset) {
    if (!preset) return;

    if (this.sectionViewEnabled) {
      try { await this.setSectionViewEnabled(false); } catch (_) {}
    }

    this.captureUndoState?.(`Starter preset: ${preset.title || preset.id}`);
    this.destroyPoolEditor();
    this._purgePoolEditorHandles?.();
    this.clearHoverHighlight?.();
    this.clearSelectedHighlight?.();
    this.clearWallHoverHighlight?.();
    this.clearWallSelectedHighlight?.();
    this.clearSpaHoverHighlight?.();
    this.clearSpaSelectedHighlight?.();

    if (this.spa) {
      this.removeSpa();
    }

    this.poolParams = {
      ...this.poolParams,
      ...this.normalizeStarterPresetParams(preset.params || {})
    };

    const recoveryState = preset?.recoveryState || null;
    const starterFootprint = recoveryState?.editablePolygon
      ? null
      : this.createStarterFootprintPolygon(preset);
    this.baseShapeType = this.poolParams.shape;
    if (recoveryState?.editablePolygon) {
      this._restoreEditablePolygon(recoveryState.editablePolygon);
      this.isCustomShape = true;
    } else {
      this.isCustomShape = !!starterFootprint;
      this.editablePolygon = starterFootprint;
    }
    this.wallRaiseBySourceEdge = JSON.parse(JSON.stringify(recoveryState?.wallRaiseBySourceEdge || {}));
    this.barStoolPlacements = JSON.parse(JSON.stringify(recoveryState?.barStoolPlacements || null));
    this.raisedWallWaterFeaturePlacements = JSON.parse(JSON.stringify(recoveryState?.raisedWallWaterFeaturePlacements || {}));
    this.acrylicWindowState = JSON.parse(JSON.stringify(recoveryState?.acrylicWindow || { length:1.8, height:0.8, placement:null }));
    this.bladeLength = Number(recoveryState?.bladeLength || 1.2);
    this.poolFeatures = new Set(Array.isArray(recoveryState?.features) ? recoveryState.features : []);
    this.tileFaceSize = Number(recoveryState?.tileFaceSize) === 23 ? 23 : 48;
    await this.pbrManager?.setTileFaceSize?.(this.tileFaceSize, { apply:false });
    this.selectedStep = null;
    this.selectedWall = null;

    this.updateShapeUIVisibility();
    this.syncSlidersFromParams();
    this.refreshDisplayedShapeLabel();

    await this.rebuildPoolForCurrentShape();

    if (preset.spa) {
      const spaShapeSelect = document.getElementById("spaShape");
      if (spaShapeSelect) spaShapeSelect.value = preset.spa.shape === "circular" ? "circular" : "square";
      this.refreshSpaDimensionLabels();
      await this.addSpa();

      const nextLength = Number(preset.spa.length ?? preset.spa.width ?? this.spa?.userData?.spaLength ?? 2);
      const nextWidth = Number(preset.spa.width ?? preset.spa.length ?? this.spa?.userData?.spaWidth ?? 2);
      if (this.spa) {
        this.spa.userData.spaShape = preset.spa.shape === "circular" ? "circular" : "square";
        this.spa.userData.spaLength = Number.isFinite(nextLength) ? nextLength : 2;
        this.spa.userData.spaWidth = Number.isFinite(nextWidth) ? nextWidth : 2;
        updateSpa(this.spa);
      this.applyPoolElevation();
        snapToPool(this.spa);
        if (Number.isFinite(Number(preset.spa.x)) && Number.isFinite(Number(preset.spa.y))) {
          this.spa.position.x = Number(preset.spa.x);
          this.spa.position.y = Number(preset.spa.y);
        }
        updateSpa(this.spa);
      this.applyPoolElevation();
        if (Number.isFinite(Number(preset.spa.topHeight))) {
          setSpaTopOffset(this.spa, Number(preset.spa.topHeight));
        }
      }

      const spaBtn = document.getElementById("addRemoveSpa");
      if (spaBtn) spaBtn.textContent = "Remove Spa";
      this.setSpaSlidersEnabled(true);
      this.syncSpaSliderValuesFromSpa();
      try { await this.pbrManager?.applyTilesToSpa?.(this.spa); } catch (_) {}
      try { updatePoolWaterVoid(this.poolGroup, this.spa); } catch (_) {}
      try { updateGroundVoid(this.ground || this.scene?.userData?.ground, this.poolGroup, this.spa); } catch (_) {}
    } else {
      const spaShapeSelect = document.getElementById("spaShape");
      if (spaShapeSelect) spaShapeSelect.value = "square";
      const spaBtn = document.getElementById("addRemoveSpa");
      if (spaBtn) spaBtn.textContent = "Add Spa";
      this.setSpaSlidersEnabled(false);
      this.refreshSpaDimensionLabels();
    }

    this._updateDimensionHandles();
    this._updateOvalInfinityHandles();
    this._updateLInfinityHandles?.();
    this._updateStraightInfinityHandles?.();
    this._updateSpaDimensionHandles();
    this._updateSectionDimensionHandles();
    this._updateBladeLengthSceneControl?.();
    this._updateHandleRevealOpacity?.();
    this.syncPoolRaisedControl();
    this.openStarterModelView(preset);
  }

  syncSpaSliderValuesFromSpa() {
    if (!this.spa) return;
    const length = Number(this.spa.userData?.spaLength ?? 2);
    const width = Number(this.spa.userData?.spaWidth ?? 2);
    const lengthSlider = document.getElementById("spaLength");
    const widthSlider = document.getElementById("spaWidth");
    const lengthOutput = document.getElementById("spaLength-val");
    const widthOutput = document.getElementById("spaWidth-val");

    if (lengthSlider) lengthSlider.value = String(length);
    if (widthSlider) widthSlider.value = String(width);
    if (lengthOutput) lengthOutput.textContent = length.toFixed(2) + " m";
    if (widthOutput) widthOutput.textContent = width.toFixed(2) + " m";

    this.refreshSpaDimensionLabels();
    this.refreshSpaTopOffsetSlider();
  }

  async applyStarterSpaAfterInitialBuild(starterSpa) {
    if (!starterSpa) return;

    const spaShapeSelect = document.getElementById("spaShape");
    if (spaShapeSelect) spaShapeSelect.value = starterSpa.shape === "circular" ? "circular" : "square";

    this.refreshSpaDimensionLabels();
    await this.addSpa();

    const nextLength = Number(starterSpa.length ?? starterSpa.width ?? this.spa?.userData?.spaLength ?? 2);
    const nextWidth = Number(starterSpa.width ?? starterSpa.length ?? this.spa?.userData?.spaWidth ?? 2);
    if (this.spa) {
      this.spa.userData.spaShape = starterSpa.shape === "circular" ? "circular" : "square";
      this.spa.userData.spaLength = Number.isFinite(nextLength) ? nextLength : 2;
      this.spa.userData.spaWidth = Number.isFinite(nextWidth) ? nextWidth : 2;
      updateSpa(this.spa);
      this.applyPoolElevation();
      snapToPool(this.spa);
      if (Number.isFinite(Number(starterSpa.x)) && Number.isFinite(Number(starterSpa.y))) {
        this.spa.position.x = Number(starterSpa.x);
        this.spa.position.y = Number(starterSpa.y);
      }
      updateSpa(this.spa);
      this.applyPoolElevation();
      if (Number.isFinite(Number(starterSpa.topHeight))) {
        setSpaTopOffset(this.spa, Number(starterSpa.topHeight));
      }
    }

    const spaBtn = document.getElementById("addRemoveSpa");
    if (spaBtn) spaBtn.textContent = "Remove Spa";
    this.setSpaSlidersEnabled(true);
    this.syncSpaSliderValuesFromSpa();
    try { await this.pbrManager?.applyTilesToSpa?.(this.spa); } catch (_) {}
    try { updatePoolWaterVoid(this.poolGroup, this.spa); } catch (_) {}
    try { updateGroundVoid(this.ground || this.scene?.userData?.ground, this.poolGroup, this.spa); } catch (_) {}
  }

  // --------------------------------------------------------------
  // START
  // --------------------------------------------------------------
  async start(options = {}) {
    const starterPreset = options?.starterPreset || null;
    const starterSpa = starterPreset?.spa || null;

    if (starterPreset?.params) {
      this.poolParams = {
        ...this.poolParams,
        ...this.normalizeStarterPresetParams(starterPreset.params)
      };
      const recoveryState = starterPreset?.recoveryState || null;
      const starterFootprint = recoveryState?.editablePolygon
        ? null
        : this.createStarterFootprintPolygon(starterPreset);
      this.baseShapeType = this.poolParams.shape;
      if (recoveryState?.editablePolygon) {
        this._restoreEditablePolygon(recoveryState.editablePolygon);
        this.isCustomShape = true;
      } else {
        this.isCustomShape = !!starterFootprint;
        this.editablePolygon = starterFootprint;
      }
      this.wallRaiseBySourceEdge = JSON.parse(JSON.stringify(recoveryState?.wallRaiseBySourceEdge || {}));
      this.barStoolPlacements = JSON.parse(JSON.stringify(recoveryState?.barStoolPlacements || null));
      this.raisedWallWaterFeaturePlacements = JSON.parse(JSON.stringify(recoveryState?.raisedWallWaterFeaturePlacements || {}));
      this.acrylicWindowState = JSON.parse(JSON.stringify(recoveryState?.acrylicWindow || { length:1.8, height:0.8, placement:null }));
      this.bladeLength = Number(recoveryState?.bladeLength || 1.2);
      this.poolFeatures = new Set(Array.isArray(recoveryState?.features) ? recoveryState.features : []);
      this.tileFaceSize = Number(recoveryState?.tileFaceSize) === 23 ? 23 : 48;
    }

    setupSidePanels();

    const { scene, camera, renderer, ground, controls } = await initScene();
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.ground = ground;
    this.controls = controls;
    this.clock = new THREE.Clock();

    // Fixed viewport World Axis indicator. This is a lightweight 2D canvas
    // overlay driven from the live camera quaternion, so it never participates
    // in raycasting/orbit controls or pool geometry.
    // The viewport no longer needs the XYZ/WORLD orientation overlay.
    this.destroyWorldAxisIndicator?.();

    this.setupDimensionHandles();
    this.setupOvalInfinityHandles();
    this.setupLInfinityHandles();
    this.setupStraightInfinityHandles();
    this.setupSpaDimensionHandles();
    this.setupSectionDimensionHandles();
    this.setupGlobalActionButtons();

    // Water interior prepass render target (used by stylized water refraction)
    const _sz = new THREE.Vector2();
    this.renderer.getSize(_sz);
    this._waterInteriorRT = new THREE.WebGLRenderTarget(_sz.x, _sz.y, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    });
    // Water depth prepass (packed RGBA depth) for thickness/absorption in water shader
    this._waterDepthRT = new THREE.WebGLRenderTarget(_sz.x, _sz.y, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat
    });
    this._waterDepthMat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking
    });
    this._waterDepthMat.blending = THREE.NoBlending;


    // Keep RT in sync with window resize (scene.js also resizes renderer/camera)
    window.addEventListener("resize", () => {
      const s = new THREE.Vector2();
      this.renderer.getSize(s);
      this._waterInteriorRT.setSize(s.x, s.y);
      this._waterDepthRT?.setSize(s.x, s.y);

      const wm = this.poolGroup?.userData?.waterMesh;
      const u = wm?.material?.uniforms;
      if (u?.resolution) u.resolution.value.set(s.x, s.y);
    });


    this.caustics = this.controllers.register("caustics", new CausticsSystem(this.renderer));
    // NOTE: poolGroup is built in rebuildPoolForCurrentShape(); we attach after that.
    console.log('✅ PoolApp created CausticsSystem:', this.caustics);
// PBR / Caustics integration should never hard-crash the app if a module fails
    // to load or throws during initialization. If it fails, we continue without PBR.
    try {
      this.pbrManager = this.controllers.register("pbr", new PBRManager(this.poolParams, this.tileSize, this.caustics));
      await this.pbrManager.setTileFaceSize?.(this.tileFaceSize, { apply:false });
    } catch (err) {
      console.error("[PoolApp] PBRManager init failed; continuing without PBR.", err);
      this.pbrManager = null;
    }

    await this.rebuildPoolForCurrentShape();
    this._updateDimensionHandles();
    this._updateSpaDimensionHandles();
    this._updateSectionDimensionHandles();

    // Final defensive attach (in case materials changed during rebuild)
    try { this.caustics?.attachToGroup?.(this.poolGroup); } catch (_) {}

    // Guard all calls: if PBR is unavailable (or poolGroup not yet built), keep running.
    if (this.poolGroup && this.pbrManager && typeof this.pbrManager.setPoolGroup === "function") {
      this.pbrManager.setPoolGroup(this.poolGroup);
      if (typeof this.pbrManager.initButtons === "function") {
        await this.pbrManager.initButtons(this.poolGroup, { skipInitialApply: true });
      }
    }

    this.setupSpaSystem();
    this.setupSpaSelection();
    this.setupShapeDropdown();
    this.setupSpaSliders();
    this.setupPoolSliders();
    this.setupPoolElevationControl();
    this.setupStepLayoutControls();
    this.setupRippleClick();

    this.updateShapeUIVisibility();

    // steps
    // Feature drags register before the general step/wall pickers so a stool,
    // window, blade or push/pull handle always wins the pointer gesture.
    this.setupBarStoolDragging();
    this.setupRaisedWallWaterFeatureDragging();
    this.setupAcrylicWindowDragging();
    this.setupStepSelection();
    this.setupStepExtensionSlider();

    // walls
    this.setupWallSelection();
    this.setupWallRaiseSlider();
    this.setupCustomizeCurveTool();
    this.setupInternalFeatureControls();

    // Make sure UI sliders reflect the current poolParams
    this.syncSlidersFromParams();

    if (starterSpa) {
      await this.applyStarterSpaAfterInitialBuild(starterSpa);
    } else {
      const spaShapeSelect = document.getElementById("spaShape");
      if (spaShapeSelect) spaShapeSelect.value = "square";
      const spaBtn = document.getElementById("addRemoveSpa");
      if (spaBtn) spaBtn.textContent = "Add Spa";
      this.setSpaSlidersEnabled(false);
      this.refreshSpaDimensionLabels();
    }

    if (!starterPreset) this.setupStarterPresetScreen();

    document.addEventListener("activePanelChanged", (event) => {
      const panelName = event?.detail?.panelName || null;
      this.setSectionViewEnabled(panelName === "dimensions");
    });

    // Opening Steps no longer moves the camera automatically. Keep only the
    // water-visibility treatment; camera movement is reserved for Dimensions.
    document.addEventListener("stepsPanelOpened", () => {
      this.ghostifyWater();
    });

    document.addEventListener("stepsPanelClosed", () => {
      this.restoreWater();
      const hadSel = !!this.selectedStep;
      this.clearHoverHighlight();
      this.clearSelectedHighlight();
      if (hadSel)
        document.dispatchEvent(new CustomEvent("stepSelectionCleared"));
    });

    if (starterPreset) {
      this.openStarterModelView(starterPreset);
    } else {
      window.openPanelFromCode?.("shape");
    }

    this.animate();

    // Begin applying the already-preloaded environment immediately. The visible
    // WebP sky appears first while the smaller HDR finishes PMREM processing.
    this.scene?.userData?.loadHDRIEnvironment?.().catch(() => {});
  }


  updateHighlightForSpa(spa, isSelected) {
    if (!this.scene || !spa) return;
    if (this.sectionViewEnabled) {
      if (this.hoverSpaHighlight) this.hoverSpaHighlight.visible = false;
      if (this.selectedSpaHighlight) this.selectedSpaHighlight.visible = false;
      return;
    }

    // Keep spa drag/selection flow unchanged, but do not render a persistent
    // selected highlight. Hover highlight remains active through the existing
    // non-selected path.
    if (isSelected) {
      if (this.selectedSpaHighlight) this.selectedSpaHighlight.visible = false;
      return;
    }

    const highlight = this.hoverSpaHighlight || new THREE.Group();
    if (!highlight.parent) this.scene.add(highlight);

    while (highlight.children.length) {
      const child = highlight.children.pop();
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }

    spa.updateMatrixWorld(true);
    const selectable = [];
    spa.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.visible) return;
      if (o.userData?.ignoreClickSelect || o.userData?.isSpaWater) return;
      selectable.push(o);
    });

    const opacity = isSelected ? 0.35 : 0.22;
    const scale = isSelected ? 1.025 : 1.012;
    for (const mesh of selectable) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xd37cff,
        transparent: true,
        opacity,
        depthWrite: false
      });
      const clone = new THREE.Mesh(mesh.geometry.clone(), mat);
      clone.renderOrder = isSelected ? 997 : 996;
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      mesh.updateMatrixWorld(true);
      mesh.matrixWorld.decompose(pos, quat, scl);
      clone.position.copy(pos);
      clone.quaternion.copy(quat);
      clone.scale.copy(scl).multiplyScalar(scale);
      highlight.add(clone);
    }

    highlight.visible = true;
    if (isSelected) this.selectedSpaHighlight = highlight;
    else this.hoverSpaHighlight = highlight;
  }

  clearSpaHoverHighlight() {
    if (this.hoverSpaHighlight) this.hoverSpaHighlight.visible = false;
    this.hoveredSpa = null;
  }

  clearSpaSelectedHighlight() {
    if (this.selectedSpaHighlight) this.selectedSpaHighlight.visible = false;
    this.selectedSpa = null;
  }

  // --------------------------------------------------------------
  // SPA SYSTEM
  // --------------------------------------------------------------
  _firstCurvedEdgeIndex() {
    const edges = this.editablePolygon?.edges;
    if (!Array.isArray(edges)) return null;
    const index = edges.findIndex((edge) => !!edge?.isCurved && !!edge?.control);
    return index >= 0 ? index : null;
  }

  async setCurvedWallEnabled(enabled) {
    const wantsCurve = !!enabled;
    const hasCurve = !!this._polygonHasCurves?.();

    if (wantsCurve) {
      this.setCustomizeMode(true);
      if (hasCurve) {
        const edgeIndex = this._firstCurvedEdgeIndex();
        if (Number.isInteger(edgeIndex)) {
          const wall = this._wallCandidatesForRaise?.().find((candidate) =>
            Number(candidate?.userData?.sourceEdgeIndex ?? candidate?.userData?.edgeIndex) === Number(edgeIndex)
          ) || null;
          this.selectExistingCurvedEdgeForCustomize(edgeIndex, wall);
        }
      }
      this._notifyDesignerStateChanged?.();
      return true;
    }

    if (hasCurve) {
      // Curved Wall is a true feature toggle. Turning it off removes every
      // authored curved edge, rather than merely hiding the radius handle.
      let guard = 0;
      while (this._polygonHasCurves?.() && guard++ < 16) {
        const edgeIndex = this._firstCurvedEdgeIndex();
        if (!Number.isInteger(edgeIndex)) break;
        this.setCustomizeMode(true);
        const wall = this._wallCandidatesForRaise?.().find((candidate) =>
          Number(candidate?.userData?.sourceEdgeIndex ?? candidate?.userData?.edgeIndex) === Number(edgeIndex)
        ) || null;
        this.selectExistingCurvedEdgeForCustomize(edgeIndex, wall);
        await this.revertSelectedCurveToSquare();
      }
    }
    this.setCustomizeMode(false);
    this._syncInternalFeatureControls?.();
    this._notifyDesignerStateChanged?.();
    return true;
  }

  setupCustomizeCurveTool() {
    if (this._customizeCurveToolSetup) return;
    this._customizeCurveToolSetup = true;
    this.setupCustomizeRadiusHandleDragging?.();
    document.addEventListener("shapePanelClosed", () => {
      this.setCustomizeMode(false);
    });
  }

  _disposeCustomizeRadiusHandle() {
    const handle = this.customizeRadiusHandle;
    if (!handle) return;
    handle.parent?.remove?.(handle);
    handle.geometry?.dispose?.();
    if (Array.isArray(handle.material)) handle.material.forEach((material) => material?.dispose?.());
    else handle.material?.dispose?.();
    this.customizeRadiusHandle = null;
  }

  _updateCustomizeRadiusHandle(preview = this.customizePreview) {
    if (!this.scene || !preview?.start || !preview?.end || !preview?.control || !this.customizeMode) {
      this._disposeCustomizeRadiusHandle();
      return;
    }
    if (!this.customizeRadiusHandle) {
      const material = new THREE.MeshBasicMaterial({ color:0x1675f8, depthTest:false, depthWrite:false });
      const handle = new THREE.Mesh(new THREE.SphereGeometry(0.11,24,18), material);
      handle.name = 'curved-wall-radius-handle';
      handle.userData.isCustomizeRadiusHandle = true;
      handle.renderOrder = 2600;
      handle.frustumCulled = false;
      this.scene.add(handle);
      this.customizeRadiusHandle = handle;
    }
    const midpoint = preview.start.clone().multiplyScalar(0.25)
      .add(preview.control.clone().multiplyScalar(0.5))
      .add(preview.end.clone().multiplyScalar(0.25));
    this.customizeRadiusHandle.position.set(midpoint.x, midpoint.y, 0.13);
    this.customizeRadiusHandle.visible = true;
  }

  setupCustomizeRadiusHandleDragging() {
    if (this._customizeRadiusHandleDraggingSetup || !this.renderer?.domElement || !this.camera) return;
    this._customizeRadiusHandleDraggingSetup = true;
    const dom = this.renderer.domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hitHandle = (event) => {
      const handle = this.customizeRadiusHandle;
      if (!handle?.visible) return null;
      const rect = dom.getBoundingClientRect();
      pointer.set(((event.clientX-rect.left)/rect.width)*2-1, -((event.clientY-rect.top)/rect.height)*2+1);
      raycaster.setFromCamera(pointer,this.camera);
      return raycaster.intersectObject(handle,false)[0] || null;
    };
    dom.addEventListener('pointerdown',(event)=>{
      if (event.button !== 0 || !this.customizeMode || !hitHandle(event)) return;
      const preview = this.customizePreview;
      if (!preview) return;
      event.preventDefault?.(); event.stopPropagation?.(); event.stopImmediatePropagation?.();
      this.captureUndoState?.('Resize curved wall');
      const worldMid = this.customizeRadiusHandle.getWorldPosition(new THREE.Vector3());
      const radial = new THREE.Vector3(worldMid.x-preview.control.x,worldMid.y-preview.control.y,0).normalize();
      const axis = this._getHandleScreenAxisMetrics({ userData:{ handleAxisVector:radial } }, worldMid);
      if (!axis) return;
      this.customizeRadiusDrag = {
        pointerId:event.pointerId, startX:event.clientX, startY:event.clientY,
        startRadius:Number(preview.radius)||Number(this.customizeRadius)||1, axis,
        min:Number(preview.minRadius)||1, max:Number(preview.maxRadius)||4,
        editEdgeIndex:this.customizeEditEdgeIndex,
        controlsEnabled:this.controls?.enabled !== false
      };
      if (this.controls) this.controls.enabled=false;
      dom.setPointerCapture?.(event.pointerId);
      dom.style.cursor='ew-resize';
    },true);
    dom.addEventListener('pointermove',(event)=>{
      const drag=this.customizeRadiusDrag;
      if (!drag || event.pointerId!==drag.pointerId) return;
      event.preventDefault?.(); event.stopPropagation?.(); event.stopImmediatePropagation?.();
      const dx=event.clientX-drag.startX, dy=event.clientY-drag.startY;
      const pixels=dx*drag.axis.x+dy*drag.axis.y;
      const worldDelta=pixels/drag.axis.pixelsPerWorld;
      this.customizeRadius=THREE.MathUtils.clamp(Math.round((drag.startRadius+worldDelta)/0.05)*0.05,drag.min,drag.max);
      if (Number.isInteger(drag.editEdgeIndex)) this.selectExistingCurvedEdgeForCustomize(drag.editEdgeIndex,this.customizeWallSelections[0]?.wall||null);
      else if (this.customizeWallSelections.length>=2) this.refreshCustomizePreviewFromSelections();
    },true);
    const finish=async(event)=>{
      const drag=this.customizeRadiusDrag;
      if (!drag || event.pointerId!==drag.pointerId) return;
      this.customizeRadiusDrag=null;
      try{dom.releasePointerCapture?.(event.pointerId);}catch(_){}
      if(this.controls) this.controls.enabled=drag.controlsEnabled;
      dom.style.cursor='';
      if (this.customizePreview) await this.applyCurveFromPreview({ keepMode:true });
      this._notifyDesignerStateChanged?.();
    };
    dom.addEventListener('pointerup',(event)=>{void finish(event);},true);
    dom.addEventListener('pointercancel',(event)=>{void finish(event);},true);
  }

  showCustomizeRevertButton() {
    const revertBtn = document.getElementById("revertCornerBtn");
    if (revertBtn) revertBtn.style.display = "none";
  }

  setCustomizeMode(active) {
    const unsupported = this.poolParams.shape === "oval" || this.poolParams.shape === "kidney";
    if (active && unsupported) {
      this.customizeMode = false;
      this.customizeWallSelections = [];
      this.customizeEditEdgeIndex = null;
      this.hoveredCustomizeCurveEdgeIndex = null;
      this.clearCustomizeWallSelectionHighlights();
      this.clearCustomizePreview();
      this.showCustomizeRevertButton(false);
      this.refreshCustomizeHint("Customise currently works with rectangular, freeform, and L-shape pools.");
      return;
    }

    this.customizeMode = !!active;
    this.customizeWallSelections = [];
    this.customizeEditEdgeIndex = null;
    this.hoveredCustomizeCurveEdgeIndex = null;
    this.clearCustomizeWallSelectionHighlights();
    this.clearCustomizePreview();
    this.customizeRadiusBounds = { min: 1.0, max: 4.0 };

    this.showCustomizeRevertButton(false);

    this.updateCustomizeRadiusUI();
    this.refreshCustomizeHint();
    this._syncInternalFeatureControls?.();

    if (!this.customizeMode) {
      this.clearWallSelectedHighlight();
      this._disposeCustomizeRadiusHandle?.();
    }
  }

  refreshCustomizeHint(message = "") {
    const hint = document.getElementById("customizeShapeHint");
    if (!hint) return;

    if (!this.customizeMode && !message) {
      hint.style.display = "none";
      hint.textContent = "Select 2 adjacent walls where you want the curved edge.";
      return;
    }

    hint.style.display = "block";
    hint.textContent = message || (
      Number.isInteger(this.customizeEditEdgeIndex)
        ? "Curved wall selected. Drag the blue handle in the 3D view to adjust its radius."
        : this.customizeWallSelections.length === 0
          ? "Select the first adjacent wall where you want the curved edge, or click an existing curved wall to edit it."
          : "Select the second adjacent wall to create the curved corner."
    );
  }

  updateCustomizeRadiusUI(bounds = null) {
    if (bounds) {
      this.customizeRadiusBounds = {
        min:Number.isFinite(bounds.min)?bounds.min:(this.customizeRadiusBounds?.min??1),
        max:Number.isFinite(bounds.max)?bounds.max:(this.customizeRadiusBounds?.max??4)
      };
    }
    const min=Math.max(0.2,Number(this.customizeRadiusBounds?.min)||1);
    const max=Math.max(min,Number(this.customizeRadiusBounds?.max)||4);
    this.customizeRadius=THREE.MathUtils.clamp(Number.isFinite(this.customizeRadius)?this.customizeRadius:min,min,max);
  }

  refreshCustomizePreviewFromSelections() {
    const preview = this.computeCustomizePreviewData(this.customizeWallSelections, this.customizeRadius);
    if (!preview) {
      this.customizePreview = null;
      this.clearCustomizePreview();
      this.showCustomizeRevertButton(false);
      this.updateCustomizeRadiusUI();
      this.refreshCustomizeHint("The selected walls could not form a curved corner. Pick 2 adjacent walls.");
      return;
    }

    this.customizeRadius = preview.radius;
    this.customizePreview = preview;
    this.showCustomizeCurvePreview(preview);

    this.showCustomizeRevertButton(false);
    this.updateCustomizeRadiusUI({ min: preview.minRadius, max: preview.maxRadius });
    this.refreshCustomizeHint("Curve preview ready. Select the second wall to apply it.");
  }

  selectExistingCurvedEdgeForCustomize(edgeIndex, wall = null) {
    if (!this.customizeMode || !this.editablePolygon) return;

    const preview = this.computeExistingCurvePreviewData(edgeIndex, this.customizeRadius);
    this.customizeWallSelections = wall ? [{ wall, edgeIndex, hitPoint: null }] : [];
    this.updateCustomizeSelectionHighlights();
    this.customizeEditEdgeIndex = edgeIndex;

    if (!preview) {
      this.customizePreview = null;
      this.clearCustomizePreview();
      this.showCustomizeRevertButton(false);
      this.updateCustomizeRadiusUI({ min: 1.0, max: 4.0 });
      this.refreshCustomizeHint("That curved wall cannot be resized from this shape.");
      return;
    }

    this.customizeRadius = preview.radius;
    this.customizePreview = preview;
    this.showCustomizeCurvePreview(preview);

    this.showCustomizeRevertButton(false);
    this.updateCustomizeRadiusUI({ min: preview.minRadius, max: preview.maxRadius });
    this.refreshCustomizeHint("Curved wall selected. Drag the blue handle in the 3D view to adjust its radius.");
  }

  computeExistingCurvePreviewData(edgeIndex, radiusOverride = null) {
    const polygon = this.editablePolygon;
    if (!polygon?.vertices?.length || !Number.isInteger(edgeIndex)) return null;

    const edge = polygon.getEdge(edgeIndex);
    if (!edge?.isCurved || !edge.control) return null;

    const n = polygon.vertexCount();
    if (n < 4) return null;

    const control = edge.control.clone();
    const startVertex = polygon.getVertex(edgeIndex)?.clone();
    const endVertex = polygon.getVertex(polygon.nextIndex(edgeIndex))?.clone();
    const prevVertex = polygon.getVertex(polygon.prevIndex(edgeIndex))?.clone();
    const nextVertex = polygon.getVertex((edgeIndex + 2) % n)?.clone();
    if (!startVertex || !endVertex || !prevVertex || !nextVertex) return null;

    const inVec = prevVertex.clone().sub(control);
    const outVec = nextVertex.clone().sub(control);
    const inLen = inVec.length();
    const outLen = outVec.length();
    if (inLen < 1e-4 || outLen < 1e-4) return null;

    inVec.normalize();
    outVec.normalize();

    const minRadius = 1.0;
    const maxRadius = Math.min(4.0, Math.min(inLen, outLen) - 0.02);
    if (maxRadius < minRadius) return null;

    const currentRadius = Math.min(
      control.distanceTo(startVertex),
      control.distanceTo(endVertex)
    );

    const defaultRadius = THREE.MathUtils.clamp(
      currentRadius || minRadius,
      minRadius,
      maxRadius
    );

    const radius = THREE.MathUtils.clamp(
      Number.isFinite(radiusOverride) ? radiusOverride : defaultRadius,
      minRadius,
      maxRadius
    );

    const start = control.clone().addScaledVector(inVec, radius);
    const end = control.clone().addScaledVector(outVec, radius);

    const points = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const inv = 1 - t;
      points.push(new THREE.Vector3(
        inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
        inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y,
        0.06
      ));
    }

    return {
      mode: "edit-existing",
      edgeIndex,
      control,
      start,
      end,
      radius,
      minRadius,
      maxRadius,
      points
    };
  }

  getCurrentOutlineVertices() {
    if ((this.poolParams.shape === "freeform" || this.isCustomShape) && this.editablePolygon?.vertices?.length) {
      return this.editablePolygon.vertices.map((v) => v.clone());
    }

    if (this.poolParams.shape === "L") {
      const halfL = this.poolParams.length / 2;
      const halfW = this.poolParams.width / 2;

      const notchL = THREE.MathUtils.clamp(
        this.poolParams.length * (Number.isFinite(this.poolParams.notchLengthX) ? this.poolParams.notchLengthX : 0.4),
        0.6,
        Math.max(0.6, this.poolParams.length - 0.6)
      );

      const notchW = THREE.MathUtils.clamp(
        this.poolParams.width * (Number.isFinite(this.poolParams.notchWidthY) ? this.poolParams.notchWidthY : 0.45),
        0.6,
        Math.max(0.6, this.poolParams.width - 0.6)
      );

      return [
        new THREE.Vector2(-halfL, -halfW),
        new THREE.Vector2(halfL, -halfW),
        new THREE.Vector2(halfL, halfW),
        new THREE.Vector2(halfL - notchL, halfW),
        new THREE.Vector2(halfL - notchL, halfW - notchW),
        new THREE.Vector2(-halfL, halfW - notchW)
      ];
    }

    return [
      new THREE.Vector2(-this.poolParams.length / 2, -this.poolParams.width / 2),
      new THREE.Vector2(this.poolParams.length / 2, -this.poolParams.width / 2),
      new THREE.Vector2(this.poolParams.length / 2, this.poolParams.width / 2),
      new THREE.Vector2(-this.poolParams.length / 2, this.poolParams.width / 2)
    ];
  }

  ensureEditablePolygonForCustomization() {
    if (!this.isCustomShape) {
      this.baseShapeType = this.poolParams.shape;
    }

    if (this.editablePolygon?.vertices?.length) {
      return this.editablePolygon;
    }

    const vertices = this.getCurrentOutlineVertices();
    this.editablePolygon = new EditablePolygon(vertices);
    this.editablePolygon.minVertices = 3;
    this.editablePolygon.isRectangular = this.baseShapeType === "rectangular";

    this.isCustomShape = true;

    this.updateShapeUIVisibility();
    this.syncSlidersFromParams();
    this.refreshDisplayedShapeLabel();
    return this.editablePolygon;
  }

  handleCustomizeWallPick(wall, hitPoint) {
    if (!wall || !this.customizeMode) return;

    this.customizeEditEdgeIndex = null;
    this.showCustomizeRevertButton(false);

    const edgeIndex = wall.userData?.edgeIndex;
    if (!Number.isInteger(edgeIndex)) {
      this.refreshCustomizeHint("This shape cannot be customised from wall picks yet.");
      return;
    }

    if (this.customizeWallSelections.length >= 2) {
      this.customizeWallSelections = [];
      this.clearCustomizeWallSelectionHighlights();
      this.clearCustomizePreview();
    }

    if (this.customizeWallSelections.some((sel) => sel.wall === wall)) {
      this.refreshCustomizeHint("That wall is already selected. Pick the adjacent wall next.");
      return;
    }

    this.customizeWallSelections.push({ wall, edgeIndex, hitPoint: hitPoint.clone() });
    this.updateCustomizeSelectionHighlights();
    this.clearWallHoverHighlight();

    if (this.customizeWallSelections.length < 2) {
      this.updateCustomizeRadiusUI();
      this.refreshCustomizeHint();
      return;
    }

    const autoPreview = this.computeCustomizePreviewData(this.customizeWallSelections);
    if (!autoPreview) {
      this.customizeWallSelections = [this.customizeWallSelections[1]];
      this.updateCustomizeSelectionHighlights();
      this.clearCustomizePreview();
      this.updateCustomizeRadiusUI();
      this.refreshCustomizeHint("Select 2 adjacent walls that meet at the corner you want curved.");
      return;
    }

    this.customizeRadius = autoPreview.radius;
    this.updateCustomizeRadiusUI({ min: autoPreview.minRadius, max: autoPreview.maxRadius });
    this.refreshCustomizePreviewFromSelections();
    try { this.captureUndoState?.("Apply curved wall"); } catch (_) {}
    void this.applyCurveFromPreview({ keepMode:true });
  }

  computeCustomizePreviewData(selections = [], radiusOverride = null) {
    const vertices = this.getCurrentOutlineVertices();
    if (!vertices || vertices.length < 3 || selections.length < 2) return null;

    const n = vertices.length;
    const firstEdge = selections[0].edgeIndex;
    const secondEdge = selections[1].edgeIndex;

    let sharedVertexIndex = -1;
    let incomingEdgeIndex = -1;
    let outgoingEdgeIndex = -1;

    if ((firstEdge + 1) % n === secondEdge) {
      sharedVertexIndex = secondEdge;
      incomingEdgeIndex = firstEdge;
      outgoingEdgeIndex = secondEdge;
    } else if ((secondEdge + 1) % n === firstEdge) {
      sharedVertexIndex = firstEdge;
      incomingEdgeIndex = secondEdge;
      outgoingEdgeIndex = firstEdge;
    } else {
      return null;
    }

    const shared = vertices[sharedVertexIndex];
    const prev = vertices[incomingEdgeIndex];
    const next = vertices[(outgoingEdgeIndex + 1) % n];
    if (!shared || !prev || !next) return null;

    const inVec = prev.clone().sub(shared);
    const outVec = next.clone().sub(shared);
    const inLen = inVec.length();
    const outLen = outVec.length();
    if (inLen < 0.05 || outLen < 0.05) return null;

    inVec.normalize();
    outVec.normalize();

    const minRadius = 1.0;
    const maxRadius = Math.min(4.0, Math.min(inLen, outLen) - 0.02);
    if (maxRadius < minRadius) return null;

    const defaultRadius = THREE.MathUtils.clamp(
      Math.min(inLen, outLen) * 0.35,
      minRadius,
      maxRadius
    );

    const radius = THREE.MathUtils.clamp(
      Number.isFinite(radiusOverride) ? radiusOverride : defaultRadius,
      minRadius,
      maxRadius
    );

    const start = shared.clone().addScaledVector(inVec, radius);
    const end = shared.clone().addScaledVector(outVec, radius);
    const control = shared.clone();

    const points = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const inv = 1 - t;
      points.push(new THREE.Vector3(
        inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
        inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y,
        0.06
      ));
    }

    return {
      vertices,
      sharedVertexIndex,
      incomingEdgeIndex,
      outgoingEdgeIndex,
      start,
      end,
      control,
      radius,
      minRadius,
      maxRadius,
      points
    };
  }

  showCustomizeCurvePreview(preview) {
    if (!this.scene || !preview?.points?.length) return;

    if (!this.customizePreviewLine) {
      const geom = new THREE.BufferGeometry();
      const mat = new THREE.LineBasicMaterial({
        color: 0xbfe8ff,
        transparent: true,
        opacity: 0.85,
        depthWrite: false
      });
      this.customizePreviewLine = new THREE.Line(geom, mat);
      this.customizePreviewLine.renderOrder = 1000;
      this.scene.add(this.customizePreviewLine);
    }

    this.customizePreviewLine.geometry.dispose();
    this.customizePreviewLine.geometry = new THREE.BufferGeometry().setFromPoints(preview.points);
    this.customizePreviewLine.visible = true;
    this._updateCustomizeRadiusHandle?.(preview);
  }

  async revertSelectedCurveToSquare() {
    if (!Number.isInteger(this.customizeEditEdgeIndex)) {
      this.refreshCustomizeHint("Select an existing curved wall first.");
      return;
    }

    const polygon = this.ensureEditablePolygonForCustomization();
    const edgeIndex = this.customizeEditEdgeIndex;
    const edge = polygon.getEdge?.(edgeIndex);

    if (!edge?.isCurved || !edge.control) {
      this.refreshCustomizeHint("That curved wall can’t be reverted.");
      return;
    }

    const originalCorner = edge.control.clone();
    const nextIndex = polygon.nextIndex(edgeIndex);

    if (!polygon.vertices?.[edgeIndex] || !polygon.vertices?.[nextIndex]) {
      this.refreshCustomizeHint("That curved wall can’t be reverted.");
      return;
    }

    polygon.vertices[edgeIndex].copy(originalCorner);
    polygon.vertices.splice(nextIndex, 1);

    if (Array.isArray(polygon.edges)) {
      polygon.edges.splice(nextIndex, 1);
      if (!polygon.edges[edgeIndex]) {
        polygon.edges[edgeIndex] = { isCurved: false, control: null };
      } else {
        polygon.edges[edgeIndex].isCurved = false;
        polygon.edges[edgeIndex].control = null;
      }
    }

    polygon.isRectangular = false;
    polygon._emitChange?.();

    await this.rebuildPoolForCurrentShape();
    window.openPanelFromCode?.("shape");
    this.setCustomizeMode(true);
    this.normalizeShapeLabelIfNeeded();
    this.refreshCustomizeHint("Curve removed. The corner is square again.");
  }

  async applyCurveFromPreview({ keepMode = true } = {}) {
    const preview = this.customizePreview;
    if (!preview) {
      this.refreshCustomizeHint("Select two adjacent walls first.");
      return;
    }

    const polygon = this.ensureEditablePolygonForCustomization();
    if (preview.mode === "edit-existing") {
      const edgeIndex = preview.edgeIndex;
      if (!Number.isInteger(edgeIndex) || !polygon.vertices?.[edgeIndex]) {
        this.refreshCustomizeHint("The curved wall could not be updated.");
        return;
      }
      polygon.vertices[edgeIndex].copy(preview.start);
      polygon.vertices[polygon.nextIndex(edgeIndex)].copy(preview.end);
      polygon.moveCurveControl(edgeIndex, preview.control);
      polygon.isRectangular = false;
      polygon._emitChange?.();
      await this.rebuildPoolForCurrentShape();
      this.isCustomShape = true;
      this.refreshDisplayedShapeLabel();
      if (keepMode) {
        this.setCustomizeMode(true);
        // Recover the edited curve after rebuild so its direct handle remains available.
        const wall=this._wallCandidatesForRaise?.().find((candidate)=>Number(candidate?.userData?.sourceEdgeIndex ?? candidate?.userData?.edgeIndex)===Number(edgeIndex)) || null;
        this.selectExistingCurvedEdgeForCustomize(edgeIndex,wall);
      } else this.setCustomizeMode(false);
      return;
    }

    const sharedIndex = preview.sharedVertexIndex;
    if (!Number.isInteger(sharedIndex) || !polygon.vertices?.[sharedIndex]) {
      this.refreshCustomizeHint("The curved corner could not be applied to this shape.");
      return;
    }
    polygon.vertices[sharedIndex].copy(preview.start);
    polygon.addVertexAtEdge(sharedIndex, preview.end);
    polygon.moveCurveControl(sharedIndex, preview.control);
    polygon.isRectangular = false;
    polygon._emitChange?.();
    await this.rebuildPoolForCurrentShape();
    this.isCustomShape = true;
    this.refreshDisplayedShapeLabel();
    if (keepMode) {
      this.setCustomizeMode(true);
      const edgeIndex = Number.isInteger(sharedIndex) ? sharedIndex : this._firstCurvedEdgeIndex();
      const wall = Number.isInteger(edgeIndex)
        ? (this._wallCandidatesForRaise?.().find((candidate) =>
            Number(candidate?.userData?.sourceEdgeIndex ?? candidate?.userData?.edgeIndex) === Number(edgeIndex)
          ) || null)
        : null;
      if (Number.isInteger(edgeIndex)) this.selectExistingCurvedEdgeForCustomize(edgeIndex, wall);
    } else this.setCustomizeMode(false);
    this._syncInternalFeatureControls?.();
    this._notifyDesignerStateChanged?.();
  }

  getSpaSelectionMeshes() {
    if (!this.spa) return [];
    const spaMeshes = [];
    this.spa.traverse((o) => {
      if (o.isMesh && !o.userData?.ignoreClickSelect && !o.userData?.isSpaWater) spaMeshes.push(o);
    });
    return spaMeshes;
  }

  getPointerNdc(event, dom = this.renderer?.domElement) {
    const rect = dom.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  raycastSpa(event, dom = this.renderer?.domElement) {
    if (!this.camera || !dom || !this.spa) return [];
    const mouse = this.getPointerNdc(event, dom);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, this.camera);
    const spaMeshes = this.getSpaSelectionMeshes();
    return spaMeshes.length ? ray.intersectObjects(spaMeshes, true) : [];
  }

  intersectSpaDragPlane(event, dom = this.renderer?.domElement) {
    if (!this.camera || !dom) return null;
    const mouse = this.getPointerNdc(event, dom);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, this.camera);
    const hitPoint = new THREE.Vector3();
    return ray.ray.intersectPlane(this.spaDrag.plane, hitPoint) ? hitPoint : null;
  }

  updateSpaCursor(hitSpa = false) {
    const dom = this.renderer?.domElement;
    if (!dom) return;
    dom.style.cursor = this.spaDrag?.active ? 'grabbing' : (hitSpa ? 'pointer' : '');
  }

  _captureSpaDragPreviewState() {
    if (!this.spaDrag || !this.spa) return;

    const channel = this.ground?.userData?.spaChannelGroup || null;
    const channelWater = this.ground?.userData?.spaChannelWaterGroup || null;
    const debugGroup = this.scene?.userData?.spaVoidDebugGroup || null;

    const debugItems = [];
    debugGroup?.children?.forEach?.((obj) => {
      // Cyan is the static pool-footprint debug and must never follow the spa.
      if (!obj?.position || String(obj.name || '').startsWith('PoolVoidDebug')) return;
      debugItems.push({ obj, position: obj.position.clone() });
    });

    this.spaDrag.previewState = {
      spaStart: this.spa.position.clone(),
      channel: channel?.position ? { obj: channel, position: channel.position.clone() } : null,
      channelWater: channelWater?.position ? { obj: channelWater, position: channelWater.position.clone() } : null,
      debugItems
    };
    this.spaDrag.previewLastTs = 0;
    this.spaDrag.previewPending = false;
  }

  _applySpaDragVisualTranslation() {
    const state = this.spaDrag?.previewState;
    if (!state?.spaStart || !this.spa) return;

    const dx = this.spa.position.x - state.spaStart.x;
    const dy = this.spa.position.y - state.spaStart.y;

    const moveRoot = (entry) => {
      if (!entry?.obj?.position || !entry.position) return;
      entry.obj.position.set(
        entry.position.x + dx,
        entry.position.y + dy,
        entry.position.z
      );
      entry.obj.updateMatrixWorld?.(true);
    };

    // Channel geometry is world-authored. During the drag simply translate the
    // existing channel with the spa; the authoritative shape/snap rebuild occurs
    // once on pointer release.
    moveRoot(state.channel);
    moveRoot(state.channelWater);

    // Move only spa-dependent debug volumes. The cyan pool footprint remains
    // fixed because it describes the pool, not the spa.
    for (const entry of state.debugItems || []) {
      if (!entry?.obj?.position || !entry.position) continue;
      entry.obj.position.set(
        entry.position.x + dx,
        entry.position.y + dy,
        entry.position.z
      );
      entry.obj.updateMatrixWorld?.(true);
    }
  }

  _runSpaDragPreview(ts = performance.now()) {
    if (!this.spaDrag?.active || !this.spa || !this.poolGroup) return;

    // Cap the expensive clipping-plane refresh to ~30 FPS. Pointer position and
    // the spa/channel/debug transforms themselves still update every pointer event.
    const minDt = 1000 / 30;
    if (this.spaDrag.previewLastTs && (ts - this.spaDrag.previewLastTs) < minDt) {
      this.spaDrag.previewPending = true;
      if (!this.spaDrag.previewRaf) {
        this.spaDrag.previewRaf = requestAnimationFrame((nextTs) => {
          this.spaDrag.previewRaf = 0;
          if (!this.spaDrag?.active || !this.spaDrag.previewPending) return;
          this.spaDrag.previewPending = false;
          this._runSpaDragPreview(nextTs);
        });
      }
      return;
    }

    this.spaDrag.previewLastTs = ts;
    this.spaDrag.previewPending = false;

    this.spa.updateWorldMatrix?.(true, true);
    this._applySpaDragVisualTranslation();

    try {
      updateSpaDragPreview(
        this.ground || this.scene?.userData?.ground,
        this.poolGroup,
        this.spa
      );
    } catch (_) {}
  }

  _scheduleSpaDragPreview() {
    if (!this.spaDrag?.active) return;
    this._applySpaDragVisualTranslation();
    this.spaDrag.previewPending = true;
    if (this.spaDrag.previewRaf) return;
    this.spaDrag.previewRaf = requestAnimationFrame((ts) => {
      this.spaDrag.previewRaf = 0;
      if (!this.spaDrag?.active) return;
      this._runSpaDragPreview(ts);
    });
  }

  _cancelSpaDragPreview() {
    if (!this.spaDrag) return;
    if (this.spaDrag.previewRaf) cancelAnimationFrame(this.spaDrag.previewRaf);
    this.spaDrag.previewRaf = 0;
    this.spaDrag.previewPending = false;
    this.spaDrag.previewLastTs = 0;
  }

  setupSpaSelection() {
    if (!this.renderer || !this.camera) return;
    const dom = this.renderer.domElement;

    dom.addEventListener("pointermove", (event) => {
      if (!this.spa || this.poolEditor?.isDragging) return;

      if (this.spaDrag?.active && this.selectedSpa === this.spa) {
        const point = this.intersectSpaDragPlane(event, dom);
        if (!point) return;

        this.spa.position.x = point.x + this.spaDrag.offset.x;
        this.spa.position.y = point.y + this.spaDrag.offset.y;
        this.spaDrag.moved = true;
        this.updateSpaCursor(true);

        // Lightweight live preview: move the existing channel/debug geometry and
        // update only clip uniforms/planes. Do NOT rebuild ground/paving/channel
        // geometry on every pointer event.
        this._scheduleSpaDragPreview();
        return;
      }

      const hit = this.raycastSpa(event, dom);
      if (!hit.length) {
        this.clearSpaHoverHighlight();
        this.updateSpaCursor(false);
        return;
      }

      this.updateSpaCursor(true);

      if (this.selectedSpa === this.spa) {
        this.clearSpaHoverHighlight();
        return;
      }

      if (this.hoveredSpa !== this.spa) {
        this.hoveredSpa = this.spa;
        this.updateHighlightForSpa(this.spa, false);
      }
    });

    dom.addEventListener("pointerdown", (event) => {
      // Only the primary/left pointer button is allowed to start spa movement.
      // Right-click should keep its normal browser/context-menu behaviour and must not drag the spa.
      if (event.button !== 0) return;
      if (!this.spa || this.poolEditor?.isDragging) return;

      const hit = this.raycastSpa(event, dom);
      if (!hit.length) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      this._notifyDesignerInteraction?.("spa");
      this.selectedSpa = this.spa;
      setSelectedSpa(this.spa);
      this.updateHighlightForSpa(this.spa, true);
      this.clearSpaHoverHighlight();
      window.openPanelFromCode?.("spa");
      document.dispatchEvent(new CustomEvent("spaSelected"));

      this.spa.updateMatrixWorld?.(true);
      this.spaDrag.plane.set(new THREE.Vector3(0, 0, 1), -this.spa.position.z);
      const dragPoint = this.intersectSpaDragPlane(event, dom) || hit[0].point;
      this.spaDrag.offset.copy(this.spa.position).sub(dragPoint);
      this.spaDrag.active = true;
      this.spaDrag.moved = false;
      this._captureSpaDragPreviewState();
      this.controls.enabled = false;
      this.updateSpaCursor(true);
      dom.setPointerCapture?.(event.pointerId);
    });

    const finishSpaDrag = async (event) => {
      if (!this.spaDrag?.active) return;

      this._cancelSpaDragPreview();
      this.spaDrag.active = false;
      this.controls.enabled = true;
      dom.releasePointerCapture?.(event.pointerId);

      if (this.spa && this.spaDrag.moved) {
        // Commit phase: snap first, rebuild the spa itself, then perform ONE full
        // dependent-geometry rebuild. This regenerates channel geometry, all voids,
        // paving/ground clips and debug volumes at the authoritative final position.
        snapToPool(this.spa);
        updateSpa(this.spa);
        this.applyPoolElevation();
        await this.pbrManager.applyTilesToSpa(this.spa);
        this.refreshSpaTopOffsetSlider();

        if (this.poolGroup) {
          this._refreshSpaDependentGeometry();
          this.applyPoolElevation();
        }
      }

      this.spaDrag.previewState = null;

      await this._refreshSectionViewAfterGeometryEdit({ moveCamera: false, fullReset: true });

      const hit = this.raycastSpa(event, dom);
      this.updateSpaCursor(!!hit.length);
    };

    dom.addEventListener("pointerup", finishSpaDrag);
    dom.addEventListener("pointercancel", finishSpaDrag);
    dom.addEventListener("pointerleave", (event) => {
      if (!this.spaDrag?.active) {
        this.clearSpaHoverHighlight();
        this.updateSpaCursor(false);
        return;
      }
      finishSpaDrag(event);
    });

    dom.addEventListener("click", (event) => {
      if (event.button !== 0) return;
      if (!this.spa || this.poolEditor?.isDragging) return;
      if (this.spaDrag?.moved) return;

      const hit = this.raycastSpa(event, dom);
      if (!hit.length) {
        this.clearSpaSelectedHighlight();
        this.clearSpaHoverHighlight();
        this.updateSpaCursor(false);
        return;
      }

      event.stopImmediatePropagation();
      this.selectedSpa = this.spa;
      setSelectedSpa(this.spa);
      this.updateHighlightForSpa(this.spa, true);
      this.clearSpaHoverHighlight();
      this.updateSpaCursor(true);
      window.openPanelFromCode?.("spa");
      document.dispatchEvent(new CustomEvent("spaSelected"));
    });
  }

  getSelectedSpaShape() {
    const select = document.getElementById("spaShape");
    return select?.value === "circular" ? "circular" : "square";
  }

  refreshSpaDimensionLabels() {
    const shape = this.spa?.userData?.spaShape || this.getSelectedSpaShape();
    const allSpans = Array.from(document.querySelectorAll('#panel-spa label > span'));
    if (allSpans[1]) allSpans[1].textContent = shape === "circular" ? "Diameter (m)" : "Width (m)";
    if (allSpans[2]) allSpans[2].textContent = shape === "circular" ? "Diameter (m)" : "Length (m)";
  }

  setupSpaSystem() {
    const btn = document.getElementById("addRemoveSpa");
    if (!btn) return;

    const spaShapeSelect = document.getElementById("spaShape");

    this.setSpaSlidersEnabled(false);
    this.refreshSpaDimensionLabels();

    spaShapeSelect?.addEventListener("change", async () => {
      this.refreshSpaDimensionLabels();
      if (!this.spa) return;
      this.captureUndoState("Spa shape change");
      this.spa.userData.spaShape = this.getSelectedSpaShape();
      if (this.spa.userData.spaShape === "circular") {
        const diameter = Math.min(this.spa.userData.spaLength || 2, this.spa.userData.spaWidth || 2);
        this.spa.userData.spaLength = diameter;
        this.spa.userData.spaWidth = diameter;
        const lengthSlider = document.getElementById("spaLength");
        const widthSlider = document.getElementById("spaWidth");
        const lengthOutput = document.getElementById("spaLength-val");
        const widthOutput = document.getElementById("spaWidth-val");
        if (lengthSlider) lengthSlider.value = String(diameter);
        if (widthSlider) widthSlider.value = String(diameter);
        if (lengthOutput) lengthOutput.textContent = diameter.toFixed(2) + " m";
        if (widthOutput) widthOutput.textContent = diameter.toFixed(2) + " m";
      }
      updateSpa(this.spa);
      this.applyPoolElevation();
      this.refreshSpaTopOffsetSlider();
      await this.pbrManager.applyTilesToSpa(this.spa);
      if (this.poolGroup) {
        updatePoolWaterVoid(this.poolGroup, this.spa);
        updateGroundVoid(this.ground || this.scene?.userData?.ground, this.poolGroup, this.spa);
      }
    });

    btn.addEventListener("click", () => {
      this.captureUndoState("Spa toggle");
      if (!this.spa) {
        this.addSpa();
        btn.textContent = "Remove Spa";
      } else {
        this.removeSpa();
        btn.textContent = "Add Spa";
      }
    });
  }

  async addSpa() {
    this.spa = createSpa(this.poolParams, this.scene, {
      tileSize: this.tileSize,
      shape: this.getSelectedSpaShape(),
      poolGroup: this.poolGroup || null
    });
    this.spa.userData.poolGroup = this.poolGroup || null;
    this.spa.userData.poolParams = this.poolParams;

    snapToPool(this.spa);
    updateSpa(this.spa);
      this.applyPoolElevation();

    await this.pbrManager.applyTilesToSpa(this.spa);
    this._ensureAutomaticSpaLight?.();

    if (this.poolGroup) {
      updatePoolWaterVoid(this.poolGroup, this.spa);
      updateGroundVoid(this.ground || this.scene?.userData?.ground, this.poolGroup, this.spa);
      this.applyPoolElevation();
    }

    this.selectedSpa = this.spa;
    setSelectedSpa(this.spa);
    this.setSpaSlidersEnabled(true);
    this.refreshSpaDimensionLabels();
    this.refreshSpaTopOffsetSlider();
  }

  removeSpa() {
    if (!this.spa) return;

    disposeSpa(this.spa, this.scene);

    const index = spas.indexOf(this.spa);
    if (index !== -1) spas.splice(index, 1);

    this.clearSpaHoverHighlight();
    this.clearSpaSelectedHighlight();
    this.spa = null;
    this.hoverSpaHighlight = null;
    this.selectedSpaHighlight = null;
    setSelectedSpa(null);

    this.spaDrag.active = false;
    if (this.renderer?.domElement) this.renderer.domElement.style.cursor = "";

    this.setSpaSlidersEnabled(false);

    if (this.poolGroup) {
      updatePoolWaterVoid(this.poolGroup, null);
      updateGroundVoid(this.ground || this.scene?.userData?.ground, this.poolGroup, null);
      purgeDetachedSpaChannelArtifacts(this.scene, null);
    }
  }

  setSpaSlidersEnabled(state) {
    ["spaLength", "spaWidth", "spaTopHeight"].forEach((id) => {
      const slider = document.getElementById(id);
      if (slider) slider.disabled = !state;
    });
  }


  refreshSpaTopOffsetSlider() {
    const slider = document.getElementById("spaTopHeight");
    const output = document.getElementById("spaTopHeight-val");
    if (!slider) return;

    const constraints = getSpaTopOffsetConstraints(this.spa);
    slider.step = String(constraints.step ?? 0.05);
    slider.min = String(constraints.min ?? 0);
    slider.value = Number(constraints.value ?? 0).toFixed(2);

    if (output) {
      output.textContent = Number(constraints.value ?? 0).toFixed(2) + " m";
    }
  }

// --------------------------------------------------------------
// FREEFORM POLYGON EDITOR
// --------------------------------------------------------------
setupPoolEditor() {
  this.destroyPoolEditor();
  if (this.poolParams.shape !== "freeform" || !this.editablePolygon) return;

  this.poolEditor = new PoolEditor(
    this.scene,
    this.editablePolygon,
    this.renderer.domElement,
    {
      handleSize: 0.15,

      onEditStart: () => {
        this.captureUndoState("Freeform edit");
      },

      onPolygonChange: () => {
        if (!this.isPolygonShape()) return;
        if (!this.scene || !this.editablePolygon) return;

        this.editablePolygon.isRectangular = false;
        this.isCustomShape = true;
        this.refreshDisplayedShapeLabel();

        // Remove old pool
        if (this.poolGroup) {
          this._removePoolGroupSafely(this.poolGroup);
        }

        // Full rebuild required so floor, walls, steps, coping and water all
        // follow the edited freeform outline.
        this.poolGroup = createPoolGroup(
          this.poolParams,
          this.tileSize,
          this.editablePolygon
        );

        this.scene.add(this.poolGroup);

        // Keep all dependent systems in sync immediately.
        updateGroundVoid(this.ground, this.poolGroup, this.spa);
        updateGrassForPool(this.scene, this.poolGroup);
        if (this.spa) {
          updatePoolWaterVoid(this.poolGroup, this.spa);
          updateGroundVoid(this.ground || this.scene?.userData?.ground, this.poolGroup, this.spa);
        }

        // Keep tile density / grout alignment stable after each edit.
        this.rebakePoolTilingUVs();
        this._clearEntryWallRaiseState();
        this._reapplySavedWallRaiseState();

        // Rebuild pool features against the new edited perimeter so the
        // freeform infinity tank stays attached to the live wall geometry.
        this.rebuildPoolFeatures();

        // Re-attach caustics after the freeform rebuild swaps meshes/materials.
        try { this.caustics?.attachToGroup?.(this.poolGroup); } catch (_) {}

        // Defer expensive PBR + spa logic (prevents tile popping)
        this._schedulePBRApply();

        if (this.sectionViewEnabled) {
          try { this._refreshSectionViewPresentation(); } catch (_) {}
        }
      }
    }
  );
}

  // --------------------------------------------------------------
  // SHAPE UI
  // --------------------------------------------------------------
  async setPoolShape(shape, { captureUndo = true } = {}) {
    const allowed = new Set(["rectangular", "freeform", "oval", "kidney", "L", "lap", "plunge"]);
    const nextShape = allowed.has(shape) ? shape : "rectangular";
    if (this.poolParams.shape === nextShape && !this.isCustomShape) {
      this.refreshDisplayedShapeLabel();
      return;
    }

    if (captureUndo) this.captureUndoState("Shape change");
    // Shape changes are a hard geometry boundary. Restore every feature-owned
    // suppression before disposing the old shell so hidden/cut walls from the
    // previous shape cannot leak into the next build.
    try { this._restoreAcrylicWindowWallCut?.(); } catch (_) {}
    try { this._restoreInfinityEdgeCoping?.(); } catch (_) {}
    try { this._restoreInfinityWallVoid?.(); } catch (_) {}
    this.selectedWall = null;
    this.hoveredWall = null;
    if (this.selectedWallHighlightMesh) this.selectedWallHighlightMesh.visible = false;
    if (this.hoverWallHighlightMesh) this.hoverWallHighlightMesh.visible = false;
    if (this._bladeLengthSceneControl) {
      this._bladeLengthSceneControl.root = null;
      this._bladeLengthSceneControl.button.style.display = 'none';
      this._bladeLengthSceneControl.menu.style.display = 'none';
    }
    const ground = this.ground || this.scene?.userData?.ground;
    if (ground?.userData?.extraGroundVoids) {
      ground.userData.extraGroundVoids = ground.userData.extraGroundVoids.filter(entry => {
        const name = String(entry?.name || '');
        return !name.startsWith('infinity-') && !name.startsWith('wet-edge-');
      });
    }
    this.destroyPoolEditor();
    this.poolParams.shape = nextShape;
    if (nextShape === 'lap') Object.assign(this.poolParams, { length:15, width:2.5, shallow:1.2, deep:1.8 });
    if (nextShape === 'plunge') Object.assign(this.poolParams, { length:4, width:4, shallow:1.2, deep:1.5, shallowFlat:1.4, deepFlat:1.4 });
    this.baseShapeType = nextShape;
    this.isCustomShape = false;

    this.updateShapeUIVisibility();

    if (nextShape === "freeform") {
      this.editablePolygon = EditablePolygon.fromRectangle(
        this.poolParams.length,
        this.poolParams.width
      );
      this.editablePolygon.isRectangular = true;
      this.editablePolygon.minVertices = 3;
    } else {
      this.editablePolygon = null;
      this.destroyPoolEditor();
      this._purgePoolEditorHandles();
    }

    this.syncSlidersFromParams();
    await this.rebuildPoolForCurrentShape();

    if (nextShape !== "freeform") {
      this.destroyPoolEditor();
      this._purgePoolEditorHandles();
    }

    try { this.caustics?.attachToGroup?.(this.poolGroup); } catch (_) {}
    this.refreshDisplayedShapeLabel();
    this._notifyDesignerStateChanged?.();
  }

  setupShapeDropdown() {
    const select = document.getElementById("shape");
    if (!select) return;

    select.value = this.poolParams.shape;
    this.refreshDisplayedShapeLabel();

    select.addEventListener("change", async (e) => {
      await this.setPoolShape(e.target.value);
    });
  }

  formatShapeLabel(shape) {
    if (shape === "rectangular") return "Rectangular";
    if (shape === "L") return "L-Shape";
    if (shape === "oval") return "Oval";
    if (shape === "kidney") return "Kidney";
    if (shape === "freeform") return "Freeform (editable)";
    if (shape === "lap") return "Lap Pool";
    if (shape === "plunge") return "Plunge Pool";
    return shape;
  }

  _polygonHasCurves() {
    return !!this.editablePolygon?.edges?.some?.((e) => !!e?.isCurved && !!e?.control);
  }

  _isAxisAlignedRectangle(verts = []) {
    if (!Array.isArray(verts) || verts.length !== 4) return false;
    const xs = [...new Set(verts.map((v) => Number(v.x.toFixed(4))))];
    const ys = [...new Set(verts.map((v) => Number(v.y.toFixed(4))))];
    return xs.length === 2 && ys.length === 2;
  }

  refreshDisplayedShapeLabel() {
    const select = document.getElementById("shape");
    if (!select) return;

    const base = this.baseShapeType || this.poolParams.shape;

    Array.from(select.options).forEach((opt) => {
      opt.textContent = this.formatShapeLabel(opt.value);
    });

    const activeValue = this.isCustomShape ? base : this.poolParams.shape;
    const activeOption = Array.from(select.options).find((opt) => opt.value === activeValue);

    if (activeOption) {
      const baseLabel = this.formatShapeLabel(base);
      activeOption.textContent = this.isCustomShape ? `Custom ${baseLabel}` : baseLabel;
      select.value = activeValue;
    }
  }

  checkIfPolygonReturnedToBaseShape() {
    if (!this.editablePolygon?.vertices?.length) return false;
    if (this._polygonHasCurves()) return false;

    const verts = this.editablePolygon.vertices;

    if (this.baseShapeType === "rectangular") {
      return this._isAxisAlignedRectangle(verts);
    }

    if (this.baseShapeType === "L") {
      return verts.length === 6;
    }

    return false;
  }

  normalizeShapeLabelIfNeeded() {
    if (this.checkIfPolygonReturnedToBaseShape()) {
      this.isCustomShape = false;
      this.poolParams.shape = this.baseShapeType;
      this.destroyPoolEditor();
    }
    this.refreshDisplayedShapeLabel();
    this.updateShapeUIVisibility();
  }

  updateShapeUIVisibility() {
    const shape = this.poolParams.shape;

    const kidney = document.getElementById("kidney-controls");
    const lshape = document.getElementById("lshape-controls");
    const freeform = document.getElementById("freeform-hint");

    if (kidney) kidney.style.display = shape === "kidney" ? "block" : "none";
    if (lshape) lshape.style.display = shape === "L" ? "block" : "none";
    if (freeform) {
      freeform.style.display = (shape === "freeform" || this.isCustomShape) ? "block" : "none";
    }
  }

  // --------------------------------------------------------------
  // SPA SLIDERS
  // --------------------------------------------------------------
  setupSpaSliders() {
    this.refreshSpaDimensionLabels();
    ["spaLength", "spaWidth", "spaTopHeight"].forEach((id) => {
      const slider = document.getElementById(id);
      const output = document.getElementById(`${id}-val`);
      if (!slider) return;

      slider.addEventListener("pointerdown", () => this.captureUndoState("Spa edit"));

      slider.addEventListener("input", async (e) => {
        if (!this.spa) return;

        const val = parseFloat(e.target.value);
        if (output) output.textContent = val.toFixed(2) + " m";

        const isCircularSpa = (this.spa?.userData?.spaShape || "square") === "circular";
        if (id === "spaLength") {
          this.spa.userData.spaLength = val;
          if (isCircularSpa) {
            this.spa.userData.spaWidth = val;
            const widthSlider = document.getElementById("spaWidth");
            const widthOutput = document.getElementById("spaWidth-val");
            if (widthSlider) widthSlider.value = String(val);
            if (widthOutput) widthOutput.textContent = val.toFixed(2) + " m";
          }
        } else if (id === "spaWidth") {
          this.spa.userData.spaWidth = val;
          if (isCircularSpa) {
            this.spa.userData.spaLength = val;
            const lengthSlider = document.getElementById("spaLength");
            const lengthOutput = document.getElementById("spaLength-val");
            if (lengthSlider) lengthSlider.value = String(val);
            if (lengthOutput) lengthOutput.textContent = val.toFixed(2) + " m";
          }
        } else if (id === "spaTopHeight") {
          setSpaTopOffset(val);
        }

        updateSpa(this.spa);
        this.applyPoolElevation();
        this.refreshSpaTopOffsetSlider();
        this._notifyDesignerStateChanged?.();
        await this.pbrManager.applyTilesToSpa(this.spa);

        this._refreshSpaDependentGeometry();
      });
    });
  }

  // --------------------------------------------------------------
  // POOL SLIDERS
  // --------------------------------------------------------------
  // --------------------------------------------------------------
  // PERFORMANCE: live preview (cheap) + debounced rebuild (expensive)
  // --------------------------------------------------------------
  async _setLiveDragging(isDragging) {
    this._live.dragging = !!isDragging;

    // When the user releases the slider/handle, force the accurate rebuild to
    // finish before reapplying section voids/caps. Without this await, section
    // refresh can run against the pre-rebuild geometry and then be left stale.
    if (!this._live.dragging) {
      await this._flushRebuildNow();
      await this._refreshSectionViewAfterGeometryEdit({ moveCamera: false, fullReset: true });
    }
  }

  _scheduleRebuildDebounced() {
    // Always debounce rebuilds on rapid slider changes
    if (this._live.rebuildTimer) clearTimeout(this._live.rebuildTimer);

    this._live.rebuildTimer = setTimeout(() => {
      this._live.rebuildTimer = 0;
      // If still dragging, keep it debounced (don’t rebuild mid-drag unless they pause)
      if (this._live.dragging) return;
      this._flushRebuildNow();
    }, this._live.rebuildDebounceMs);
  }

  async _flushRebuildNow() {
    if (this._live.rebuildTimer) {
      clearTimeout(this._live.rebuildTimer);
      this._live.rebuildTimer = 0;
    }

    // If nothing changed, skip
    if (!this._live.commitNeeded && !this._live.dirty.size) return;

    // Clear any live preview scaling before rebuilding for real
    try { this.poolGroup?.scale?.set?.(1, 1, 1); } catch (_) {}

    await this.rebuildPoolForCurrentShape();

    // Defensive caustics re-attach (materials may be swapped)
    try { this.caustics?.attachToGroup?.(this.poolGroup); } catch (_) {}
    await this._refreshSectionViewAfterGeometryEdit({ moveCamera: false, fullReset: true });
  }

  async _runAccurateLiveRebuild() {
    if (this._live.accuratePreviewInFlight) {
      this._live.accuratePreviewQueued = true;
      return;
    }

    this._live.accuratePreviewInFlight = true;
    this._live.accuratePreviewQueued = false;

    try {
      await this.rebuildPoolForCurrentShape();
      try { this.caustics?.attachToGroup?.(this.poolGroup); } catch (_) {}
    } finally {
      this._live.accuratePreviewInFlight = false;

      if (this._live.accuratePreviewQueued && this._live.dragging) {
        this._schedulePreviewTick();
      }
    }
  }

  _scheduleAccurateLiveRebuild() {
    const now = performance.now ? performance.now() : Date.now();
    const minDt = 1000 / Math.max(1, this._live.accuratePreviewFps || 12);

    if ((now - (this._live.lastAccuratePreviewTs || 0)) < minDt) {
      this._live.accuratePreviewQueued = true;
      return;
    }

    this._live.lastAccuratePreviewTs = now;
    this._runAccurateLiveRebuild();
  }

  _schedulePreviewTick() {
    if (this._live.previewRaf) return;

    const tick = (ts) => {
      this._live.previewRaf = 0;

      const minDt = 1000 / Math.max(1, this._live.previewFps);
      if (ts - this._live.lastPreviewTs < minDt) {
        this._live.previewRaf = requestAnimationFrame(tick);
        return;
      }
      this._live.lastPreviewTs = ts;

      // Do live preview while dragging OR while input events are streaming in (e.g. keyboard/scroll updates).
      const streaming = (ts - (this._live.lastInputTs || 0)) < (this._live.previewStreamMs || 200);
      if (this._live.dirty.size && (this._live.dragging || streaming)) {
        this._applyLivePreviewFromDirty();
        this._live.previewRaf = requestAnimationFrame(tick);
      }
    };

    this._live.previewRaf = requestAnimationFrame(tick);
  }

  _applyLivePreviewFromDirty() {
    if (!this.poolGroup) return;

    const base = this._live.baseParams || this.poolGroup.userData?.poolParams || this.poolParams;
    const p = this.poolParams;

    // Hybrid lightweight preview:
    // - length/width: scale X/Y (keeps meshes/materials/sims intact)
    // - shallow/deep/shallowFlat/deepFlat: vertex-only floor Z updates + wall height (no group Z scaling)
    // - everything else: rely on debounced rebuild
    let sx = 1, sy = 1;

    const footprintDirty = this._live.dirty.has("length") || this._live.dirty.has("width");
    const notchDirty = this._live.dirty.has("notchLengthX") || this._live.dirty.has("notchWidthY");
    const stepGeometryDirty =
      this._live.dirty.has("stepWidth") ||
      this._live.dirty.has("stepCount");
    if (stepGeometryDirty) {
      this.poolGroup.scale.set(1, 1, 1);
      this._scheduleAccurateLiveRebuild();
    }
    const isLShape = (p.shape || base.shape || this.poolGroup?.userData?.poolParams?.shape) === "L";

    if (footprintDirty && !isLShape) {
      const baseL = Math.max(0.001, base.length ?? 1);
      const baseW = Math.max(0.001, base.width ?? 1);
      sx = Math.max(0.01, (p.length ?? baseL) / baseL);
      sy = Math.max(0.01, (p.width ?? baseW) / baseW);
    } else {
      // Preserve current X/Y scaling if only depth is changing.
      sx = this.poolGroup.scale.x || 1;
      sy = this.poolGroup.scale.y || 1;
    }

    // Apply footprint scaling preview (NO Z scaling — keeps coping/steps semantics correct)
    this.poolGroup.scale.set(sx, sy, 1);

    if (footprintDirty || (isLShape && notchDirty)) {
      if (isLShape) {
        // L-shape footprint edits change the notch/coping topology, so a simple
        // scale preview is visually wrong. Run throttled accurate rebuilds while
        // the slider is moving so the footprint updates live. This also applies
        // to notch length/width, because they change the actual footprint.
        this.poolGroup.scale.set(1, 1, 1);
        this._scheduleAccurateLiveRebuild();
      } else {
        // Rebake UVs during live footprint preview so tile density updates live
        // instead of stretching until the debounced rebuild completes.
        this.rebakePoolTilingUVs();
      }
    }

    const depthDirty =
      this._live.dirty.has("shallow") ||
      this._live.dirty.has("deep") ||
      this._live.dirty.has("shallowFlat") ||
      this._live.dirty.has("deepFlat") ||
      this._live.dirty.has("stepDepth");

    if (depthDirty) {
      const useAccurateDepthRebuild = !!this.isCustomShape || this.poolParams.shape === "freeform";

      if (useAccurateDepthRebuild) {
        // Custom / editable outlines don’t respond safely to the lightweight wall-height
        // preview because segmented wall pieces can drift above the coping while dragging.
        // Force accurate rebuilds instead.
        this.poolGroup.scale.set(1, 1, 1);
        this._scheduleAccurateLiveRebuild();
      } else {
        // Update only what’s needed for a convincing live preview:
        // floor vertex Z + wall height (top stays at z=0) + step height/position.
        previewUpdateDepths(this.poolGroup, {
          shallow: p.shallow,
          deep: p.deep,
          shallowFlat: p.shallowFlat,
          deepFlat: p.deepFlat,
          stepCount: p.stepCount,
          stepDepth: p.stepDepth,
          stepWidth: p.stepWidth,
          stepPosition: p.stepPosition,
        });

        // Rebake UVs during live depth preview so deep-end walls and the last step
        // keep fixed tile density while their Z scale/position changes.
        this.rebakePoolTilingUVs();
      }
    }

    if (this.spa && (footprintDirty || depthDirty)) {
      try {
        this.spa.userData.poolGroup = this.poolGroup || null;
        this.spa.userData.poolParams = this.poolParams;
        snapToPool(this.spa);
        updateSpa(this.spa);
      this.applyPoolElevation();
      } catch (_) {}
    }

    // Void/cutout must follow the live pool footprint and the spa's freshly
    // snapped wall edge. Recompute immediately and once again next frame.
    this._refreshSpaDependentGeometry({ resnapSpa: !!this.spa && footprintDirty });

    if (this.sectionViewEnabled) {
      try { this._refreshSectionViewPresentation(); } catch (_) {}
    }

    // Keep dirty flags until the accurate rebuild commits on release.
    // Otherwise a live preview frame can consume the flags and the release
    // event has nothing left to rebuild, which causes the geometry to stay
    // visually scaled.
  }


  setupPoolSliders() {
    const ids = [
      "length",
      "width",
      "shallow",
      "deep",
      "shallowFlat",
      "deepFlat",
      "stepCount",
      "stepDepth",
      "stepWidth",
      "notchLengthX",
      "notchWidthY",
      "kidneyLeftRadius",
      "kidneyRightRadius",
      "kidneyOffset"
    ];

    const setOutput = (id, val, output) => {
      if (!output) return;
      if (
        id === "length" ||
        id === "width" ||
        id === "shallow" ||
        id === "deep" ||
        id === "shallowFlat" ||
        id === "deepFlat" ||
        id === "stepDepth" ||
        id === "stepWidth" ||
        id === "kidneyLeftRadius" ||
        id === "kidneyRightRadius" ||
        id === "kidneyOffset"
      ) {
        output.textContent = Number(val).toFixed(2) + " m";
      } else if (id === "notchLengthX" || id === "notchWidthY") {
        output.textContent = Number(val).toFixed(2);
      } else {
        output.textContent = String(val);
      }
    };

    const markDirty = (id) => {
      this._live.dirty.add(id);
      this._live.commitNeeded = true;
      this._live.lastInputTs = performance.now ? performance.now() : Date.now();
      // Live preview is throttled; we run it while dragging OR while input events are streaming.
      this._schedulePreviewTick();
      // Accurate rebuild is always debounced (or forced on release)
      this._scheduleRebuildDebounced();
    };

    ids.forEach((id) => {
      const slider = document.getElementById(id);
      const output = document.getElementById(`${id}-val`);
      if (!slider) return;
      if (id === "stepWidth") {
        this.syncStepWidthSliderLimit?.();
      }

      // Detect "dragging" for mouse + touch
      const onDown = () => {
        this.captureUndoState(`Slider:${id}`);
        // capture baseline for preview scaling (only if we have a pool)
        if (!this._live.baseParams) this._live.baseParams = { ...(this.poolGroup?.userData?.poolParams || this.poolParams) };
        this._setLiveDragging(true);
      };
      const onUp = () => this._setLiveDragging(false);

      slider.addEventListener("pointerdown", onDown);
      slider.addEventListener("pointerup", onUp);
      slider.addEventListener("touchstart", onDown, { passive: true });
      slider.addEventListener("touchend", onUp, { passive: true });
      slider.addEventListener("mousedown", onDown);
      window.addEventListener("mouseup", onUp);

      // Continuous updates (cheap preview + debounced rebuild)
      slider.addEventListener("input", (e) => {
        let val = parseFloat(e.target.value);
        if (id === "stepCount") val = Math.floor(val);

        if (id === "stepWidth") {
          const maxWidth = this.getStepWidthSliderMax?.() ?? Math.max(0.5, Number(this.poolParams.width) || 5);
          val = THREE.MathUtils.clamp(val, Number(slider.min) || 0.05, maxWidth);
          e.target.value = String(val);

          // Diagonal/circular corner uses one equal footprint value.
          // Centre circular uses Step Width as diameter and Step Extension as radius.
          if (this.isEqualCornerStepShape?.()) {
            const extensionSlider = document.getElementById("stepExtension");
            const extensionOutput = document.getElementById("stepExtension-val");
            if (extensionSlider) {
              extensionSlider.min = slider.min;
              extensionSlider.max = slider.max;
              extensionSlider.value = String(val);
            }
            if (extensionOutput) extensionOutput.textContent = val.toFixed(2) + " m";
          } else if (this.isCenteredCircularStepShape?.()) {
            const radius = val * 0.5;
            const extensionSlider = document.getElementById("stepExtension");
            const extensionOutput = document.getElementById("stepExtension-val");
            if (extensionSlider) {
              extensionSlider.min = "0.1";
              extensionSlider.max = String((this.getStepWidthSliderMax?.() ?? Math.max(0.5, Number(this.poolParams.width) || 5)) * 0.5);
              extensionSlider.value = String(radius);
            }
            if (extensionOutput) extensionOutput.textContent = radius.toFixed(2) + " m";
          }
        }

        this.poolParams[id] = val;
        if (id === "stepWidth" && this.isEqualCornerStepShape?.()) {
          this.poolParams.diagonalStepSize = val;
          this.poolParams.stepExtension = val;
        } else if (id === "stepWidth" && this.isCenteredCircularStepShape?.()) {
          this.poolParams.stepExtension = val * 0.5;
        }
        setOutput(id, val, output);

        if (id === "stepWidth") {
          // Step width changes are geometry/topology changes for curved walls.
          // Do not run the cheap preview path because it re-centres the existing
          // mesh and can visually move the fixed 300 mm anchor while dragging.
          // Use the accurate rebuild path only, so the fixed edge remains locked.
          this.poolGroup?.scale?.set?.(1, 1, 1);
          this._live.dirty.add(id);
          this._live.commitNeeded = true;
          this._live.lastInputTs = performance.now ? performance.now() : Date.now();
          this._scheduleAccurateLiveRebuild?.();
          this._scheduleRebuildDebounced?.();
          return;
        }

        // For polygon shapes, allow the editor polygon to rescale live (cheap),
        // but do not rebuild full geometry each tick.
        if ((id === "length" || id === "width") && this.isPolygonShape()) {
          try {
            this.editablePolygon?.rescaleTo?.(this.poolParams.length, this.poolParams.width);
            if (this.poolParams.shape === "freeform" && this.editablePolygon) {
              this.editablePolygon.isRectangular = false;
            }
          } catch (_) {}
        }

        markDirty(id);
      });

      // Change event (fires on release in many browsers) forces rebuild now
      slider.addEventListener("change", () => {
        this._setLiveDragging(false);
      });
    });
  }

// --------------------------------------------------------------
// RIPPLE
  // --------------------------------------------------------------
  setupRippleClick() {
    this.renderer.domElement.addEventListener("dblclick", (event) => {
      if (event.button !== 0) return;
      if (this.poolEditor?.isDragging) return;
      if (!this.poolGroup?.userData?.waterMesh) return;

      const rect = this.renderer.domElement.getBoundingClientRect();
      const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(mouseX, mouseY), this.camera);

      const blockers = [];
      this.poolGroup?.traverse((o) => {
        if (o.userData?.isStep || o.userData?.isWall) blockers.push(o);
      });
      this.spa?.traverse((o) => {
        if (o.isMesh && !o.userData?.ignoreClickSelect) blockers.push(o);
      });
      if (blockers.length && ray.intersectObjects(blockers, true).length) {
        return;
      }

      const hit = ray.intersectObject(this.poolGroup.userData.waterMesh);
      if (!hit.length) return;

      const p = hit[0].point;

      // ✅ SAFE GUARD (RESTORES OLD FREEFORM BEHAVIOUR)
      if (typeof this.poolGroup.userData.triggerRipple === "function") {
        this.poolGroup.userData.triggerRipple(
          p.x,
          p.y,
          this.poolParams.length,
          this.poolParams.width
        );
      }
    });
  }

  // --------------------------------------------------------------
  // NEW: keep UI sliders in sync with poolParams
  // --------------------------------------------------------------
  syncSlidersFromParams() {
    const ids = [
      "length",
      "width",
      "shallow",
      "deep",
      "shallowFlat",
      "deepFlat",
      "stepCount",
      "stepDepth",
      "stepWidth",
      "notchLengthX",
      "notchWidthY",
      "kidneyLeftRadius",
      "kidneyRightRadius",
      "kidneyOffset"
    ];

    ids.forEach((id) => {
      const slider = document.getElementById(id);
      const output = document.getElementById(`${id}-val`);
      if (!slider) return;
      if (!(id in this.poolParams)) return;

      if (id === "stepWidth") {
        this.syncStepWidthSliderLimit?.();
      }

      const val = this.poolParams[id];
      slider.value = val;

      if (output) {
        if (
          id === "length" ||
          id === "width" ||
          id === "shallow" ||
          id === "deep" ||
          id === "shallowFlat" ||
          id === "deepFlat" ||
          id === "stepDepth" ||
          id === "stepWidth" ||
          id === "kidneyLeftRadius" ||
          id === "kidneyRightRadius" ||
          id === "kidneyOffset"
        ) {
          output.textContent = Number(val).toFixed(2) + " m";
        } else {
          output.textContent = val.toString();
        }
      }
    });

    // shape dropdown
    const shapeSelect = document.getElementById("shape");
    if (shapeSelect && this.poolParams.shape) {
      shapeSelect.value = this.poolParams.shape;
    }

    const wall = ["west", "east", "north", "south"].includes(this.poolParams.stepWall) ? this.poolParams.stepWall : "west";
    document.querySelectorAll("[data-step-wall]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.stepWall === wall);
    });

    const pos = this.poolParams.stepPosition === "left" || this.poolParams.stepPosition === "right"
      ? this.poolParams.stepPosition
      : "center";
    document.querySelectorAll("[data-step-position]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.stepPosition === pos);
    });
    const shape = (["diagonal", "circular", "radius"].includes(this.poolParams.stepShape)) ? this.poolParams.stepShape : "rectangle";
    document.querySelectorAll("[data-step-shape]").forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.stepShape === shape)
    );
    this.updateCenterCircularModeControls?.();
  }

  // --------------------------------------------------------------
  // WORLD AXIS VIEWPORT INDICATOR
  // --------------------------------------------------------------
  setupWorldAxisIndicator() {
    this.destroyWorldAxisIndicator?.();
    if (!this.renderer?.domElement || !this.camera) return;

    const host = this.renderer.domElement.parentElement || document.body;
    const computed = window.getComputedStyle?.(host);
    if (!computed || computed.position === "static") host.style.position = "relative";

    const canvas = document.createElement("canvas");
    canvas.className = "pool-world-axis-indicator";
    canvas.setAttribute("aria-label", "World axis orientation: X red, Y green, Z blue");
    canvas.style.position = "absolute";
    canvas.style.right = "14px";
    canvas.style.bottom = "14px";
    canvas.style.width = "112px";
    canvas.style.height = "112px";
    canvas.style.zIndex = "30";
    canvas.style.pointerEvents = "none";
    canvas.style.userSelect = "none";
    canvas.style.filter = "drop-shadow(0 2px 5px rgba(0,0,0,0.22))";

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(112 * dpr);
    canvas.height = Math.round(112 * dpr);
    host.appendChild(canvas);

    this._worldAxisIndicator = { canvas, dpr, size: 112 };
    this._updateWorldAxisIndicator();
  }

  _updateWorldAxisIndicator() {
    const state = this._worldAxisIndicator;
    if (!state?.canvas || !this.camera) return;

    const { canvas, dpr, size } = state;
    const wantedDpr = Math.min(window.devicePixelRatio || 1, 2);
    if (Math.abs(wantedDpr - state.dpr) > 1e-6) {
      state.dpr = wantedDpr;
      canvas.width = Math.round(size * wantedDpr);
      canvas.height = Math.round(size * wantedDpr);
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = state.dpr;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size * 0.5;
    const cy = size * 0.49;
    const radius = 48;

    // Neutral plate keeps the icon legible over both water and paving.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(35,45,55,0.20)";
    ctx.stroke();

    const invQ = this.camera.quaternion.clone().invert();
    const axes = [
      { label: "X", color: "#e53935", world: new THREE.Vector3(1, 0, 0) },
      { label: "Y", color: "#43a047", world: new THREE.Vector3(0, 1, 0) },
      { label: "Z", color: "#1e88e5", world: new THREE.Vector3(0, 0, 1) }
    ].map((axis) => {
      const v = axis.world.clone().applyQuaternion(invQ).normalize();
      return { ...axis, view: v };
    });

    // Draw axes pointing farther away first so forward-facing axes stay readable.
    axes.sort((a, b) => b.view.z - a.view.z);

    const drawArrow = (axis) => {
      const v = axis.view;
      const projected = Math.hypot(v.x, v.y);
      const length = 34 * Math.max(projected, 0.18);
      const ux = projected > 1e-5 ? v.x / projected : 0;
      const uy = projected > 1e-5 ? -v.y / projected : -1;
      const ex = cx + ux * length;
      const ey = cy + uy * length;

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = axis.color;
      ctx.fillStyle = axis.color;
      ctx.globalAlpha = v.z > 0 ? 0.62 : 1;
      ctx.lineWidth = 3;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      const arrow = 6;
      const px = -uy;
      const py = ux;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - ux * arrow - px * arrow * 0.55, ey - uy * arrow - py * arrow * 0.55);
      ctx.lineTo(ex - ux * arrow + px * arrow * 0.55, ey - uy * arrow + py * arrow * 0.55);
      ctx.closePath();
      ctx.fill();

      // Label follows the projected endpoint. If an axis is almost pointing
      // directly at the camera, the short arrow still communicates its colour.
      const lx = cx + ux * (length + 10);
      const ly = cy + uy * (length + 10);
      ctx.globalAlpha = 1;
      ctx.font = "700 12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(axis.label, lx, ly);
      ctx.restore();
    };

    axes.forEach(drawArrow);

    ctx.beginPath();
    ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(40,48,58,0.85)";
    ctx.fill();

    ctx.font = "600 8px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(38,48,58,0.72)";
    ctx.fillText("WORLD", cx, size - 5);
  }

  destroyWorldAxisIndicator() {
    const canvas = this._worldAxisIndicator?.canvas;
    if (canvas?.parentElement) canvas.parentElement.removeChild(canvas);
    this._worldAxisIndicator = null;
  }

  // --------------------------------------------------------------
  // LOOP
  // --------------------------------------------------------------
  animate(_fromRAF = false) {
    // Prevent accidental calls to animate() from creating additional RAF loops.
    // Recursive RAF callbacks pass true and are allowed to continue the active loop.
    if (!_fromRAF) {
      if (this._animationLoopActive) return;
      this._animationLoopActive = true;
    }
    if (this._disposed) return;
    this._animationFrameId = requestAnimationFrame(() => this.animate(true));

    // The containing website temporarily pauses expensive WebGL work while the
    // outer document is scrolling or the designer is outside the viewport.
    // Keep the RAF alive so resuming is immediate, but skip simulation and render.
    if (this._renderPaused) {
      this.clock.getDelta();
      return;
    }

    // Clamp long frames (tab switching, DevTools pauses, shader compilation) so the
    // water simulation cannot jump forward or receive an unstable time step.
    const rawDelta = this.clock.getDelta();
    const delta = Math.min(Math.max(rawDelta, 0), 1 / 30);

const dirLight = this.scene?.userData?.dirLight || null;

// A water object may appear in group.animatables and also in the dedicated water
// references. Animate every object at most once per rendered frame.
const animatedThisFrame = new Set();
const animateObjectOnce = (obj) => {
  if (!obj || animatedThisFrame.has(obj)) return;
  animatedThisFrame.add(obj);
  obj.userData?.animate?.(delta, this.clock, this.camera, dirLight, this.renderer);
};

if (this.poolGroup?.userData?.animatables) {
  this.poolGroup.userData.animatables.forEach(animateObjectOnce);
}

spas.forEach((spaItem) => {
  animateObjectOnce(spaItem.userData.waterMesh);
  animateObjectOnce(spaItem.userData.spilloverMesh);
});

this.scene?.traverse?.((obj) => {
  if (obj?.userData?.isSpaChannelWater) animateObjectOnce(obj);
});

// Pool water animation (GPU sim). The Set prevents a duplicate update when the
// same mesh is already present in poolGroup.userData.animatables.
animateObjectOnce(this.poolGroup?.userData?.waterMesh);

    if (this.caustics) {
      if (!this._loggedCausticsTick) { console.log('✅ Caustics update ticking'); this._loggedCausticsTick = true; }
      const wm = this.poolGroup?.userData?.waterMesh;
      const ht = wm?.material?.uniforms?.heightTex?.value || null;
      this.caustics.setPrimaryGroup?.(this.poolGroup);
      this.caustics.setWaterHeightTexture?.(ht, 256);
      // Use the calibrated HDRI sun vector when available. DirectionalLight.position
      // is an absolute world point and can become a poor direction proxy after its
      // target is moved to follow a rebuilt pool.
      const causticsSunDir = this.scene?.userData?.hdriSunDirection ||
        ((dirLight && dirLight.position && dirLight.target?.position)
          ? dirLight.position.clone().sub(dirLight.target.position).normalize()
          : null);
      this.caustics.update(delta, causticsSunDir);
    }
// Keep freeform handles screen-aligned and interactive
    if (this.poolParams.shape === "freeform") {
      this.poolEditor?.update?.();
    } else if (this.poolEditor) {
      this.destroyPoolEditor();
      this._purgePoolEditorHandles();
    }

    this._updateDimensionHandles();
    this._updateOvalInfinityHandles();
    this._updateLInfinityHandles?.();
    this._updateStraightInfinityHandles?.();
    this._updateSpaDimensionHandles();
    this._updateSectionDimensionHandles();
    this.scene?.userData?.grassSystem?.update?.(this.camera);

    if (this.sectionViewEnabled) {
      const nextSectionSig = this._getSectionViewSignature();
      if (nextSectionSig !== this.sectionViewSignature) {
        this._refreshSectionViewPresentation();
      }
    }

    // Keep selection/hover highlight meshes locked to the live world-space
    // transforms of their targets while the pool is being preview-scaled or rebuilt.
    if (!this.sectionViewEnabled) {
      if (this.selectedWall && this.selectedWallHighlightMesh?.visible) {
        this.updateHighlightForWall(this.selectedWall, true);
      }
      this._updateWallRaisePromptAnimation?.();
      if (this.hoveredWall && this.hoverWallHighlightMesh?.visible) {
        this.updateHighlightForWall(this.hoveredWall, false);
      }
      if (this.selectedStep && this.selectedHighlightMesh?.visible) {
        this.updateHighlightForStep(this.selectedStep, true);
      }
      if (this.hoveredStep && this.hoverHighlightMesh?.visible) {
        this.updateHighlightForStep(this.hoveredStep, false);
      }
    } else {
      this._syncSectionSelectionEffects();
    }

    // Stylized water prepass:
// Render scene WITHOUT any water meshes into offscreen RTs, then let the water shader
// sample those textures for refraction + thickness absorption.
const _poolWater = this.poolGroup?.userData?.waterMesh || null;
const _poolU = _poolWater?.material?.uniforms || null;
const _spaWaters = spas
  .map((s) => s?.userData?.waterMesh)
  .filter((wm) => !!wm && wm !== _poolWater);
const _channelWaters = [];
this.scene?.traverse?.((obj) => {
  if (obj?.userData?.isSpaChannelWater) _channelWaters.push(obj);
});

// Collect all water meshes (pool + spas + channel waters) so none of them contaminate the prepasses
const _hiddenWater = [];
if (_poolWater) _hiddenWater.push(_poolWater);
_spaWaters.forEach((wm) => _hiddenWater.push(wm));
_channelWaters.forEach((wm) => _hiddenWater.push(wm));

if (_poolWater && _poolU && this._waterInteriorRT) {
  // Use drawing-buffer size (accounts for devicePixelRatio), because gl_FragCoord is in buffer pixels
  const _buf = new THREE.Vector2();
  this.renderer.getDrawingBufferSize(_buf);

  // Keep RT sizes synced (defensive: resize handler covers most cases, but DPR can change)
  if (this._waterInteriorRT.width !== _buf.x || this._waterInteriorRT.height !== _buf.y) {
    this._waterInteriorRT.setSize(_buf.x, _buf.y);
  }
  if (this._waterDepthRT && (this._waterDepthRT.width !== _buf.x || this._waterDepthRT.height !== _buf.y)) {
    this._waterDepthRT.setSize(_buf.x, _buf.y);
  }

  if (_poolU.resolution) _poolU.resolution.value.set(_buf.x, _buf.y);
  if (_poolU.interiorTex) _poolU.interiorTex.value = this._waterInteriorRT.texture;

  [..._spaWaters, ..._channelWaters].forEach((wm) => {
    const u = wm?.material?.uniforms || null;
    if (!u) return;
    if (u.resolution) u.resolution.value.set(_buf.x, _buf.y);
    if (u.cameraNear) u.cameraNear.value = this.camera.near;
    if (u.cameraFar)  u.cameraFar.value  = this.camera.far;
  });

  // Hide water meshes for BOTH passes
  _hiddenWater.forEach((m) => (m.visible = false));

  // Depth prepass (DepthTexture) – must not contain water
  if (this._waterDepthRT && _poolU.depthTex) {
    _poolU.depthTex.value = this._waterDepthRT.depthTexture;
    if (_poolU.cameraNear) _poolU.cameraNear.value = this.camera.near;
    if (_poolU.cameraFar)  _poolU.cameraFar.value  = this.camera.far;

    // Render scene depth into the DepthTexture target
    this.renderer.setRenderTarget(this._waterDepthRT);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    // Re-bind (defensive) – in case a rebuild replaced water material/uniforms
    if (_poolWater?.userData?.setDepthTex) _poolWater.userData.setDepthTex(this._waterDepthRT.depthTexture);
    [..._spaWaters, ..._channelWaters].forEach((wm) => wm?.userData?.setDepthTex?.(this._waterDepthRT.depthTexture));
  }

  // Color prepass (scene without water) for refraction
  this.renderer.setRenderTarget(this._waterInteriorRT);
  this.renderer.clear(true, true, true);
  this.renderer.render(this.scene, this.camera);
  this.renderer.setRenderTarget(null);

  if (_poolWater?.userData?.setInteriorTex) _poolWater.userData.setInteriorTex(this._waterInteriorRT.texture);
  [..._spaWaters, ..._channelWaters].forEach((wm) => wm?.userData?.setInteriorTex?.(this._waterInteriorRT.texture));

  // Restore visibility
  _hiddenWater.forEach((m) => (m.visible = true));
}

this.controls.update();
this.scene?.userData?.constrainOrbitAboveGround?.();
    const finalRender = this.scene?.userData?.renderWithPostFX;
    if (typeof finalRender === "function") finalRender();
    else this.renderer.render(this.scene, this.camera);
    this._updateWorldAxisIndicator?.();

    // Lightweight production telemetry using Three.js renderer.info.
    const now = performance.now();
    this._renderMetrics ||= { startedAt: now, frames: 0, lastReportAt: now };
    this._renderMetrics.frames += 1;
    if (now - this._renderMetrics.lastReportAt >= 2000) {
      const elapsed = Math.max(1, now - this._renderMetrics.lastReportAt);
      const fps = (this._renderMetrics.frames * 1000) / elapsed;
      const calls = this.renderer.info.render.calls;
      const triangles = this.renderer.info.render.triangles;
      this.scene.userData.performanceMetrics = { fps, drawCalls: calls, triangles, sampledAt: now };
      if (fps < 55 || calls > 200) {
        console.warn(`[3D Performance] ${fps.toFixed(1)} FPS, ${calls} draw calls, ${triangles.toLocaleString()} triangles`);
      }
      this._renderMetrics.frames = 0;
      this._renderMetrics.lastReportAt = now;
    }
  }

  dispose() {
    this._disposed = true;
    this._animationLoopActive = false;
    if (this._animationFrameId != null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
    this.destroyWorldAxisIndicator?.();
    this.destroyPoolEditor();
    this.destroyDimensionHandles();
    this.destroySectionDimensionHandles();
    this.controllers?.disposeAll?.();
    this.poolParams?.destroy?.();
  }
}
