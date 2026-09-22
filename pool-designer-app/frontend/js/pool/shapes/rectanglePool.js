// js/pool/shapes/rectanglePool.js
import * as THREE from "https://esm.sh/three@0.158.0";
import { createStoneMaterial } from "../../materials/StoneMaterialFactory.js";
import { createPoolWater } from "../water.js?v=20260911-reference-water-v1";
import { trimFloorToWallInterior } from "../floorTrim.js";

const STEP_PRESET_WIDTH = 0.9; // metres: preset left/centre/right step width
const DEFAULT_BENCH2_EXTENSION = 0.6; // metres: second/full-width bench starts at 600 mm
const DEFAULT_DIAGONAL_STEP_SIZE = 0.45; // metres: diagonal corner step starts at 450 mm x 450 mm
const STEP_TIER_OFFSET = 0.3; // metres: consistent 300 mm offset between nested step tiers

function clampStepValue(value, min, max) {
  const n = Number(value);
  const lo = Number.isFinite(min) ? min : 0.05;
  const hi = Number.isFinite(max) && max > lo ? max : lo;
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function getBench2Extension(params) {
  const n = Number(params?.bench2Extension);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BENCH2_EXTENSION;
}

function getDiagonalStepSize(params, bench2Extension = getBench2Extension(params)) {
  const raw = Number(params?.diagonalStepSize ?? params?.stepWidth);
  const wanted = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DIAGONAL_STEP_SIZE;
  return clampStepValue(wanted, 0.05, bench2Extension);
}

function getStepsOnlyStepRunOverride(params, stepIndex) {
  const runs = params?.stepsOnlyStepRuns;
  if (!runs) return null;
  const raw = Array.isArray(runs) ? runs[stepIndex] : runs[String(stepIndex)];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getBenchStepRunOverride(params, stepIndex) {
  const runs = params?.benchStepRuns;
  if (!runs) return null;
  const raw = Array.isArray(runs) ? runs[stepIndex] : runs[String(stepIndex)];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getStepFootprintLength(params, stepCount, stepLength) {
  const count = Math.max(0, Number(stepCount) | 0);
  if (count <= 0) return 0;

  const bench2Extension = getBench2Extension(params);
  const stepBenchMode = params?.stepBenchMode === "stepsOnly" ? "stepsOnly" : "bench";
  const isCenteredCircular = params?.stepShape === "circular" && params?.stepPosition === "center";
  const centeredCircularRun = Math.max(0.05, Number(params?.stepExtension) || ((Number(params?.stepWidth) || STEP_PRESET_WIDTH) * 0.5));
  const isDiagonal = (params?.stepShape === "diagonal" || params?.stepShape === "circular") && params?.stepPosition !== "center";
  const narrowRun = isCenteredCircular ? centeredCircularRun : (isDiagonal ? getDiagonalStepSize(params, bench2Extension) : stepLength);

  // Floor origin rule:
  // - Steps Only: transition starts at the entry wall, regardless of nested step depth.
  // - Bench Seat: transition starts from the front edge of the second/full-width bench.
  //   Extra lower steps no longer keep pushing the transition deeper into the pool.
  if (stepBenchMode === "stepsOnly") return 0;
  if (count === 1) return narrowRun;
  return bench2Extension;
}

function invertStepSide(pos) {
  if (pos === "left") return "right";
  if (pos === "right") return "left";
  return "center";
}

function getStepPlacementPositionForWall(params, pos) {
  const wall = ["west", "east", "south", "north"].includes(params?.stepWall) ? params.stepWall : "west";
  // West remains the authored/native orientation. East and south are the two
  // wall frames whose along-wall placement needs to be mirrored so the visible
  // left/right preset remains consistent from the user's point of view.
  return (wall === "east" || wall === "south") ? invertStepSide(pos) : pos;
}

function getStepLocalPositionForWall(params, pos, placementPos = pos) {
  if (pos === "left" || pos === "right") return pos;
  if (placementPos === "left" || placementPos === "right") return placementPos;
  return "center";
}

function getStepLayout(params, spanMinY, spanMaxY, options = {}) {
  const fullWidth = Math.max(0.05, spanMaxY - spanMinY);
  const pos = params.stepPosition === "left" || params.stepPosition === "right" ? params.stepPosition : "center";
  const placementPos = getStepPlacementPositionForWall(params, pos);
  const localPos = getStepLocalPositionForWall(params, pos, placementPos);

  // Preset behaviour:
  // - second step uses full pool width
  // - all other steps use a locked 900 mm width and align left/centre/right
  const configuredWidth = Number(params.stepWidth);
  const isDiagonal = (params?.stepShape === "diagonal" || params?.stepShape === "circular") && pos !== "center" && !options.fullWidth;
  const bench2Extension = getBench2Extension(params);
  const targetWidth = options.fullWidth
    ? fullWidth
    : (isDiagonal
        ? getDiagonalStepSize(params, bench2Extension)
        : (Number.isFinite(configuredWidth) && configuredWidth > 0 ? configuredWidth : STEP_PRESET_WIDTH));
  const maxNarrowWidth = isDiagonal ? Math.min(fullWidth, bench2Extension) : fullWidth;
  const width = Math.min(maxNarrowWidth, Math.max(0.05, targetWidth));

  let centerY = (spanMinY + spanMaxY) * 0.5;
  if (placementPos === "left") centerY = spanMinY + width * 0.5;
  if (placementPos === "right") centerY = spanMaxY - width * 0.5;
  return {
    width,
    centerY,
    position: pos,
    placementPosition: placementPos,
    localPosition: localPos,
    isFullWidth: !!options.fullWidth
  };
}


function getStepWallFrame(params, minX, maxX, minY, maxY) {
  const wall = ["west", "east", "south", "north"].includes(params?.stepWall) ? params.stepWall : "west";
  if (wall === "east") {
    return {
      wall,
      axis: "x",
      inwardSign: -1,
      wallCoord: maxX,
      spanMin: minY,
      spanMax: maxY,
      rotationZ: Math.PI
    };
  }
  if (wall === "south") {
    return {
      wall,
      axis: "y",
      inwardSign: 1,
      wallCoord: minY,
      spanMin: minX,
      spanMax: maxX,
      rotationZ: Math.PI * 0.5
    };
  }
  if (wall === "north") {
    return {
      wall,
      axis: "y",
      inwardSign: -1,
      wallCoord: maxY,
      spanMin: minX,
      spanMax: maxX,
      rotationZ: -Math.PI * 0.5
    };
  }
  return {
    wall: "west",
    axis: "x",
    inwardSign: 1,
    wallCoord: minX,
    spanMin: minY,
    spanMax: maxY,
    rotationZ: 0
  };
}

function placeStepOnWall(step, frame, distanceFromWall, alongCenter, z) {
  const wallCoord = getBoundaryWallCoord(frame, alongCenter, frame.wallCoord);
  const runCenter = wallCoord + frame.inwardSign * distanceFromWall;
  if (frame.axis === "x") {
    step.position.set(runCenter, alongCenter, z);
  } else {
    step.position.set(alongCenter, runCenter, z);
  }
  step.rotation.z = frame.rotationZ;
}


function getClosedBoundaryPoints(points) {
  if (!Array.isArray(points) || points.length < 3) return null;
  const clean = points
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => new THREE.Vector2(p.x, p.y));
  if (clean.length < 3) return null;
  const first = clean[0];
  const last = clean[clean.length - 1];
  if (first.distanceToSquared(last) > 1e-10) clean.push(first.clone());
  return clean;
}

function getBoundaryIntersections(boundaryPoints, axis, coord) {
  const pts = getClosedBoundaryPoints(boundaryPoints);
  if (!pts) return [];
  const values = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    const aCoord = axis === "x" ? a.x : a.y;
    const bCoord = axis === "x" ? b.x : b.y;
    const aVal = axis === "x" ? a.y : a.x;
    const bVal = axis === "x" ? b.y : b.x;
    const da = aCoord - coord;
    const db = bCoord - coord;

    if (Math.abs(da) < 1e-8 && Math.abs(db) < 1e-8) {
      values.push(aVal, bVal);
      continue;
    }
    if ((da <= 0 && db > 0) || (db <= 0 && da > 0)) {
      const t = (coord - aCoord) / (bCoord - aCoord || 1);
      values.push(aVal + (bVal - aVal) * t);
    }
  }
  values.sort((a, b) => a - b);

  const unique = [];
  for (const v of values) {
    if (!unique.length || Math.abs(v - unique[unique.length - 1]) > 1e-6) unique.push(v);
  }
  return unique;
}

function getBoundaryIntervals(boundaryPoints, axis, coord) {
  const values = getBoundaryIntersections(boundaryPoints, axis, coord);
  const intervals = [];
  for (let i = 0; i + 1 < values.length; i += 2) {
    const min = values[i];
    const max = values[i + 1];
    if (Number.isFinite(min) && Number.isFinite(max) && max - min > 1e-5) intervals.push({ min, max });
  }
  return intervals;
}

function chooseBoundaryInterval(intervals, preferredCenter) {
  if (!Array.isArray(intervals) || !intervals.length) return null;
  let best = intervals[0];
  let bestScore = Infinity;
  for (const interval of intervals) {
    const contains = preferredCenter >= interval.min && preferredCenter <= interval.max;
    const center = (interval.min + interval.max) * 0.5;
    const gap = contains ? 0 : Math.min(Math.abs(preferredCenter - interval.min), Math.abs(preferredCenter - interval.max));
    const score = gap * 1000 + Math.abs(preferredCenter - center) - (interval.max - interval.min) * 0.001;
    if (score < bestScore) {
      bestScore = score;
      best = interval;
    }
  }
  return best;
}

function getBoundaryWallCoord(frame, alongCenter, fallbackCoord = frame?.wallCoord) {
  if (!frame?.boundaryPoints) return fallbackCoord;
  const axis = frame.axis === "x" ? "y" : "x";
  const values = getBoundaryIntersections(frame.boundaryPoints, axis, alongCenter);
  if (!values.length) return fallbackCoord;
  if (frame.wall === "west" || frame.wall === "south") return values[0];
  return values[values.length - 1];
}

function getStepLocalSpanSign(frame) {
  // In local step space +Y is the step span direction. After rotating a step
  // onto a wall, east and south walls flip that local Y direction relative to
  // the wall's natural span axis. Mirror boundary-clipped bench/rect steps in
  // local Y for those walls so curved wall-following benches mirror correctly.
  return frame?.wall === "east" || frame?.wall === "south" ? -1 : 1;
}

function applyStraightWallSpanFromBoundary(frame) {
  // Keep the selected wall span as the full side chosen by the user.
  // Earlier patches tried to trim rounded/curved sides back to the nearest
  // straight coordinate. That made the bench/steps stop short on radius and
  // kidney walls. Option 1 should instead let the wall-following geometry
  // trace the complete selected wall from one adjoining wall to the other.
  return frame;
}

function fitStepToPoolBoundary(frame, distanceFromWall, layout, runLength, wantedWidth) {
  if (!frame?.boundaryPoints || !layout) return null;
  const preferredCenter = Number(layout.centerY);
  const wanted = Math.max(0.05, Number(wantedWidth) || Number(layout.width) || 0.05);
  const run = Math.max(0.05, Number(runLength) || 0.05);
  if (!Number.isFinite(preferredCenter)) return null;

  const wallCoord = getBoundaryWallCoord(frame, preferredCenter, frame.wallCoord);
  if (!Number.isFinite(wallCoord)) return null;

  const sampleDistances = [
    Math.min(run, Math.max(0.02, run * 0.08)),
    Math.max(0.02, Math.min(run, Number(distanceFromWall) || run * 0.5)),
    Math.max(0.02, run * 0.98)
  ];

  let fitMin = -Infinity;
  let fitMax = Infinity;
  for (const d of sampleDistances) {
    const axisCoord = wallCoord + frame.inwardSign * d;
    const intervals = getBoundaryIntervals(frame.boundaryPoints, frame.axis, axisCoord);
    const chosen = chooseBoundaryInterval(intervals, preferredCenter);
    if (!chosen) continue;
    fitMin = Math.max(fitMin, chosen.min);
    fitMax = Math.min(fitMax, chosen.max);
  }

  if (!Number.isFinite(fitMin) || !Number.isFinite(fitMax) || fitMax - fitMin < 0.05) {
    const runCenter = wallCoord + frame.inwardSign * (Number(distanceFromWall) || run * 0.5);
    const intervals = getBoundaryIntervals(frame.boundaryPoints, frame.axis, runCenter);
    const chosen = chooseBoundaryInterval(intervals, preferredCenter);
    if (!chosen) return null;
    fitMin = chosen.min;
    fitMax = chosen.max;
  }

  const margin = 0.015;
  const available = Math.max(0.05, fitMax - fitMin - margin * 2);
  const width = Math.min(wanted, available);
  const centerMin = fitMin + margin + width * 0.5;
  const centerMax = fitMax - margin - width * 0.5;
  const centerY = centerMin <= centerMax
    ? THREE.MathUtils.clamp(preferredCenter, centerMin, centerMax)
    : (fitMin + fitMax) * 0.5;

  return { centerY, width };
}


function makeStepExtrudedGeometry(pointsOrShape, height) {
  const shapePath = pointsOrShape instanceof THREE.Shape
    ? pointsOrShape
    : new THREE.Shape(pointsOrShape);
  const geo = new THREE.ExtrudeGeometry(shapePath, {
    depth: height,
    bevelEnabled: false,
    steps: 1
  });
  geo.translate(0, 0, -height * 0.5);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  if (geo.attributes.uv && !geo.attributes.uv2) {
    geo.setAttribute("uv2", geo.attributes.uv.clone());
  }
  return geo;
}


function getWallCurveLocalPoint(frame, alongCenter, runCenter, along) {
  const wallCoord = getBoundaryWallCoord(frame, along, NaN);
  if (!Number.isFinite(wallCoord)) return null;
  const spanSign = getStepLocalSpanSign(frame);
  return new THREE.Vector2(
    (wallCoord - runCenter) * frame.inwardSign,
    (along - alongCenter) * spanSign
  );
}

function measureWallCurveArcLength(frame, alongCenter, runCenter, fromAlong, toAlong, segments = 32) {
  if (!frame?.boundaryPoints) return 0;
  if (!Number.isFinite(fromAlong) || !Number.isFinite(toAlong)) return 0;
  const steps = Math.max(4, Number(segments) | 0);
  let total = 0;
  let prev = null;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const along = fromAlong + (toAlong - fromAlong) * t;
    const p = getWallCurveLocalPoint(frame, alongCenter, runCenter, along);
    if (!p) continue;
    if (prev) total += p.distanceTo(prev);
    prev = p;
  }
  return total;
}

