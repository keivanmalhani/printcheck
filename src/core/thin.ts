/** Thin-feature detection: sampled inward raycasts.
 *
 * Honest heuristic, labeled as such in the UI: from a sample of triangle
 * centroids, cast a short ray inward (against the face normal). Hitting
 * the opposite wall closer than the threshold (default 0.8 mm, two
 * 0.4 mm perimeters) marks both faces thin. Sampling caps the work on
 * huge meshes; a clean pass means "no thin walls found among the
 * samples", not a proof there are none. */

import type { ThinReport } from "./types";
import { computeBounds } from "./stats";

export const DEFAULT_THIN_MM = 0.8;
export const MAX_SAMPLES = 3000;
const EPSILON = 1e-4;

interface Grid {
  cell: number;
  origin: [number, number, number];
  dims: [number, number, number];
  buckets: Map<number, number[]>;
}

function buildGrid(
  positions: Float32Array,
  triCount: number,
  cellSize: number,
): Grid {
  const bounds = computeBounds(positions);
  const origin = bounds.min;
  const dims: [number, number, number] = [
    Math.max(1, Math.ceil(bounds.size[0] / cellSize)),
    Math.max(1, Math.ceil(bounds.size[1] / cellSize)),
    Math.max(1, Math.ceil(bounds.size[2] / cellSize)),
  ];
  const buckets = new Map<number, number[]>();
  const clamp = (v: number, hi: number) => Math.min(hi - 1, Math.max(0, v));

  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    let lo0 = Infinity, lo1 = Infinity, lo2 = Infinity;
    let hi0 = -Infinity, hi1 = -Infinity, hi2 = -Infinity;
    for (let v = 0; v < 3; v++) {
      const x = positions[o + v * 3];
      const y = positions[o + v * 3 + 1];
      const z = positions[o + v * 3 + 2];
      if (x < lo0) lo0 = x; if (x > hi0) hi0 = x;
      if (y < lo1) lo1 = y; if (y > hi1) hi1 = y;
      if (z < lo2) lo2 = z; if (z > hi2) hi2 = z;
    }
    const cx0 = clamp(Math.floor((lo0 - origin[0]) / cellSize), dims[0]);
    const cx1 = clamp(Math.floor((hi0 - origin[0]) / cellSize), dims[0]);
    const cy0 = clamp(Math.floor((lo1 - origin[1]) / cellSize), dims[1]);
    const cy1 = clamp(Math.floor((hi1 - origin[1]) / cellSize), dims[1]);
    const cz0 = clamp(Math.floor((lo2 - origin[2]) / cellSize), dims[2]);
    const cz1 = clamp(Math.floor((hi2 - origin[2]) / cellSize), dims[2]);
    for (let x = cx0; x <= cx1; x++)
      for (let y = cy0; y <= cy1; y++)
        for (let z = cz0; z <= cz1; z++) {
          const key = (x * dims[1] + y) * dims[2] + z;
          const bucket = buckets.get(key);
          if (bucket) bucket.push(t);
          else buckets.set(key, [t]);
        }
  }
  return { cell: cellSize, origin, dims, buckets };
}

/** Moller-Trumbore, returns hit distance or Infinity. */
function rayTriangle(
  positions: Float32Array,
  t: number,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
): number {
  const o = t * 9;
  const ax = positions[o], ay = positions[o + 1], az = positions[o + 2];
  const e1x = positions[o + 3] - ax, e1y = positions[o + 4] - ay, e1z = positions[o + 5] - az;
  const e2x = positions[o + 6] - ax, e2y = positions[o + 7] - ay, e2z = positions[o + 8] - az;
  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return Infinity;
  const inv = 1 / det;
  const tx = ox - ax, ty = oy - ay, tz = oz - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-6 || u > 1 + 1e-6) return Infinity;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-6 || u + v > 1 + 1e-6) return Infinity;
  const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return dist > EPSILON ? dist : Infinity;
}

export function thinReport(
  positions: Float32Array,
  normals: Float32Array,
  triCount: number,
  thresholdMm: number = DEFAULT_THIN_MM,
): ThinReport {
  const faceMask = new Uint8Array(triCount);
  const bounds = computeBounds(positions);
  const diag = Math.hypot(...bounds.size);
  const grid = buildGrid(positions, triCount, Math.max(thresholdMm * 2, diag / 64));

  const stride = Math.max(1, Math.ceil(triCount / MAX_SAMPLES));
  let samples = 0;
  let hits = 0;
  const clamp = (v: number, hi: number) => Math.min(hi - 1, Math.max(0, v));

  for (let t = 0; t < triCount; t += stride) {
    const n = t * 3;
    const nx = normals[n], ny = normals[n + 1], nz = normals[n + 2];
    if (nx === 0 && ny === 0 && nz === 0) continue;
    samples++;

    const o = t * 9;
    const cx = (positions[o] + positions[o + 3] + positions[o + 6]) / 3;
    const cy = (positions[o + 1] + positions[o + 4] + positions[o + 7]) / 3;
    const cz = (positions[o + 2] + positions[o + 5] + positions[o + 8]) / 3;
    const dx = -nx, dy = -ny, dz = -nz;

    // The ray is at most thresholdMm long: gather candidates from the
    // grid cells its bounding box overlaps.
    const ex = cx + dx * thresholdMm;
    const ey = cy + dy * thresholdMm;
    const ez = cz + dz * thresholdMm;
    const x0 = clamp(Math.floor((Math.min(cx, ex) - grid.origin[0]) / grid.cell), grid.dims[0]);
    const x1 = clamp(Math.floor((Math.max(cx, ex) - grid.origin[0]) / grid.cell), grid.dims[0]);
    const y0 = clamp(Math.floor((Math.min(cy, ey) - grid.origin[1]) / grid.cell), grid.dims[1]);
    const y1 = clamp(Math.floor((Math.max(cy, ey) - grid.origin[1]) / grid.cell), grid.dims[1]);
    const z0 = clamp(Math.floor((Math.min(cz, ez) - grid.origin[2]) / grid.cell), grid.dims[2]);
    const z1 = clamp(Math.floor((Math.max(cz, ez) - grid.origin[2]) / grid.cell), grid.dims[2]);

    let best = Infinity;
    let bestTri = -1;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const bucket = grid.buckets.get((x * grid.dims[1] + y) * grid.dims[2] + z);
          if (!bucket) continue;
          for (const candidate of bucket) {
            if (candidate === t) continue;
            const dist = rayTriangle(positions, candidate, cx, cy, cz, dx, dy, dz);
            if (dist < best) {
              best = dist;
              bestTri = candidate;
            }
          }
        }

    if (best <= thresholdMm && bestTri >= 0) {
      faceMask[t] = 1;
      faceMask[bestTri] = 1;
      hits++;
    }
  }

  return { faceMask, thinSampleHits: hits, samplesTaken: samples, thresholdMm };
}
