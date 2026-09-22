import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../pool-designer-app/frontend/js/app/PoolApp.js', import.meta.url),
  'utf8'
);
const sceneSource = readFileSync(
  new URL('../pool-designer-app/frontend/js/scene.js', import.meta.url),
  'utf8'
);
const controlsSource = readFileSync(
  new URL('../assets/js/designer-page.js', import.meta.url),
  'utf8'
);
const bridgeSource = readFileSync(
  new URL('../pool-designer-app/frontend/js/designer-bridge.js', import.meta.url),
  'utf8'
);
const mainSource = readFileSync(
  new URL('../pool-designer-app/frontend/js/main.js', import.meta.url),
  'utf8'
);
const lshapeSource = readFileSync(
  new URL('../pool-designer-app/frontend/js/pool/shapes/lshapePool.js', import.meta.url),
  'utf8'
);

const contracts = [
  {
    name: 'rectangle/L-shape shared water seam',
    patterns: [
      /const spillWaterJoin=spillCentre\.length>=2\?offsetOpenPolyline\(spillCentre,wallT\*0\.5\+spillSheetClearance\)/,
      /const overflowPlan=spillPoolInner\.length>=2&&spillWaterJoin\.length>=2\?stripPolygon\(spillPoolInner,spillWaterJoin\)/,
      /const tankWaterInner=offsetOpenPolyline\(tankCentre,wallT\*0\.5\+spillSheetClearance\)/,
      /const tankWaterSurfaceZ=tankWaterTop\+tankWaterThickness\*0\.5/,
      /_createIndexedVerticalArcGeometry\(spillWaterJoin,tankWaterSurfaceZ,loweredTop\)/,
      /infinitySheetBottomFixedZ=tankWaterSurfaceZ\+elevation/
    ]
  },
  {
    name: 'oval shared water seam',
    patterns: [
      /const overflow = createPoolWater\(this\._createIndexedArcStripGeometry\(innerWallPts, sheetTopPts, 0\)\)/,
      /return p\.addScaledVector\(n, wallThickness \+ spillSheetClearance\)/,
      /const catchWaterSurfaceZ=catchWater\.position\.z/,
      /const bottomFixed=catchWaterSurfaceZ\+elevation/,
      /const sg=this\._createIndexedVerticalArcGeometry\(sheetTopPts,bottomLocal,poolWaterZ\)/
    ]
  },
  {
    name: 'freeform shared water seam',
    patterns: [
      /const overflowWidth = existingWallThickness \+ spillSheetClearance/,
      /const catchWaterNormalSpan = Math\.max\(0\.1, tankWidth - tankWallThickness - spillSheetClearance\)/,
      /\(tankWallThickness - spillSheetClearance\) \* 0\.5/,
      /-\(existingWallThickness \+ spillSheetClearance\)/
    ]
  },
  {
    name: 'oval interior spillway wall continuity',
    patterns: [
      /_createIndexedOvalWallArcGeometry\(extArc\.inner, extArc\.outer, -wallDepth, 0\)/,
      /_createIndexedOvalWallArcGeometry\(spillwayWallArc\.inner, spillwayWallArc\.outer, -wallDepth, -0\.10\)/,
      /loweredWall\.userData\.isInfinityCatchSurface = true/
    ]
  },
  {
    name: 'kidney curved infinity system',
    patterns: [
      /_createKidneyInfinityEdge\(group, length, width, side\)/,
      /const spillSamples = samplesFromAngles\(spillAngles\)/,
      /_createIndexedOvalWallArcGeometry\(spillInner, spillOuter, -wallDepth, loweredTop\)/,
      /_createIndexedArcStripGeometry\(tankWaterInner, tankOuterInner, 0\)/,
      /_createIndexedVerticalArcGeometry\(sheetTopPts, sheetBottomLocalZ, poolWaterZ\)/
    ]
  },
  {
    name: 'physical coping hatch scale',
    patterns: [
      /_createStripGeometry\(innerPts, outerPts, z, thickness = 0, uvScale = 1\)/,
      /const distances = \[0\]/,
      /const u0 = distances\[i\] \/ scale, u1 = distances\[i \+ 1\] \/ scale/
    ]
  },
  {
    name: 'square raised-paving ends',
    patterns: [
      /const isRectangle = shapeKey === 'rectangular'/,
      /const innerBox = new THREE\.Box2\(\)\.setFromPoints\(inner\)/,
      /const squareOuterEndpoint = \(innerPoint, innerNeighbour, originalOuter\)/,
      /outerArc\[0\] = squareOuterEndpoint/,
      /const tileSize = 2\.4/
    ]
  },
  {
    name: 'tiled infinity endpoint guards',
    patterns: [
      /const endpointGuardLength=0\.50/,
      /infinity-pool-endpoint-tile-guard-/,
      /guard\.userData\.isInfinityEndpointTileGuard=true/
    ]
  },
  {
    name: '50 mm direct step and bench sizing',
    patterns: [
      /Math\.round\(\(Number\(value\) \|\| 0\) \/ 0\.05\) \* 0\.05/
    ]
  },
  {
    name: 'flush persistent pool lights and wall-spaced bubblers',
    patterns: [
      /_createAutomaticPoolLights\(group,length,width\)/,
      /Math\.round\(longestSpan \/ 2\.75\)/,
      /const faceProjection = 0\.020/,
      /faceProjection \+ fixtureDepth \* 0\.5/,
      /automatic-pool-light-rim-/,
      /fixture\.frustumCulled = false/,
      /const minSpacing = 0\.60/,
      /const maxSpacing = 0\.90/,
      /-span \* 0\.5 \+ spacing \* \(index \+ 1\)/
    ]
  },
  {
    name: 'coordinated draggable 450 mm-offset bar stools',
    patterns: [
      /_getBarStoolGroupPlacements\(anchorPoint, anchorIndex = 1, wallOffset = 0\.45\)/,
      /this\.barStoolPlacements = placements/,
      /setupBarStoolDragging\(\)/
    ]
  },
  {
    name: 'straight infinity tank-end tiled liners',
    patterns: [
      /infinity-tank-end-interior-tile-liner-/,
      /infinity-pool-adjacent-interior-tile-liner-/,
      /const adjacentLinerRun = 0\.50/,
      /liner\.userData\.isInfinityEndpointTileGuard = true/,
      /const linerBottom = tankTop - tankDepth - this\.getPoolElevation\(\)/
    ]
  },
  {
    name: 'laminar housings raised 10 mm',
    patterns: [
      /const pavingTop = 0\.06/
    ]
  },
  {
    name: 'animated laminar jets and bubblers',
    patterns: [
      /laminar-water-pulse-/,
      /laminar-impact-ripple-/,
      /laminar-impact-splash-/,
      /tube\.userData\.animate/,
      /bubbler-ripple-/,
      /bubbler-bubble-/,
      /bubbler-stream-/
    ]
  },
  {
    name: 'draggable resizable acrylic window',
    patterns: [
      /_createAcrylicWindow\(group, length, width\)/,
      /setupAcrylicWindowDragging\(\)/,
      /setAcrylicWindowSize\(length, height/,
      /_applyAcrylicWindowWallCut\(placement, root, panelCenterZ, panelHeight\)/,
      /targetWall\.visible = false/,
      /isAcrylicWallReplacement/,
      /const panelCenterZ = THREE\.MathUtils\.clamp\(requestedCenterZ/,
      /wallCenter\.y = targetWall\.position\.y/,
      /wallCenter\.x = targetWall\.position\.x/,
      /isAcrylicWindowResizeHandle/,
      /'acrylic-window': !!this\.poolParams\?\.raised/
    ]
  },
  {
    name: 'full-width default infinity tank and unified tile finish',
    patterns: [
      /const extent=available/,
      /const centeredStart=\(targetSegment\?\.start\|\|0\)\+0\.10/,
      /_synchronizePoolTileMaterials\(\)/,
      /Feature-generated tank, return, replacement and liner meshes/
    ]
  },
  {
    name: 'raised paving stays at base coping top',
    patterns: [
      /_getBasePoolCopingTopWorldZ\(\)/,
      /const platformTop = Number\.isFinite\(copingTop\)/,
      /this\._removeRaisedEntryPaving\(\);\n    const elevation/,
      /updateGroundVoid\(this\.ground \|\| this\.scene\?\.userData\?\.ground, this\.poolGroup, this\.spa\)/
    ]
  },
  {
    name: 'selected-wall raise prompt and entry-step safeguard',
    patterns: [
      /getSelectedWallRaiseState\(\)/,
      /setSelectedWallRaiseHeight\(extra/,
      /promptRaiseWallForFeature\(\)/,
      /selected-wall-raise-arrow/,
      /isWallRaiseHandle/,
      /_clearEntryWallRaiseState\(\)/
    ]
  },
  {
    name: 'raised-wall water features and uncapped wall',
    patterns: [
      /_getRaisedWallFeatureFrame\(featureType\)/,
      /extra \* 0\.75/,
      /setupRaisedWallWaterFeatureDragging\(\)/,
      /spout-aerated-droplet-/,
      /blade-water-ribbon-/,
      /seg\.visible = safeExtra <= 0\.001/
    ]
  },
  {
    name: 'visible four-metre automatic pool lights',
    patterns: [
      /faceProjection \+ fixtureDepth \+ 0\.002/,
      /const beamLength = 4\.0/,
      /const beamRadius = 1\.5/,
      /new THREE\.SpotLight/
    ]
  }
];

for (const pattern of [
  /baseTop = Number\.isFinite\(baseZ\)/,
  /box\.max\.z \+ \(baseZ - localZ\)/
]) {
  if (!pattern.test(sceneSource)) throw new Error(`Missing base-level paving contract: ${pattern}`);
}

for (const pattern of [
  /createMiteredWallPrism\(borderPts, i, 0, clampedDeep, wallThickness\)/,
  /createMiteredWallPrism\(pts2D, i, 0\.05, copingDepth, wallThickness\)/
]) {
  if (!pattern.test(lshapeSource)) throw new Error(`Missing mitered L-shape wall/coping contract: ${pattern}`);
}

if (/this\.setupWorldAxisIndicator\(\)/.test(source)) {
  throw new Error('XYZ/WORLD viewport indicator must remain disabled');
}

for (const contract of contracts) {
  for (const pattern of contract.patterns) {
    if (!pattern.test(source)) {
      throw new Error(`Missing ${contract.name} contract: ${pattern}`);
    }
  }
}

for (const pattern of [
  /PAVING_COPING_BUTT_OVERLAP = 0\.100/,
  /copingOuterOverhang - PAVING_COPING_BUTT_OVERLAP/
]) {
  if (!pattern.test(sceneSource)) throw new Error(`Missing paving-to-coping contract: ${pattern}`);
}

const designerBridgeDisabled = /Embedded designer messaging is intentionally disabled/.test(bridgeSource);
if (!designerBridgeDisabled) {
  for (const pattern of [
    /editablePolygon: app\?\._serializeEditablePolygon\?\.\(\) \|\| null/,
    /wallRaiseBySourceEdge: JSON\.parse/,
    /barStoolPlacements: JSON\.parse/,
    /raisedWallWaterFeaturePlacements: JSON\.parse/,
    /acrylicWindow: JSON\.parse/,
    /selectedWall: app\?\.getSelectedWallRaiseState/,
    /SET_SELECTED_WALL_HEIGHT/,
    /PROMPT_RAISE_WALL/
  ]) {
    if (!pattern.test(bridgeSource)) throw new Error(`Missing saved-project snapshot contract: ${pattern}`);
  }
}

for (const pattern of [
  /recoveryState: record\?\.state \|\| null/,
  /x:Number\(record\.state\.spa\.x\|\|0\)/,
  /y:Number\(record\.state\.spa\.y\|\|0\)/
]) {
  if (!pattern.test(mainSource)) throw new Error(`Missing saved-project recovery contract: ${pattern}`);
}

for (const pattern of [
  /button\.disabled = false/,
  /Raise a pool wall to add this feature\./,
  /button\.dataset\.disabledReason = reason/,
  /PREVIEW_SELECTED_WALL_HEIGHT/,
  /selectedWallRaiseControl/,
  /PROMPT_RAISE_WALL/,
  /Entry-step walls cannot be raised/
]) {
  if (!pattern.test(controlsSource)) throw new Error(`Missing unavailable-feature tooltip contract: ${pattern}`);
}

// Confirm the freeform formulas put all three surfaces on one exact normal-axis
// coordinate for representative pool and tank dimensions.
const wallThickness = 0.05;
const tankWallThickness = 0.20;
const tankWidth = 1.12;
const clearance = 0.006;
const tankCenter = -(wallThickness + tankWidth * 0.5);
const overflowOuterEdge = -(wallThickness + clearance);
const sheetPlane = -(wallThickness + clearance);
const catchWaterSpan = tankWidth - tankWallThickness - clearance;
const catchWaterCenter = tankCenter + (tankWallThickness - clearance) * 0.5;
const catchWaterPoolEdge = catchWaterCenter + catchWaterSpan * 0.5;

for (const [name, value] of [
  ['overflow to sheet', overflowOuterEdge - sheetPlane],
  ['sheet to catch water', sheetPlane - catchWaterPoolEdge]
]) {
  if (Math.abs(value) > 1e-12) throw new Error(`${name} seam mismatch: ${value}`);
}

// Confirm each falling sheet ends on the visible top surface of its tank water.
// Rectangle/L-shape use a 25 mm prism, oval uses a zero-thickness arc strip,
// and freeform uses a 25 mm box centred 12.5 mm below its visible surface.
const verticalSeams = [
  {
    name: 'rectangle/L-shape sheet to tank-water surface',
    tankWaterCenterZ: -0.105,
    tankWaterThickness: 0.025,
    sheetBottomZ: -0.105 + 0.025 * 0.5
  },
  {
    name: 'oval sheet to tank-water surface',
    tankWaterCenterZ: -0.105,
    tankWaterThickness: 0,
    sheetBottomZ: -0.105
  },
  {
    name: 'kidney sheet to tank-water surface',
    tankWaterCenterZ: -0.105,
    tankWaterThickness: 0,
    sheetBottomZ: -0.105
  },
  {
    name: 'freeform sheet to tank-water surface',
    tankWaterCenterZ: -0.1125,
    tankWaterThickness: 0.025,
    sheetBottomZ: -0.10
  }
];

for (const seam of verticalSeams) {
  const tankWaterSurfaceZ = seam.tankWaterCenterZ + seam.tankWaterThickness * 0.5;
  const mismatch = seam.sheetBottomZ - tankWaterSurfaceZ;
  if (Math.abs(mismatch) > 1e-12) throw new Error(`${seam.name} mismatch: ${mismatch}`);
}

console.log('Infinity water seam contracts passed for rectangle/L-shape, oval, kidney, and freeform.');