function findAlongAtWallArcDistance(frame, alongCenter, runCenter, direction, targetArc) {
  const dir = direction < 0 ? -1 : 1;
  const loLimit = Number.isFinite(frame?.spanMin) ? frame.spanMin : alongCenter - targetArc;
  const hiLimit = Number.isFinite(frame?.spanMax) ? frame.spanMax : alongCenter + targetArc;
  const maxAlongDelta = dir < 0 ? Math.max(0, alongCenter - loLimit) : Math.max(0, hiLimit - alongCenter);
  if (!Number.isFinite(targetArc) || targetArc <= 0 || maxAlongDelta <= 1e-6) return alongCenter;

  const limitAlong = alongCenter + dir * maxAlongDelta;
  const limitArc = measureWallCurveArcLength(frame, alongCenter, runCenter, alongCenter, limitAlong, 48);
  if (!Number.isFinite(limitArc) || limitArc <= 1e-6) return limitAlong;
  if (limitArc <= targetArc) return limitAlong;

  let lo = 0;
  let hi = maxAlongDelta;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) * 0.5;
    const testAlong = alongCenter + dir * mid;
    const arc = measureWallCurveArcLength(frame, alongCenter, runCenter, alongCenter, testAlong, 24);
    if (arc < targetArc) lo = mid;
    else hi = mid;
  }
  return alongCenter + dir * ((lo + hi) * 0.5);
}

function getWallArcSpanBounds(frame, alongCenter, runCenter, arcWidth) {
  const width = Math.max(0.05, Number(arcWidth) || 0.05);
  const halfArc = width * 0.5;
  const alongMin = findAlongAtWallArcDistance(frame, alongCenter, runCenter, -1, halfArc);
  const alongMax = findAlongAtWallArcDistance(frame, alongCenter, runCenter, 1, halfArc);
  if (!Number.isFinite(alongMin) || !Number.isFinite(alongMax) || alongMax - alongMin <= 1e-6) {
    return {
      alongMin: alongCenter - width * 0.5,
      alongMax: alongCenter + width * 0.5
    };
  }
  return { alongMin, alongMax };
}

function getWallArcSpanBoundsFromAnchor(frame, anchorAlong, runCenter, direction, arcWidth) {
  const width = Math.max(0.05, Number(arcWidth) || 0.05);
  const dir = direction < 0 ? -1 : 1;
  const start = Number(anchorAlong);
  if (!Number.isFinite(start)) return null;
  const end = findAlongAtWallArcDistance(frame, start, runCenter, dir, width);
  if (!Number.isFinite(end) || Math.abs(end - start) <= 1e-6) return null;
  return dir > 0
    ? { alongMin: Math.min(start, end), alongMax: Math.max(start, end), anchorAlong: start, anchorDirection: dir }
    : { alongMin: Math.min(end, start), alongMax: Math.max(end, start), anchorAlong: start, anchorDirection: dir };
}

