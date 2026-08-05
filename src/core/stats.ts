/** Bounds, volume, and material estimates. */

import type { Bounds, Stats } from "./types";

export const PLA_G_PER_CM3 = 1.24;

export function computeBounds(positions: Float32Array): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let o = 0; o < positions.length; o += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[o + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

/** Signed-tetrahedron volume in mm^3. Exact when the mesh is watertight
 * with consistent winding; an estimate otherwise (the UI labels it). */
export function computeVolume(positions: Float32Array, triCount: number): number {
  let six = 0;
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const ax = positions[o], ay = positions[o + 1], az = positions[o + 2];
    const bx = positions[o + 3], by = positions[o + 4], bz = positions[o + 5];
    const cx = positions[o + 6], cy = positions[o + 7], cz = positions[o + 8];
    six +=
      ax * (by * cz - bz * cy) -
      ay * (bx * cz - bz * cx) +
      az * (bx * cy - by * cx);
  }
  return Math.abs(six / 6);
}

export function computeStats(positions: Float32Array, triCount: number): Stats {
  const bounds = computeBounds(positions);
  const volume = computeVolume(positions, triCount);
  return {
    triCount,
    bounds,
    volume,
    massSolidPla: (volume / 1000) * PLA_G_PER_CM3,
  };
}

export function triangleArea(positions: Float32Array, t: number): number {
  const o = t * 9;
  const ux = positions[o + 3] - positions[o];
  const uy = positions[o + 4] - positions[o + 1];
  const uz = positions[o + 5] - positions[o + 2];
  const vx = positions[o + 6] - positions[o];
  const vy = positions[o + 7] - positions[o + 1];
  const vz = positions[o + 8] - positions[o + 2];
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  return Math.hypot(cx, cy, cz) / 2;
}
