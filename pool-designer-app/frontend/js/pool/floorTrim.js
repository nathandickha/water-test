import * as THREE from "https://esm.sh/three@0.158.0";

const EPS = 1e-8;

function signedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

function interpolateVertex(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    u: a.u + (b.u - a.u) * t,
    v: a.v + (b.v - a.v) * t
  };
}

function clipToConvex(subject, clipPoints) {
  let output = subject;
  const ccw = signedArea(clipPoints) >= 0;

  for (let i = 0; i < clipPoints.length && output.length; i++) {
    const cp1 = clipPoints[i];
    const cp2 = clipPoints[(i + 1) % clipPoints.length];
    const input = output;
    output = [];

    const inside = (p) => {
      const cross = (cp2.x - cp1.x) * (p.y - cp1.y) - (cp2.y - cp1.y) * (p.x - cp1.x);
      return ccw ? cross >= -EPS : cross <= EPS;
    };

    const intersection = (s, e) => {
      const rx = e.x - s.x;
      const ry = e.y - s.y;
      const sx = cp2.x - cp1.x;
      const sy = cp2.y - cp1.y;
      const denom = rx * sy - ry * sx;
      if (Math.abs(denom) < EPS) return { ...e };
      const t = ((cp1.x - s.x) * sy - (cp1.y - s.y) * sx) / denom;
      return interpolateVertex(s, e, THREE.MathUtils.clamp(t, 0, 1));
    };

    let s = input[input.length - 1];
    for (const e of input) {
      const eInside = inside(e);
      const sInside = inside(s);
      if (eInside) {
        if (!sInside) output.push(intersection(s, e));
        output.push(e);
      } else if (sInside) {
        output.push(intersection(s, e));
      }
      s = e;
    }
  }
  return output;
}

/** Trim an existing profiled floor mesh to the pool's inner wall perimeter. */
export function trimFloorToWallInterior(floorMesh, perimeterPoints) {
  const geometry = floorMesh?.geometry;
  if (!geometry?.attributes?.position || !Array.isArray(perimeterPoints) || perimeterPoints.length < 3) return false;

  const boundary = perimeterPoints.map((p) => new THREE.Vector2(
    p.x - (floorMesh.position?.x || 0),
    p.y - (floorMesh.position?.y || 0)
  ));
  if (boundary[0].distanceToSquared(boundary[boundary.length - 1]) < EPS) boundary.pop();

  const boundaryTris = THREE.ShapeUtils.triangulateShape(boundary, []).map((tri) => [
    boundary[tri[0]], boundary[tri[1]], boundary[tri[2]]
  ]);
  if (!boundaryTris.length) return false;

  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const index = geometry.index;
  const sourceIndices = index ? index.array : Array.from({ length: pos.count }, (_, i) => i);
  const outPos = [];
  const outUv = [];
  const outIdx = [];

  const readVertex = (i) => ({
    x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i),
    u: uv ? uv.getX(i) : pos.getX(i),
    v: uv ? uv.getY(i) : pos.getY(i)
  });

  const add = (v) => {
    outPos.push(v.x, v.y, v.z);
    outUv.push(v.u, v.v);
    return outPos.length / 3 - 1;
  };

  for (let i = 0; i + 2 < sourceIndices.length; i += 3) {
    const tri = [readVertex(sourceIndices[i]), readVertex(sourceIndices[i + 1]), readVertex(sourceIndices[i + 2])];
    const minX = Math.min(tri[0].x, tri[1].x, tri[2].x);
    const maxX = Math.max(tri[0].x, tri[1].x, tri[2].x);
    const minY = Math.min(tri[0].y, tri[1].y, tri[2].y);
    const maxY = Math.max(tri[0].y, tri[1].y, tri[2].y);

    for (const clipTri of boundaryTris) {
      const cMinX = Math.min(clipTri[0].x, clipTri[1].x, clipTri[2].x);
      const cMaxX = Math.max(clipTri[0].x, clipTri[1].x, clipTri[2].x);
      const cMinY = Math.min(clipTri[0].y, clipTri[1].y, clipTri[2].y);
      const cMaxY = Math.max(clipTri[0].y, clipTri[1].y, clipTri[2].y);
      if (cMaxX < minX - EPS || cMinX > maxX + EPS || cMaxY < minY - EPS || cMinY > maxY + EPS) continue;

      const clipped = clipToConvex(tri, clipTri);
      if (clipped.length < 3) continue;
      const first = add(clipped[0]);
      for (let k = 1; k < clipped.length - 1; k++) {
        outIdx.push(first, add(clipped[k]), add(clipped[k + 1]));
      }
    }
  }

  if (!outIdx.length) return false;
  const trimmed = new THREE.BufferGeometry();
  trimmed.setAttribute("position", new THREE.Float32BufferAttribute(outPos, 3));
  trimmed.setAttribute("uv", new THREE.Float32BufferAttribute(outUv, 2));
  trimmed.setAttribute("uv2", new THREE.Float32BufferAttribute(outUv.slice(), 2));
  trimmed.setIndex(outIdx);
  trimmed.computeVertexNormals();
  trimmed.computeBoundingBox();
  trimmed.computeBoundingSphere();
  geometry.dispose();
  floorMesh.geometry = trimmed;
  floorMesh.userData.trimmedToWallInterior = true;
  return true;
}