function applyCurvedSideAnchorToLayout(layout, frame, distanceFromWall, width, sideOffset = STEP_TIER_OFFSET) {
  if (!layout || !frame || layout.placementPosition === "center") return layout;
  let spanMin = Number(frame.spanMin);
  let spanMax = Number(frame.spanMax);
  let targetWidth = Math.max(0.05, Number(width) || Number(layout.width) || 0.05);
  if (!Number.isFinite(spanMin) || !Number.isFinite(spanMax) || spanMax <= spanMin) return layout;

  // Use the v27 offset probe so the 300 mm set-in resolves against the
  // same bench end/span that was visually correct. Width stability is handled
  // below by storing the resolved min/max span and reusing it during geometry
  // generation instead of re-solving around a new centre.
  // Use the physical along-wall side, not the raw UI side. When the entry
  // is flipped to the east/deep end or south wall, left/right placement is
  // mirrored; anchoring from layout.position would offset from the wrong bench
  // end and make left/right appear swapped.
  const visibleSide = layout.placementPosition === "right" ? "right" : layout.placementPosition === "left" ? "left" :
    (layout.position === "right" ? "right" : layout.position === "left" ? "left" : "center");
  const useMinEnd = visibleSide !== "right";
  const dir = useMinEnd ? 1 : -1;

  // Keep the anchor probe independent from the live width. The old v27 offset
  // looked correct at the default 900 mm width, but changing the width moved
  // layout.centerY, which then moved the bench interval and the 300 mm anchor.
  // Probe from a fixed side/reference width so the 300 mm edge remains locked
  // while only the free side of the step grows or shrinks.
  const referenceWidth = Math.min(Math.max(0.05, STEP_PRESET_WIDTH), Math.max(0.05, spanMax - spanMin));
  const initialCenter = visibleSide === "left"
    ? spanMin + referenceWidth * 0.5
    : (visibleSide === "right"
        ? spanMax - referenceWidth * 0.5
        : (Number.isFinite(Number(layout.centerY)) ? Number(layout.centerY) : (spanMin + spanMax) * 0.5));
  const wallCoord = getBoundaryWallCoord(frame, initialCenter, frame.wallCoord);
  const runCenter = (Number.isFinite(wallCoord) ? wallCoord : frame.wallCoord) + frame.inwardSign * (Number(distanceFromWall) || 0.15);

  // The step must be contained by the bench seat, not by the outer pool wall
  // bbox. On radius/kidney ends the outer wall span can continue past the
  // bench-front edge, which made side steps miss/overhang the bench. Use a
  // side-based probe at the fixed edge instead of the width-based centre, so
  // the chosen bench interval does not change when the width slider changes.
  if (frame?.boundaryPoints && Number.isFinite(runCenter)) {
    const intervals = getBoundaryIntervals(frame.boundaryPoints, frame.axis, runCenter);
    const benchInterval = chooseBoundaryInterval(intervals, initialCenter);
    if (benchInterval && Number.isFinite(benchInterval.min) && Number.isFinite(benchInterval.max) && benchInterval.max - benchInterval.min > 0.1) {
      const margin = 0.015;
      spanMin = Math.max(spanMin, benchInterval.min + margin);
      spanMax = Math.min(spanMax, benchInterval.max - margin);
      if (spanMax <= spanMin) return layout;
    }
  }

  const endAlong = useMinEnd ? spanMin : spanMax;

  const totalArc = measureWallCurveArcLength(frame, initialCenter, runCenter, spanMin, spanMax, 96);
  const wantedOffset = Math.max(0, Number(sideOffset) || 0);
  const maxUsableArc = Number.isFinite(totalArc) && totalArc > 0.05 ? totalArc : (spanMax - spanMin);
  const offset = Math.min(wantedOffset, Math.max(0, maxUsableArc - 0.05));
  // Never let the side step extend outside the bench arc after the fixed gap.
  targetWidth = Math.min(targetWidth, Math.max(0.05, maxUsableArc - offset));

  const anchorAlong = offset > 1e-6
    ? findAlongAtWallArcDistance(frame, endAlong, runCenter, dir, offset)
    : endAlong;
  let bounds = getWallArcSpanBoundsFromAnchor(frame, anchorAlong, runCenter, dir, targetWidth);
  if (!bounds) {
    const fallbackCenter = useMinEnd
      ? spanMin + offset + targetWidth * 0.5
      : spanMax - offset - targetWidth * 0.5;
    return { ...layout, width: targetWidth, centerY: fallbackCenter, curvedSideAnchor: true, sideAnchorOffset: offset };
  }

  // Right-hand curved bench anchors were still landing on the bench end because
  // the curve interval used by the boundary fit includes the return/end wall.
  // Push the resolved right-side span one fixed offset back into the bench arc
  // so the visible right edge sits 300 mm left of the bench end rather than
  // overhanging or touching it. Left-side anchors already grow inward from the
  // correct end and are left unchanged.
  if (visibleSide === "right" && offset > 1e-6) {
    const shiftedMin = findAlongAtWallArcDistance(frame, bounds.alongMin, runCenter, -1, offset);
    const shiftedMax = findAlongAtWallArcDistance(frame, bounds.alongMax, runCenter, -1, offset);
    if (Number.isFinite(shiftedMin) && Number.isFinite(shiftedMax) && shiftedMax > shiftedMin) {
      bounds = {
        ...bounds,
        alongMin: Math.max(spanMin, shiftedMin),
        alongMax: Math.min(spanMax, shiftedMax),
        anchorAlong: Math.min(spanMax, shiftedMax)
      };
    }
  }

  return {
    ...layout,
    width: targetWidth,
    centerY: (bounds.alongMin + bounds.alongMax) * 0.5,
    curvedSideAnchor: true,
    sideAnchorOffset: offset,
    curvedAnchorAlong: bounds.anchorAlong,
    curvedAnchorDirection: bounds.anchorDirection,
    curvedAlongMin: bounds.alongMin,
    curvedAlongMax: bounds.alongMax,
    curvedAnchorUsesMinEnd: useMinEnd
  };
}

function resampleWallCurveForStep(frame, alongCenter, width, runCenter, sampleCount, layout = null) {
  if (!frame?.boundaryPoints) return null;
  const center = Number(alongCenter);
  const span = Math.max(0.05, Number(width) || 0.05);
  const samples = Math.max(12, Math.min(160, Number(sampleCount) | 0 || Math.ceil(span / 0.08)));
  if (!Number.isFinite(center)) return null;

  // The step width slider is a real wall-arc length for curved walls. A side
  // step may also have one fixed edge: in that case, hold the anchor edge and
  // grow only in the opposite direction instead of re-centring around the step.
  let bounds = null;
  if (layout?.curvedSideAnchor) {
    const storedMin = Number(layout.curvedAlongMin);
    const storedMax = Number(layout.curvedAlongMax);
    // Use the already-resolved bench-relative span for anchored side steps.
    // Recomputing from the anchor here can use a different runCenter for lower
    // treads/circular steps, which can move the step past the bench end.
    if (Number.isFinite(storedMin) && Number.isFinite(storedMax) && storedMax > storedMin) {
      bounds = { alongMin: storedMin, alongMax: storedMax };
    } else if (Number.isFinite(Number(layout.curvedAnchorAlong))) {
      bounds = getWallArcSpanBoundsFromAnchor(
        frame,
        Number(layout.curvedAnchorAlong),
        runCenter,
        Number(layout.curvedAnchorDirection) || 1,
        span
      );
    }
  }
  if (!bounds) bounds = getWallArcSpanBounds(frame, center, runCenter, span);
  let { alongMin, alongMax } = bounds;
  if (layout?.curvedSideAnchor) {
    const lo = Number.isFinite(Number(frame?.spanMin)) ? Number(frame.spanMin) : alongMin;
    const hi = Number.isFinite(Number(frame?.spanMax)) ? Number(frame.spanMax) : alongMax;
    alongMin = THREE.MathUtils.clamp(alongMin, lo, hi);
    alongMax = THREE.MathUtils.clamp(alongMax, lo, hi);
    if (alongMax - alongMin <= 1e-6) return null;
  }
  const denseCount = Math.max(samples * 8, 192);
  const dense = [];

  for (let i = 0; i <= denseCount; i += 1) {
    const t = i / denseCount;
    const along = alongMin + (alongMax - alongMin) * t;
    const p = getWallCurveLocalPoint(frame, center, runCenter, along);
    if (!p) continue;
    if (!dense.length || dense[dense.length - 1].distanceToSquared(p) > 1e-10) dense.push(p);
  }

  if (dense.length < 2) return null;

  const cumulative = [0];
  for (let i = 1; i < dense.length; i += 1) {
    cumulative.push(cumulative[i - 1] + dense[i].distanceTo(dense[i - 1]));
  }
  const total = cumulative[cumulative.length - 1];
  if (!Number.isFinite(total) || total <= 1e-5) return null;

  const result = [];
  let seg = 1;
  for (let i = 0; i <= samples; i += 1) {
    const target = total * (i / samples);
    while (seg < cumulative.length - 1 && cumulative[seg] < target) seg += 1;
    const prevLen = cumulative[seg - 1];
    const nextLen = cumulative[seg];
    const denom = nextLen - prevLen || 1;
    const t = THREE.MathUtils.clamp((target - prevLen) / denom, 0, 1);
    const p = dense[seg - 1].clone().lerp(dense[seg], t);
    result.push(p);
  }

  return result;
}

function boundaryLocalPointInside(frame, runCenter, localX, localY, alongCenter) {
  if (!frame?.boundaryPoints) return false;
  const spanSign = getStepLocalSpanSign(frame);
  const along = alongCenter + localY * spanSign;
  const axisCoord = runCenter + frame.inwardSign * localX;
  const intervals = getBoundaryIntervals(frame.boundaryPoints, frame.axis, axisCoord);
  const chosen = chooseBoundaryInterval(intervals, along);
  return !!chosen && along >= chosen.min - 1e-5 && along <= chosen.max + 1e-5;
}

function hasNonStraightWallSpan(layout, widthForTest) {
  const clip = layout?.boundaryClip;
  const frame = clip?.frame;
  if (!frame?.boundaryPoints) return false;

  const center = Number(clip.alongCenter);
  const span = Math.max(0.05, Number(widthForTest) || Number(layout?.width) || 0.05);
  if (!Number.isFinite(center) || span <= 0) return false;

  // Detect curvature from the actual selected wall face, not from adjoining
  // rounded corners at the ends of a full-width bench. A straight wall with a
  // rounded pool corner should still generate a straight bench front edge.
  const trim = Math.min(span * 0.2, 0.75);
  const alongMin = center - span * 0.5 + trim;
  const alongMax = center + span * 0.5 - trim;
  const testMin = alongMax > alongMin ? alongMin : center - span * 0.25;
  const testMax = alongMax > alongMin ? alongMax : center + span * 0.25;

  let minCoord = Infinity;
  let maxCoord = -Infinity;
  let samples = 0;
  const checks = 8;
  for (let i = 0; i <= checks; i += 1) {
    const t = i / checks;
    const along = testMin + (testMax - testMin) * t;
    const wallCoord = getBoundaryWallCoord(frame, along, NaN);
    if (!Number.isFinite(wallCoord)) continue;
    if (wallCoord < minCoord) minCoord = wallCoord;
    if (wallCoord > maxCoord) maxCoord = wallCoord;
    samples += 1;
  }

  return samples >= 2 && (maxCoord - minCoord) > 0.015;
}

function hasCurvedMainWallFace(layout, widthForTest) {
  const clip = layout?.boundaryClip;
  const frame = clip?.frame;
  if (!frame?.boundaryPoints) return false;

  const center = Number(clip.alongCenter);
  const span = Math.max(0.05, Number(widthForTest) || Number(layout?.width) || 0.05);
  if (!Number.isFinite(center) || span <= 0) return false;

  // Bench seats need a stricter test than small treads. A straight wall with
  // rounded/curved pool corners at either end must still generate a square-ended
  // rectangular bench. Test only the middle of the selected wall face; if the
  // middle is straight, do not let curved adjoining ends round the bench.
  const faceHalf = Math.max(0.05, span * 0.22);
  const testMin = center - faceHalf;
  const testMax = center + faceHalf;

  let minCoord = Infinity;
  let maxCoord = -Infinity;
  let samples = 0;
  const checks = 8;
  for (let i = 0; i <= checks; i += 1) {
    const t = i / checks;
    const along = testMin + (testMax - testMin) * t;
    const wallCoord = getBoundaryWallCoord(frame, along, NaN);
    if (!Number.isFinite(wallCoord)) continue;
    if (wallCoord < minCoord) minCoord = wallCoord;
    if (wallCoord > maxCoord) maxCoord = wallCoord;
    samples += 1;
  }

  return samples >= 2 && (maxCoord - minCoord) > 0.025;
}

