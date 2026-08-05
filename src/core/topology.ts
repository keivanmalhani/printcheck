/** Shared-vertex topology and the manifold report.
 *
 * STL is triangle soup: coincident vertices are repeated per triangle.
 * Dedup on a 1e-4 mm grid rebuilds shared identity, then edge use
 * counts tell the story: a closed printable solid uses every edge
 * exactly twice. Once = boundary (a hole a slicer will misread), three
 * or more = non-manifold (T-junctions, internal walls). */

import type { ManifoldReport } from "./types";

const GRID = 1e4; // 1e-4 mm quantization

export interface Topology {
  /** Vertex index per corner, triCount*3. */
  corners: Uint32Array;
  vertexCount: number;
}

export function buildTopology(positions: Float32Array, triCount: number): Topology {
  const ids = new Map<string, number>();
  const corners = new Uint32Array(triCount * 3);
  let next = 0;
  for (let c = 0; c < triCount * 3; c++) {
    const o = c * 3;
    const key =
      Math.round(positions[o] * GRID) +
      "," +
      Math.round(positions[o + 1] * GRID) +
      "," +
      Math.round(positions[o + 2] * GRID);
    let id = ids.get(key);
    if (id === undefined) {
      id = next++;
      ids.set(key, id);
    }
    corners[c] = id;
  }
  return { corners, vertexCount: next };
}

export function manifoldReport(
  positions: Float32Array,
  triCount: number,
  topology?: Topology,
): ManifoldReport {
  const { corners } = topology ?? buildTopology(positions, triCount);

  // Edge key -> use count plus one representative corner offset so the
  // boundary outline can be rendered from real coordinates.
  const counts = new Map<string, { count: number; corner: number; other: number }>();
  for (let t = 0; t < triCount; t++) {
    for (let e = 0; e < 3; e++) {
      const cornerA = t * 3 + e;
      const cornerB = t * 3 + ((e + 1) % 3);
      const a = corners[cornerA];
      const b = corners[cornerB];
      if (a === b) continue; // degenerate sliver edge
      const key = a < b ? a + "_" + b : b + "_" + a;
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { count: 1, corner: cornerA, other: cornerB });
    }
  }

  const boundary: { corner: number; other: number }[] = [];
  let nonManifold = 0;
  for (const entry of counts.values()) {
    if (entry.count === 1) boundary.push(entry);
    else if (entry.count > 2) nonManifold++;
  }

  const segments = new Float32Array(boundary.length * 6);
  boundary.forEach((edge, i) => {
    const a = edge.corner * 3;
    const b = edge.other * 3;
    segments[i * 6] = positions[a];
    segments[i * 6 + 1] = positions[a + 1];
    segments[i * 6 + 2] = positions[a + 2];
    segments[i * 6 + 3] = positions[b];
    segments[i * 6 + 4] = positions[b + 1];
    segments[i * 6 + 5] = positions[b + 2];
  });

  return {
    watertight: boundary.length === 0 && nonManifold === 0,
    boundaryEdgeCount: boundary.length,
    nonManifoldEdgeCount: nonManifold,
    boundarySegments: segments,
  };
}