function hasCurvedLocalStepWallSegment(layout, stepLayout, widthForTest) {
  const clip = layout?.boundaryClip;
  const frame = clip?.frame;
  if (!frame?.boundaryPoints || !stepLayout) return false;

  const center = Number(stepLayout.centerY);
  const span = Math.max(0.25, Number(widthForTest) || Number(stepLayout.width) || STEP_PRESET_WIDTH);
  if (!Number.isFinite(center) || span <= 0) return false;

  // This is the offset trigger for the smaller side step only. Do not look at
  // the whole bench: a bench can be curved on one side and square on the other.
  // Sample the pool wall directly behind the selected small step. If that local
  // wall segment is straight, the step sits flush to the bench end. If that
  // local wall segment is curved, reserve the 300 mm set-in from the bench end.
  const half = Math.max(0.08, span * 0.5);
  const loLimit = Number.isFinite(Number(frame.spanMin)) ? Number(frame.spanMin) : center - half;
  const hiLimit = Number.isFinite(Number(frame.spanMax)) ? Number(frame.spanMax) : center + half;
  const testMin = Math.max(loLimit, center - half);
  const testMax = Math.min(hiLimit, center + half);
  if (!Number.isFinite(testMin) || !Number.isFinite(testMax) || testMax <= testMin) return false;

  let minCoord = Infinity;
  let maxCoord = -Infinity;
  let samples = 0;
  const checks = 8;
  for (let i = 0; i <= checks; i += 1) {
    const t = i / checks;
    const along = testMin + (testMax - testMin) * t;
    const wallCoord = getBoundaryWallCoord(frame, along, NaN);
    if (!Number.isFinite(wallCoord)) continue;
    if (wallCoord < minCoord) minCoord = wallCoord;
    if (wallCoord > maxCoord) maxCoord = wallCoord;
    samples += 1;
  }

  return samples >= 3 && (maxCoord - minCoord) > 0.025;
}


function getPhysicalStepSide(layout) {
  if (layout?.placementPosition === "left" || layout?.placementPosition === "right") return layout.placementPosition;
  if (layout?.position === "left" || layout?.position === "right") return layout.position;
  return "center";
}

function hasCurvedLocalBenchEnd(layout, side, widthForTest) {
  const clip = layout?.boundaryClip;
  const frame = clip?.frame;
  if (!frame?.boundaryPoints) return false;
  const physicalSide = side === "right" ? "right" : side === "left" ? "left" : "center";
  if (physicalSide === "center") return false;

  const spanMin = Number.isFinite(Number(frame.spanMin)) ? Number(frame.spanMin) : NaN;
  const spanMax = Number.isFinite(Number(frame.spanMax)) ? Number(frame.spanMax) : NaN;
  if (!Number.isFinite(spanMin) || !Number.isFinite(spanMax) || spanMax <= spanMin) return false;

  const fullSpan = spanMax - spanMin;
  const requested = Math.max(0.25, Number(widthForTest) || Number(layout?.width) || STEP_PRESET_WIDTH);
  const testSpan = Math.min(Math.max(requested, 0.9), Math.max(0.2, fullSpan * 0.38));
  const endInset = Math.min(0.08, fullSpan * 0.04);
  let testMin;
  let testMax;
  if (physicalSide === "left") {
    testMin = spanMin + endInset;
    testMax = Math.min(spanMax - endInset, spanMin + testSpan);
  } else {
    testMin = Math.max(spanMin + endInset, spanMax - testSpan);
    testMax = spanMax - endInset;
  }
  if (!Number.isFinite(testMin) || !Number.isFinite(testMax) || testMax <= testMin) return false;

  let minCoord = Infinity;
  let maxCoord = -Infinity;
  let samples = 0;
  const checks = 10;
  for (let i = 0; i <= checks; i += 1) {
    const t = i / checks;
    const along = testMin + (testMax - testMin) * t;
    const wallCoord = getBoundaryWallCoord(frame, along, NaN);
    if (!Number.isFinite(wallCoord)) continue;
    if (wallCoord < minCoord) minCoord = wallCoord;
    if (wallCoord > maxCoord) maxCoord = wallCoord;
    samples += 1;
  }
  return samples >= 3 && (maxCoord - minCoord) > 0.025;
}

function getCurvedBenchEndRadiusMode(layout, widthForTest) {
  const leftCurved = hasCurvedLocalBenchEnd(layout, "left", widthForTest);
  const rightCurved = hasCurvedLocalBenchEnd(layout, "right", widthForTest);
  if (leftCurved && rightCurved) return "center";
  // createBoundaryClippedRectStepGeometry names the high/low end modes from
  // local geometry direction: "right" rounds the low/left along end, while
  // "left" rounds the high/right along end.
  if (leftCurved) return "right";
  if (rightCurved) return "left";
  return null;
}

function createBoundaryClippedRectStepGeometry(runLength, stepWidth, height, layout) {
  const clip = layout?.boundaryClip;
  const frame = clip?.frame;
  if (!frame?.boundaryPoints) return null;

  const run = Math.max(0.05, Number(runLength) || 0.05);
  const width = Math.max(0.05, Number(stepWidth) || 0.05);
  const distanceFromWall = Math.max(0.025, Number(clip.distanceFromWall) || run * 0.5);
  const alongCenter = Number(clip.alongCenter);
  if (!Number.isFinite(alongCenter)) return null;

  const centerWallCoord = getBoundaryWallCoord(frame, alongCenter, frame.wallCoord);
  if (!Number.isFinite(centerWallCoord)) return null;
  const runCenter = centerWallCoord + frame.inwardSign * distanceFromWall;

  // The previous version sampled curved walls by the global X/Y span. That made
  // curved benches look lumpy because equal Y/X intervals are not equal lengths
  // along an arc. This version first traces the actual selected wall, then
  // resamples that trace by cumulative arc length so the visible segments are
  // distributed evenly around curved or angled walls.
  const sampleCount = Math.max(16, Math.min(128, Math.ceil(width / 0.08)));
  const wallSamples = resampleWallCurveForStep(frame, alongCenter, width, runCenter, sampleCount, layout);
  if (!wallSamples || wallSamples.length < 2) return null;

  const backPts = [];
  const frontPts = [];
  const insideMargin = 0.012;
  const localInward = new THREE.Vector2(1, 0);

  for (let i = 0; i < wallSamples.length; i += 1) {
    const wallPt = wallSamples[i];
    const prev = wallSamples[Math.max(0, i - 1)];
    const next = wallSamples[Math.min(wallSamples.length - 1, i + 1)];
    const tangent = next.clone().sub(prev);
    if (tangent.lengthSq() < 1e-10) tangent.set(0, 1);
    tangent.normalize();

    // Offset the stair front edge along the wall normal, not the global X/Y
    // axis. A global-axis offset makes curved benches appear to bow the wrong
    // way on some kidney/oval positions. In this local step frame +X is the
    // intended inward direction, so choose the normal that faces +X.
    const n1 = new THREE.Vector2(-tangent.y, tangent.x);
    const n2 = new THREE.Vector2(tangent.y, -tangent.x);
    const normal = n1.dot(localInward) >= n2.dot(localInward) ? n1 : n2;
    if (normal.dot(localInward) < 0) normal.multiplyScalar(-1);
    normal.normalize();

    // The mesh origin is placed at distanceFromWall, so the local tread should
    // run from -run/2 to +run/2. The earlier curved-step attempt always built
    // from the wall to wall+run; that made every lower tread start at the wall
    // instead of from the previous tread/bench front. Build the back/front
    // offsets from the real wall distance so nested curved treads are concentric
    // and chained correctly.
    const backOffset = Math.max(insideMargin, distanceFromWall - run * 0.5 + insideMargin);
    const frontOffset = Math.max(backOffset + 0.005, distanceFromWall + run * 0.5 + insideMargin);

    const back = wallPt.clone().addScaledVector(normal, backOffset);
    let front = wallPt.clone().addScaledVector(normal, frontOffset);

    // Check the front point remains inside the same pool interior slice. If the
    // pool narrows sharply near the adjoining shallow/deep walls, pull the
    // front edge back with a binary search along the same wall normal instead
    // of dropping that sample. This preserves the selected wall length while
    // keeping the face inside the shell.
    if (!boundaryLocalPointInside(frame, runCenter, front.x, front.y, alongCenter)) {
      let lo = backOffset;
      let hi = frontOffset;
      let found = boundaryLocalPointInside(
        frame,
        runCenter,
        wallPt.x + normal.x * (backOffset + 0.005),
        wallPt.y + normal.y * (backOffset + 0.005),
        alongCenter
      ) ? backOffset + 0.005 : null;
      for (let k = 0; k < 14; k += 1) {
        const mid = (lo + hi) * 0.5;
        const test = wallPt.clone().addScaledVector(normal, mid);
        if (boundaryLocalPointInside(frame, runCenter, test.x, test.y, alongCenter)) {
          found = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      if (found === null) continue;
      front = wallPt.clone().addScaledVector(normal, found);
    }

    if (front.distanceTo(back) < 0.005) continue;
    backPts.push(back);
    frontPts.push(front);
  }

  if (backPts.length < 2 || frontPts.length < 2) return null;

  const radiusMode = layout?.radiusCornerMode;
  let points = null;

  if ((radiusMode === "left" || radiusMode === "right" || radiusMode === "center") && frontPts.length >= 3) {
    const roundHigh = radiusMode === "left" || radiusMode === "center";
    const roundLow = radiusMode === "right" || radiusMode === "center";
    const targetRadius = Math.max(0.03, Number(layout?.radiusCornerValue) || 0.45);
    const frontArcLength = (startIdx, dir) => {
      let total = 0;
      for (let j = startIdx; j + dir >= 0 && j + dir < frontPts.length; j += dir) {
        total += frontPts[j].distanceTo(frontPts[j + dir]);
      }
      return total;
    };
    const pointAlongFrontFromHigh = (dist) => {
      let remaining = Math.max(0, dist);
      for (let j = frontPts.length - 1; j > 0; j -= 1) {
        const a = frontPts[j];
        const b = frontPts[j - 1];
        const seg = a.distanceTo(b);
        if (remaining <= seg || j === 1) {
          const t = seg > 1e-9 ? remaining / seg : 0;
          return { point: a.clone().lerp(b, THREE.MathUtils.clamp(t, 0, 1)), resumeIndex: j - 1 };
        }
        remaining -= seg;
      }
      return { point: frontPts[0].clone(), resumeIndex: -1 };
    };
    const pointAlongFrontFromLow = (dist) => {
      let remaining = Math.max(0, dist);
      for (let j = 0; j < frontPts.length - 1; j += 1) {
        const a = frontPts[j];
        const b = frontPts[j + 1];
        const seg = a.distanceTo(b);
        if (remaining <= seg || j === frontPts.length - 2) {
          const t = seg > 1e-9 ? remaining / seg : 0;
          return { point: a.clone().lerp(b, THREE.MathUtils.clamp(t, 0, 1)), stopIndex: j + 1 };
        }
        remaining -= seg;
      }
      return { point: frontPts[frontPts.length - 1].clone(), stopIndex: frontPts.length };
    };
    const sidePoint = (corner, back) => {
      const side = back.clone().sub(corner);
      const len = side.length();
      if (len < 1e-9) return corner.clone();
      const r = Math.min(targetRadius, len * 0.98);
      return corner.clone().addScaledVector(side.normalize(), r);
    };
    const addBezier = (arr, start, control, end, steps = 16) => {
      arr.push(start.clone());
      for (let k = 1; k <= steps; k += 1) {
        const t = k / steps;
        const a = start.clone().multiplyScalar((1 - t) * (1 - t));
        const b = control.clone().multiplyScalar(2 * (1 - t) * t);
        const c = end.clone().multiplyScalar(t * t);
        arr.push(a.add(b).add(c));
      }
    };

    const highIdx = frontPts.length - 1;
    const lowIdx = 0;
    const highFrontAvailable = frontArcLength(highIdx, -1);
    const lowFrontAvailable = frontArcLength(lowIdx, 1);
    const highTrim = Math.min(targetRadius, highFrontAvailable * 0.45);
    const lowTrim = Math.min(targetRadius, lowFrontAvailable * 0.45);
    const high = roundHigh ? pointAlongFrontFromHigh(highTrim) : null;
    const low = roundLow ? pointAlongFrontFromLow(lowTrim) : null;

    const rounded = [...backPts];

    if (roundHigh) {
      const corner = frontPts[highIdx];
      addBezier(rounded, sidePoint(corner, backPts[highIdx]), corner, high.point);
      const end = roundLow ? low.stopIndex : 0;
      for (let j = high.resumeIndex; j >= end; j -= 1) rounded.push(frontPts[j]);
      if (roundLow) {
        rounded.push(low.point.clone());
        const lowCorner = frontPts[lowIdx];
        addBezier(rounded, low.point, lowCorner, sidePoint(lowCorner, backPts[lowIdx]));
      }
    } else {
      const end = roundLow ? low.stopIndex : 0;
      for (let j = highIdx; j >= end; j -= 1) rounded.push(frontPts[j]);
      if (roundLow) {
        rounded.push(low.point.clone());
        const lowCorner = frontPts[lowIdx];
        addBezier(rounded, low.point, lowCorner, sidePoint(lowCorner, backPts[lowIdx]));
      } else {
        rounded.push(frontPts[lowIdx]);
      }
    }

    points = rounded;
  } else {
    points = [...backPts, ...frontPts.reverse()];
  }

  if (points.length < 3) return null;
  return makeStepExtrudedGeometry(new THREE.Shape(points), height);
}

function getStepFootprintFloorDepth(frame, distanceFromWall, alongCenter, runLength, spanWidth, floorDepthAt) {
  if (!frame || typeof floorDepthAt !== "function") return null;
  const runHalf = Math.max(0.025, (Number(runLength) || 0.05) * 0.5);
  const spanHalf = Math.max(0.025, (Number(spanWidth) || 0.05) * 0.5);
  const wallCoord = getBoundaryWallCoord(frame, alongCenter, frame.wallCoord);
  const runCenter = (Number.isFinite(wallCoord) ? wallCoord : frame.wallCoord) + frame.inwardSign * distanceFromWall;
  const samples = [];

  if (frame.axis === "x") {
    const xs = [runCenter - runHalf, runCenter, runCenter + runHalf];
    const ys = [alongCenter - spanHalf, alongCenter, alongCenter + spanHalf];
    for (const x of xs) for (const y of ys) samples.push([x, y]);
  } else {
    const xs = [alongCenter - spanHalf, alongCenter, alongCenter + spanHalf];
    const ys = [runCenter - runHalf, runCenter, runCenter + runHalf];
    for (const x of xs) for (const y of ys) samples.push([x, y]);
  }

  let deepest = null;
  for (const [x, y] of samples) {
    const depth = Number(floorDepthAt(x, y));
    if (Number.isFinite(depth)) deepest = deepest === null ? depth : Math.max(deepest, depth);
  }
  return deepest;
}

function createStepGeometry(runLength, stepWidth, height, params, layout) {
  const requestedShape = (["diagonal", "circular", "radius"].includes(params?.stepShape)) ? params.stepShape : "rectangle";
  const pos = layout?.localPosition === "right" ? "right" : layout?.localPosition === "left" ? "left" :
    (layout?.position === "right" ? "right" : layout?.position === "left" ? "left" : "center");

  // The full-width bench/ledge must not inherit the selected step shape.
  // If Radius Corner is selected for the smaller treads, the bench itself
  // should still be a rectangular/straight-ended ledge unless it is genuinely
  // following a curved wall face. This prevents an unwanted radius at the bench
  // end where it meets a straight wall.
  const isFullWidthStep = layout?.isFullWidth === true;
  const forceBenchSeat = layout?.isBenchSeat === true;
  const shape = (forceBenchSeat || isFullWidthStep) ? "rectangle" : requestedShape;
  const isCenteredCircularStep = shape === "circular" && pos === "center";

  // Boundary clipping is used for wall-following rectangular/bench geometry.
  // Radius treads on curved spans also use this perpendicular wall-following
  // band, with both exposed ends rounded at 300 mm. Circular steps deliberately
  // stay as true circular geometry; they must not be stretched into a curved
  // rectangular band.
  const wallSpanIsNonStraight = hasNonStraightWallSpan(layout, stepWidth);
  const curvedBenchRadiusMode = (forceBenchSeat || isFullWidthStep) ? getCurvedBenchEndRadiusMode(layout, stepWidth) : null;
  const benchWallIsCurved = (forceBenchSeat || isFullWidthStep)
    && (hasCurvedMainWallFace(layout, stepWidth) || !!curvedBenchRadiusMode);
  const curveStepToWall = shape === "radius"
    ? wallSpanIsNonStraight
    : (shape === "rectangle" && ((forceBenchSeat || isFullWidthStep) ? benchWallIsCurved : wallSpanIsNonStraight));
  const canUseBoundaryClip = curveStepToWall;
  if (canUseBoundaryClip) {
    const boundaryLayout = shape === "radius" && curveStepToWall
      ? { ...layout, radiusCornerMode: "center", radiusCornerValue: 0.3 }
      : ((forceBenchSeat || isFullWidthStep) && curvedBenchRadiusMode
          ? { ...layout, radiusCornerMode: curvedBenchRadiusMode, radiusCornerValue: 0.3 }
          : layout);
    const clippedRectGeo = createBoundaryClippedRectStepGeometry(runLength, stepWidth, height, boundaryLayout);
    if (clippedRectGeo) return clippedRectGeo;
  }

  if (shape === "rectangle" || forceBenchSeat || (isFullWidthStep && !isCenteredCircularStep)) {
    return new THREE.BoxGeometry(runLength, stepWidth, height);
  }

  const makeExtrudedShapeGeometry = (pointsOrShape) => {
    const shapePath = pointsOrShape instanceof THREE.Shape
      ? pointsOrShape
      : new THREE.Shape(pointsOrShape);
    const geo = new THREE.ExtrudeGeometry(shapePath, {
      depth: height,
      bevelEnabled: false,
      steps: 1
    });
    // ExtrudeGeometry runs from z=0..height. Centre it so existing step
    // positioning still treats the mesh origin as the middle of the solid block.
    geo.translate(0, 0, -height * 0.5);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    if (geo.attributes.uv && !geo.attributes.uv2) {
      geo.setAttribute("uv2", geo.attributes.uv.clone());
    }
    return geo;
  };

  // Radius Corner: same sizing behaviour as Rectangle steps, but the exposed
  // pool-side front corner is rounded instead of square. For centred steps both
  // front corners are rounded. The full-width bench stays rectangular above.
  if (shape === "radius") {
    const run = Math.max(0.05, Number(runLength) || 0.05);
    const width = Math.max(0.05, Number(stepWidth) || 0.05);
    const maxRadius = pos === "center" ? Math.min(run, width * 0.5) : Math.min(run, width);
    const radius = THREE.MathUtils.clamp(0.3, 0.03, maxRadius);
    const x0 = -run * 0.5;
    const x1 = run * 0.5;
    const y0 = -width * 0.5;
    const y1 = width * 0.5;
    const segments = 18;
    const points = [];
    const arc = (cx, cy, r, a0, a1) => {
      for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        const a = a0 + (a1 - a0) * t;
        points.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
      }
    };

    if (pos === "left") {
      // Rounded exposed/front inside corner at x1,y1.
      points.push(new THREE.Vector2(x0, y0));
      points.push(new THREE.Vector2(x0, y1));
      points.push(new THREE.Vector2(x1 - radius, y1));
      arc(x1 - radius, y1 - radius, radius, Math.PI * 0.5, 0);
      points.push(new THREE.Vector2(x1, y0));
    } else if (pos === "right") {
      // Rounded exposed/front inside corner at x1,y0.
      points.push(new THREE.Vector2(x0, y0));
      points.push(new THREE.Vector2(x0, y1));
      points.push(new THREE.Vector2(x1, y1));
      points.push(new THREE.Vector2(x1, y0 + radius));
      arc(x1 - radius, y0 + radius, radius, 0, -Math.PI * 0.5);
    } else {
      // Centre steps: rectangle with both front corners rounded.
      points.push(new THREE.Vector2(x0, y0));
      points.push(new THREE.Vector2(x0, y1));
      points.push(new THREE.Vector2(x1 - radius, y1));
      arc(x1 - radius, y1 - radius, radius, Math.PI * 0.5, 0);
      points.push(new THREE.Vector2(x1, y0 + radius));
      arc(x1 - radius, y0 + radius, radius, 0, -Math.PI * 0.5);
    }
    return makeExtrudedShapeGeometry(new THREE.Shape(points));
  }

  // Diagonal and Circular Corner use one single real-world size. This keeps
  // the UI value honest: 0.60 m on the slider creates a 600 mm x 600 mm
  // corner footprint, regardless of any old extension/width state.
  if (pos === "center") {
    if (shape === "circular") {
      // Centre circular steps are true semi-circles: the straight edge sits
      // on the entry wall and the curved edge projects into the pool.
      // runLength is the radius/projection; stepWidth is the diameter.
      const radius = Math.max(0.05, Number(runLength) || 0.05);
      const diameter = Math.max(radius * 2, Number(stepWidth) || radius * 2);
      const x0 = -radius * 0.5;
      const cy = 0;
      const y0 = -diameter * 0.5;
      const y1 = diameter * 0.5;
      const segments = 40;
      const points = [
        new THREE.Vector2(x0, y0),
        new THREE.Vector2(x0, y1)
      ];
      for (let i = 0; i <= segments; i += 1) {
        const a = Math.PI * 0.5 - (i / segments) * Math.PI;
        points.push(new THREE.Vector2(
          x0 + Math.cos(a) * radius,
          cy + Math.sin(a) * (diameter * 0.5)
        ));
      }
      return makeExtrudedShapeGeometry(new THREE.Shape(points));
    }
    return new THREE.BoxGeometry(runLength, stepWidth, height);
  }

  const size = Math.max(
    0.05,
    Math.min(Number(runLength) || 0, Number(stepWidth) || 0) || DEFAULT_DIAGONAL_STEP_SIZE
  );
  const x0 = -size * 0.5;
  const x1 = size * 0.5;
  const y0 = -size * 0.5;
  const y1 = size * 0.5;

  if (shape === "circular") {
    // Rounded/circular corner step: same controlling value as diagonal steps,
    // but the corner footprint is a quarter-circle instead of a triangle.
    const segments = 24;
    const points = [];
    if (pos === "right") {
      // Corner is the wall/right side intersection at (x0, y1).
      points.push(new THREE.Vector2(x0, y1));
      for (let i = 0; i <= segments; i += 1) {
        const a = (i / segments) * Math.PI * 0.5;
        points.push(new THREE.Vector2(x0 + Math.sin(a) * size, y1 - Math.cos(a) * size));
      }
    } else {
      // Corner is the wall/left side intersection at (x0, y0).
      points.push(new THREE.Vector2(x0, y0));
      for (let i = 0; i <= segments; i += 1) {
        const a = (i / segments) * Math.PI * 0.5;
        points.push(new THREE.Vector2(x0 + Math.cos(a) * size, y0 + Math.sin(a) * size));
      }
    }
    return makeExtrudedShapeGeometry(new THREE.Shape(points));
  }

  // Build a real triangular prism in local XY and extrude it through Z.
  // This avoids hand-indexed faces, which could render as dark/grey wall holes
  // because some faces had poor winding/UVs.
  const points = pos === "right"
    ? [new THREE.Vector2(x0, y1), new THREE.Vector2(x1, y1), new THREE.Vector2(x0, y0)]
    : [new THREE.Vector2(x0, y0), new THREE.Vector2(x0, y1), new THREE.Vector2(x1, y0)];

  return makeExtrudedShapeGeometry(points);
}


function addStepBenchMeshes(group, params, layout, spanMinY, spanMaxY, startX, stepLength, topOffset, stepDepth) {
  // Disabled: the old side-bench add-on looked too busy with the new presets.
  // The second step now provides the full-width bench/ledge band.
  return;

  if (!params?.stepBenchEnabled || !group || !layout) return;

  const fullWidth = Math.max(0.05, spanMaxY - spanMinY);
  const stepMinY = layout.centerY - layout.width * 0.5;
  const stepMaxY = layout.centerY + layout.width * 0.5;
  const gap = 0.01;

  const ranges = [];
  const leftWidth = stepMinY - spanMinY;
  const rightWidth = spanMaxY - stepMaxY;

  if (leftWidth > 0.15) ranges.push([spanMinY, stepMinY - gap * 0.5]);
  if (rightWidth > 0.15) ranges.push([stepMaxY + gap * 0.5, spanMaxY]);

  // When the steps already occupy the full wall width there is no safe side bench
  // to add in this first-stage geometry. Leave it hidden instead of overlapping steps.
  if (!ranges.length || layout.width >= fullWidth - 0.02) return;

  const benchRun = Math.max(0.25, Math.min(0.6, stepLength * 1.5));
  const benchHeight = Math.max(0.05, Math.min(0.35, Number(stepDepth) || 0.2));
  const benchX = startX + benchRun * 0.5;
  const benchZ = -(topOffset + benchHeight * 0.5);

  ranges.forEach(([minY, maxY], idx) => {
    const benchWidth = Math.max(0.05, maxY - minY);
    const geo = new THREE.BoxGeometry(benchRun, benchWidth, benchHeight);
    const mat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
    const bench = new THREE.Mesh(geo, mat);

    bench.position.set(benchX, (minY + maxY) * 0.5, benchZ);
    bench.userData.isStep = true;
    bench.userData.isStepAddon = true;
    bench.userData.isStepBench = true;
    bench.userData.type = "step";
    bench.userData.stepIndex = -100 - idx;
    bench.userData.stepPosition = layout.position;
    bench.userData.stepWidth = benchWidth;
    bench.userData.baseHeight = benchHeight;
    bench.castShadow = true;
    bench.receiveShadow = true;

    group.add(bench);
  });
}


export function createRectanglePool(params, tileSize = 0.3) {
  const {
    length,
    width,
    shallow,
    deep,
    shallowFlat,
    deepFlat,
    stepCount,
    stepDepth,
    stepWidth,
    stepPosition,
    stepShape
  } = params;

  const group = new THREE.Group();

  const clampedShallow = Math.max(0.5, shallow);
  const clampedDeep = Math.max(clampedShallow, deep);

  group.userData.poolParams = {
    length,
    width,
    shallow,
    deep,
    shallowFlat,
    deepFlat,
    stepCount,
    stepDepth,
    stepWidth,
    stepPosition,
    stepShape
  };

  // Live-preview source params used by previewUpdateDepths()
  group.userData.params = { ...group.userData.poolParams };

  /* -------------------------------------------------------
     FLOOR
  ------------------------------------------------------- */
  const segmentsX = Math.max(2, Math.floor(length * 10));
  const segmentsY = Math.max(2, Math.floor(width * 10));
  const floorGeo = new THREE.PlaneGeometry(
    length,
    width,
    segmentsX,
    segmentsY
  );

  const pos = floorGeo.attributes.position;

  const axisStartWallX = -length / 2;
  const axisEndX = length / 2;

  const STEP_LENGTH = 0.3;
  const STEP_TOP_OFFSET = 0.25;

// Shared source of truth: how far the steps run into the pool
const stepFootprintLen = getStepFootprintLength(params, stepCount, STEP_LENGTH);
const floorStepWallFrame = getStepWallFrame({ ...params, stepWall: "west" }, -length / 2, length / 2, -width / 2, width / 2);

// Keep the floor transition locked to the original west/left entry axis.
// stepWall only controls where the stair meshes are placed.
const originCoord = floorStepWallFrame.wallCoord + floorStepWallFrame.inwardSign * stepFootprintLen;
const axisLen = floorStepWallFrame.axis === "x" ? length : width;
const originX = axisStartWallX + stepFootprintLen;

// Persist for downstream systems / debugging
group.userData.stepFootprintLen = stepFootprintLen;
group.userData.originX = originX;
group.userData.floorStepWall = floorStepWallFrame.wall;

  const fullLen = Math.max(0.01, axisLen - stepFootprintLen);

  let sFlat = shallowFlat || 0;
  let dFlat = deepFlat || 0;

  const maxFlats = Math.max(0, fullLen - 0.01);
  if (sFlat + dFlat > maxFlats) {
    const scale = maxFlats / (sFlat + dFlat);
    sFlat *= scale;
    dFlat *= scale;
  }

  const slopeLen = Math.max(0.01, fullLen - sFlat - dFlat);

  for (let i = 0; i < pos.count; i++) {
    const axisCoord = floorStepWallFrame.axis === "x" ? pos.getX(i) : pos.getY(i);
    let dx = floorStepWallFrame.inwardSign * (axisCoord - originCoord);
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

    pos.setZ(i, z);
  }

  floorGeo.computeVertexNormals();
  const floor = new THREE.Mesh(
    floorGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  floor.receiveShadow = true;
  floor.userData.isFloor = true;
floor.userData.type = "floor";

  group.add(floor);
  trimFloorToWallInterior(floor, [
    new THREE.Vector2(-length / 2, -width / 2),
    new THREE.Vector2(length / 2, -width / 2),
    new THREE.Vector2(length / 2, width / 2),
    new THREE.Vector2(-length / 2, width / 2)
  ]);


  const getLockedFloorDepthAt = (worldX, worldY) => {
    const axisCoord = floorStepWallFrame.axis === "x" ? worldX : worldY;
    let dx = floorStepWallFrame.inwardSign * (axisCoord - originCoord);
    if (dx < 0) dx = 0;

    if (dx <= sFlat) return clampedShallow;
    if (dx >= fullLen - dFlat) return clampedDeep;
    const t = (dx - sFlat) / slopeLen;
    return clampedShallow + t * (clampedDeep - clampedShallow);
  };

  /* -------------------------------------------------------
     STEPS
  ------------------------------------------------------- */
  if (stepCount > 0) {
    const shallowDepth = clampedShallow;
    const stepWallFrame = getStepWallFrame(params, -length / 2, length / 2, -width / 2, width / 2);
    let narrowLayout = getStepLayout(params, stepWallFrame.spanMin, stepWallFrame.spanMax);
    const fullStepLayout = getStepLayout(params, stepWallFrame.spanMin, stepWallFrame.spanMax, { fullWidth: true });

    // Only curved-wall side steps in Bench Seat mode need the 300 mm
    // set-in from the full-width bench seat end. Straight walls keep the
    // original flush left/right behaviour, and Steps Only mode has no bench
    // edge to offset from.
    const benchSeatModeForAnchor = (params?.stepBenchMode === "stepsOnly" ? "stepsOnly" : "bench") === "bench" && stepCount > 1;
    // Base the 300 mm offset on the full bench/wall span being curved, not
    // only the narrow step chord. Otherwise a side step can stay flush even
    // when it sits on a visibly curved bench.
    const fullBenchBoundaryLayout = {
      ...fullStepLayout,
      boundaryClip: {
        frame: stepWallFrame,
        distanceFromWall: getBench2Extension(params) * 0.5,
        alongCenter: fullStepLayout.centerY
      }
    };
    const curvedSideAnchor = benchSeatModeForAnchor
      && narrowLayout.placementPosition !== "center"
      && hasCurvedLocalStepWallSegment(fullBenchBoundaryLayout, narrowLayout, narrowLayout.width);
    if (curvedSideAnchor && narrowLayout.placementPosition !== "center") {
      narrowLayout = applyCurvedSideAnchorToLayout(
        narrowLayout,
        stepWallFrame,
        STEP_LENGTH * 0.5,
        narrowLayout.width,
        STEP_TIER_OFFSET
      );
    }

    for (let s = 0; s < stepCount; s++) {
      const bench2Extension = getBench2Extension(params);
      const diagonalStepSize = getDiagonalStepSize(params, bench2Extension);
      const straightStepRun = Math.max(0.05, Number(params?.stepExtension) || STEP_LENGTH);
      const stepBenchMode = params?.stepBenchMode === "stepsOnly" ? "stepsOnly" : "bench";
      const wantsBenchSeat = stepBenchMode === "bench" && stepCount > 1;
      const baseLayout = wantsBenchSeat && s === 1 ? fullStepLayout : narrowLayout;
      const circularWallFollow = params?.stepShape === "circular" && hasNonStraightWallSpan({
        ...baseLayout,
        boundaryClip: {
          frame: stepWallFrame,
          distanceFromWall: STEP_LENGTH * 0.5,
          alongCenter: baseLayout.centerY
        }
      }, baseLayout.width);
      const isCenteredCircular = params?.stepShape === "circular" && (baseLayout.position === "center" || circularWallFollow);
      const centeredCircularMode = stepBenchMode;
      const isBenchSeat = wantsBenchSeat && s === 1;
      const isCenterBenchSeat = isCenteredCircular && isBenchSeat;
      let layout = isBenchSeat ? { ...fullStepLayout, isBenchSeat: true } : baseLayout;
      const topDepth = Math.max(0, Math.min(shallowDepth - 0.05, STEP_TOP_OFFSET + stepDepth * s));
      let h = Math.max(0.05, shallowDepth - topDepth);

      if (stepBenchMode === "stepsOnly") {
        const nestedFullWidth = Math.max(0.05, stepWallFrame.spanMax - stepWallFrame.spanMin);
        const nestedBaseWidth = Math.max(0.05, Number(narrowLayout.width) || STEP_PRESET_WIDTH);
        const nestedWidthGrowth = narrowLayout.position === "center" ? STEP_TIER_OFFSET * 2 * s : STEP_TIER_OFFSET * s;
          const nestedWidth = Math.min(nestedFullWidth, nestedBaseWidth + nestedWidthGrowth);
        let nestedCenterY = (stepWallFrame.spanMin + stepWallFrame.spanMax) * 0.5;
        const nestedPlacement = narrowLayout.placementPosition || narrowLayout.position;
        const nestedSideOffset = nestedPlacement !== "center" && narrowLayout.curvedSideAnchor
          ? Math.min(STEP_TIER_OFFSET, Math.max(0, nestedFullWidth - nestedWidth))
          : 0;
        if (nestedPlacement === "left") nestedCenterY = stepWallFrame.spanMin + nestedSideOffset + nestedWidth * 0.5;
        if (nestedPlacement === "right") nestedCenterY = stepWallFrame.spanMax - nestedSideOffset - nestedWidth * 0.5;
        layout = { ...layout, width: nestedWidth, centerY: nestedCenterY, isFullWidth: false, isBenchSeat: false };
        if (nestedPlacement !== "center" && narrowLayout.curvedSideAnchor) {
          layout = applyCurvedSideAnchorToLayout(
            layout,
            stepWallFrame,
            Math.max(0.025, STEP_LENGTH * 0.5 + STEP_TIER_OFFSET * s * 0.5),
            nestedWidth,
            STEP_TIER_OFFSET
          );
        }
      }


      const centeredCircularRadius = Math.max(0.05, Number(params?.stepExtension) || ((Number(params?.stepWidth) || STEP_PRESET_WIDTH) * 0.5));
      const centeredCircularStepCount = Math.max(1, centeredCircularMode === "bench" && stepCount > 1 ? stepCount - 1 : stepCount);
      const centeredCircularOrdinal = centeredCircularMode === "bench" && stepCount > 1
        ? (s < 1 ? s + 1 : s)
        : (s + 1);
      const centeredCircularRun = centeredCircularMode === "stepsOnly"
          ? centeredCircularRadius + STEP_TIER_OFFSET * s
          : centeredCircularRadius * (centeredCircularOrdinal / centeredCircularStepCount);
      const isDiagonalNarrow = (params?.stepShape === "diagonal" || (params?.stepShape === "circular" && !circularWallFollow)) && !isBenchSeat && layout.position !== "center";
      let stepRun = isBenchSeat ? bench2Extension : (isCenteredCircular ? centeredCircularRun : (isDiagonalNarrow ? diagonalStepSize : straightStepRun));
        let stepWidthForGeo = isBenchSeat ? layout.width : (isCenteredCircular ? centeredCircularRun * 2 : (isDiagonalNarrow ? diagonalStepSize : layout.width));
        if (circularWallFollow && !isBenchSeat) {
          // Curved-wall circular steps must remain true semicircles. The width
          // slider controls the diameter, and the circular footprint returns
          // back to the wall or the bench by using radius = diameter / 2.
          stepWidthForGeo = Math.max(0.1, layout.width);
          stepRun = Math.max(0.05, stepWidthForGeo * 0.5);
        }
        if (stepBenchMode === "bench" && !isBenchSeat) {
          const customBenchRun = getBenchStepRunOverride(params, s);
          if (customBenchRun !== null) {
            stepRun = customBenchRun;
            if (isDiagonalNarrow) stepWidthForGeo = customBenchRun;
          }
        }

        if (stepBenchMode === "stepsOnly") {
          if (isCenteredCircular) {
            stepWidthForGeo = layout.width;
            stepRun = Math.max(0.05, stepWidthForGeo * 0.5);
          } else if (isDiagonalNarrow) {
            stepRun = Math.max(0.05, diagonalStepSize + STEP_TIER_OFFSET * s);
            stepWidthForGeo = stepRun;
          } else {
            stepRun = Math.max(0.05, straightStepRun + STEP_TIER_OFFSET * s);
            stepWidthForGeo = layout.width;
          }

          // Optional per-tier override: the Step Extension slider can extend the
          // selected tier without forcing every tier to remain exactly 300 mm apart.
          const customRun = getStepsOnlyStepRunOverride(params, s);
          if (customRun !== null) {
            stepRun = customRun;
            if (isDiagonalNarrow) stepWidthForGeo = customRun;
          }
        }
      let distanceFromWall;
      if (isCenteredCircular) {
        distanceFromWall = ((stepBenchMode === "bench" && stepCount > 1 && s > 1 ? bench2Extension : 0) + stepRun * 0.5);
      } else if (stepBenchMode === "stepsOnly") {
        distanceFromWall = stepRun * 0.5;
      } else if (s <= 1) {
        distanceFromWall = stepRun * 0.5;
      } else {
        // Bench Seat lower treads are rebuilt from the saved chain, not from a
        // fixed repeated run. This prevents the lower tread positions from
        // snapping back after another step or the bench is changed.
        let previousLowerRuns = 0;
        for (let i = 2; i < s; i++) {
          const override = getBenchStepRunOverride(params, i);
          const fallback = Math.max(0.05, Number(params?.stepExtension) || STEP_LENGTH);
          previousLowerRuns += Math.max(0.05, override ?? fallback);
        }
        distanceFromWall = bench2Extension + previousLowerRuns + stepRun * 0.5;
      }

      // Keep the full-width bench spanning the selected wall.
      // Do not fit/shrink it to the narrowest chord of a curved wall.
      if (!isBenchSeat && !layout.curvedSideAnchor) {
        const wallFit = fitStepToPoolBoundary(
          stepWallFrame,
          distanceFromWall,
          layout,
          stepRun,
          stepWidthForGeo
        );
        if (wallFit) {
          layout = { ...layout, centerY: wallFit.centerY, width: wallFit.width };
          stepWidthForGeo = wallFit.width;
        }
      }

      const floorDepthAtStep = getStepFootprintFloorDepth(
        stepWallFrame,
        distanceFromWall,
        layout.centerY,
        stepRun,
        stepWidthForGeo,
        getLockedFloorDepthAt
      );
      if (Number.isFinite(floorDepthAtStep) && floorDepthAtStep > topDepth + 0.05) {
        h = Math.max(0.05, floorDepthAtStep - topDepth);
      }

      const geometryLayout = {
        ...layout,
        ...(circularWallFollow && !isBenchSeat ? { position: "center", localPosition: "center" } : {}),
        // Option 1: bind the generated step/bench mesh to the real selected
        // wall geometry. createBoundaryClippedRectStepGeometry samples the
        // perimeter at each point along the step span, so the wall-side edge
        // follows angled and curved walls instead of the old bbox chord.
        boundaryClip: {
          frame: stepWallFrame,
          distanceFromWall,
          alongCenter: layout.centerY
        }
      };
      const geo = createStepGeometry(stepRun, stepWidthForGeo, h, params, geometryLayout);
      const mat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });

      const step = new THREE.Mesh(geo, mat);

      const z = -(topDepth + h * 0.5);

      placeStepOnWall(step, stepWallFrame, distanceFromWall, layout.centerY, z);
      step.userData.isStep = true;
      step.userData.stepIndex = s;
      step.userData.stepPosition = layout.position;
      step.userData.stepPlacementPosition = layout.placementPosition || layout.position;
      step.userData.stepLocalPosition = layout.localPosition || layout.position;
      step.userData.stepWall = stepWallFrame.wall;
      step.userData.stepShape = (["diagonal", "circular", "radius"].includes(params?.stepShape)) ? params.stepShape : "rectangle";
      step.userData.stepWidth = stepWidthForGeo;
      step.userData.baseHeight = h;
      step.userData.floorDepth = topDepth + h;
      step.userData.stepRun = stepRun;
      step.castShadow = true;
      step.receiveShadow = true;

      group.add(step);
    }

    addStepBenchMeshes(
      group,
      params,
      narrowLayout,
      -width / 2,
      width / 2,
      -length / 2,
      STEP_LENGTH,
      STEP_TOP_OFFSET,
      stepDepth
    );
  }

  /* -------------------------------------------------------
     WATER
  ------------------------------------------------------- */
  const waterGeo = floorGeo.clone();
  for (let i = 0; i < waterGeo.attributes.position.count; i++) {
    waterGeo.attributes.position.setZ(i, -0.1);
  }
  waterGeo.computeVertexNormals();

  const water = createPoolWater(length, width, waterGeo);
  water.receiveShadow = true;
  if (water.material) {
    water.material.depthWrite = false;
  }
  water.renderOrder = 1;
  group.add(water);

  /* -------------------------------------------------------
     WALLS
  ------------------------------------------------------- */
  const wallThickness = 0.2; // fixed wall thickness
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide
  });

  const walls = [
    new THREE.Mesh(
      new THREE.BoxGeometry(length + wallThickness * 2, wallThickness, clampedDeep),
      wallMat.clone()
    ), // 0: south
    new THREE.Mesh(
      new THREE.BoxGeometry(length + wallThickness * 2, wallThickness, clampedDeep),
      wallMat.clone()
    ), // 1: north
    new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, width, clampedDeep),
      wallMat.clone()
    ), // 2: east
    new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, width, clampedDeep),
      wallMat.clone()
    ) // 3: west
  ];

  // Top of walls is at z = 0 (center at -clampedDeep/2 with height clampedDeep)
  walls[0].position.set(0, -width / 2 - wallThickness / 2, -clampedDeep / 2); // south
  walls[1].position.set(0, width / 2 + wallThickness / 2, -clampedDeep / 2);  // north
  walls[2].position.set(length / 2 + wallThickness / 2, 0, -clampedDeep / 2); // east
  walls[3].position.set(-length / 2 - wallThickness / 2, 0, -clampedDeep / 2); // west

  const wallSides = ["south", "north", "east", "west"];
  const wallEdgeIndices = [0, 2, 1, 3];

  walls.forEach((w, idx) => {
    w.castShadow = true;
    w.receiveShadow = true;

    w.userData.isWall = true;
    w.userData.baseHeight = clampedDeep;
    w.userData.extraHeight = 0;
    w.userData.side = wallSides[idx];
    w.userData.copingKey = wallSides[idx];
    w.userData.edgeIndex = wallEdgeIndices[idx];

    group.add(w);
  });

  /* -------------------------------------------------------
     COPING – 4 SEPARATE SEGMENTS (one per wall)
     PBR Travertine from textures/Coping/
  ------------------------------------------------------- */
  const poolPts = [
    new THREE.Vector2(-length / 2, -width / 2),
    new THREE.Vector2(length / 2, -width / 2),
    new THREE.Vector2(length / 2, width / 2),
    new THREE.Vector2(-length / 2, width / 2)
  ];
  group.userData.outerPts = poolPts; // used by ground void etc.
  group.userData.spaSnapEdges = [
    {
      p0: poolPts[0].clone(),
      p1: poolPts[3].clone(),
      normal: new THREE.Vector2(1, 0)
    },
    {
      p0: poolPts[2].clone(),
      p1: poolPts[1].clone(),
      normal: new THREE.Vector2(-1, 0)
    },
    {
      p0: poolPts[1].clone(),
      p1: poolPts[0].clone(),
      normal: new THREE.Vector2(0, 1)
    },
    {
      p0: poolPts[3].clone(),
      p1: poolPts[2].clone(),
      normal: new THREE.Vector2(0, -1)
    }
  ];

  const copingOverhang = 0.05;  // inward overhang toward water
  const copingDepth = 0.05;     // vertical thickness of coping (match all pool shapes)
  const zOffset = 0.001;        // small lift to avoid z-fighting

  const halfL = length / 2;
  const halfW = width / 2;

  const outerHalfL = halfL + wallThickness;
  const outerHalfW = halfW + wallThickness;

  const longX = outerHalfL * 2;
  const longY = outerHalfW * 2;
  const short = wallThickness + copingOverhang;

  function makeCopingMat() {
    const material = createStoneMaterial({
      repeat: 2,
      roughness: 1.0,
      metalness: 0.0,
      debugLabel: "Rectangle coping"
    });
    material.userData.isCoping = true;
    return material;
  }

  function addUV2(geo) {
    if (geo.attributes && geo.attributes.uv && !geo.attributes.uv2) {
      geo.setAttribute(
        "uv2",
        new THREE.BufferAttribute(geo.attributes.uv.array, 2)
      );
    }
  }

  // SOUTH coping segment
  const copingSouthGeo = new THREE.BoxGeometry(longX, short, copingDepth);
  addUV2(copingSouthGeo);
  const copingSouth = new THREE.Mesh(copingSouthGeo, makeCopingMat());
  copingSouth.position.set(
    0,
    -halfW - wallThickness / 2 + copingOverhang / 2,
    copingDepth / 2 + zOffset
  );
  copingSouth.castShadow = true;
  copingSouth.receiveShadow = true;
  copingSouth.userData.isCoping = true;
  copingSouth.userData.baseZ = copingSouth.position.z;
  copingSouth.userData.side = "south";
  group.add(copingSouth);

  // NORTH coping segment
  const copingNorthGeo = new THREE.BoxGeometry(longX, short, copingDepth);
  addUV2(copingNorthGeo);
  const copingNorth = new THREE.Mesh(copingNorthGeo, makeCopingMat());
  copingNorth.position.set(
    0,
    halfW + wallThickness / 2 - copingOverhang / 2,
    copingDepth / 2 + zOffset
  );
  copingNorth.castShadow = true;
  copingNorth.receiveShadow = true;
  copingNorth.userData.isCoping = true;
  copingNorth.userData.baseZ = copingNorth.position.z;
  copingNorth.userData.side = "north";
  group.add(copingNorth);

  // EAST coping segment
  const copingEastGeo = new THREE.BoxGeometry(short, longY, copingDepth);
  addUV2(copingEastGeo);
  const copingEast = new THREE.Mesh(copingEastGeo, makeCopingMat());
  copingEast.position.set(
    halfL + wallThickness / 2 - copingOverhang / 2,
    0,
    copingDepth / 2 + zOffset
  );
  copingEast.castShadow = true;
  copingEast.receiveShadow = true;
  copingEast.userData.isCoping = true;
  copingEast.userData.baseZ = copingEast.position.z;
  copingEast.userData.side = "east";
  group.add(copingEast);

  // WEST coping segment
  const copingWestGeo = new THREE.BoxGeometry(short, longY, copingDepth);
  addUV2(copingWestGeo);
  const copingWest = new THREE.Mesh(copingWestGeo, makeCopingMat());
  copingWest.position.set(
    -halfL - wallThickness / 2 + copingOverhang / 2,
    0,
    copingDepth / 2 + zOffset
  );
  copingWest.castShadow = true;
  copingWest.receiveShadow = true;
  copingWest.userData.isCoping = true;
  copingWest.userData.baseZ = copingWest.position.z;
  copingWest.userData.side = "west";
  group.add(copingWest);

  group.userData.copingSegments = {
    south: copingSouth,
    north: copingNorth,
    east: copingEast,
    west: copingWest
  };

  /* -------------------------------------------------------
     METADATA / ANIMATION
  ------------------------------------------------------- */
  const animatables = [];
  group.traverse((o) => {
    if (o.userData && typeof o.userData.animate === "function") {
      animatables.push(o);
    }
  });

  group.userData.floorMesh = floor;
  group.userData.waterMesh = water;
  group.userData.water = water;
  group.userData.wallMeshes = walls;
  group.userData.wallThickness = wallThickness;
  group.userData.animatables = animatables;

  return group;
}
