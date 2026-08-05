/** Overhang detection: face normal angle against the build direction.
 *
 * Convention: the overhang threshold is the surface angle measured from
 * vertical, the number printed on every "45 degree rule" torture test.
 * A vertical wall is 0 (normal horizontal, n.z = 0); a flat ceiling is
 * 90 (normal straight down, n.z = -1). A down-facing triangle is an
 * overhang when its angle exceeds the threshold, i.e. -n.z > sin(t).
 *
 * Triangles whose vertices all sit within BED_TOLERANCE of the model's
 * lowest point are bed contact: the plate supports them, they are never
 * overhang no matter how flat-down they face. */

import { triangleArea } from "./stats";
import type { OverhangReport } from "./types";

export const DEFAULT_OVERHANG_DEG = 45;
export const BED_TOLERANCE_MM = 0.3;

export function overhangReport(
  positions: Float32Array,
  normals: Float32Array,
  triCount: number,
  thresholdDeg: number = DEFAULT_OVERHANG_DEG,
): OverhangReport {
  let minZ = Infinity;
  for (let o = 2; o < positions.length; o += 3) {
    if (positions[o] < minZ) minZ = positions[o];
  }
  const bedCeiling = minZ + BED_TOLERANCE_MM;
  const sinThreshold = Math.sin((thresholdDeg * Math.PI) / 180);

  const faceMask = new Uint8Array(triCount);
  let totalArea = 0;
  let overhangArea = 0;
  let bedArea = 0;

  for (let t = 0; t < triCount; t++) {
    const area = triangleArea(positions, t);
    totalArea += area;

    const o = t * 9;
    const onBed =
      positions[o + 2] <= bedCeiling &&
      positions[o + 5] <= bedCeiling &&
      positions[o + 8] <= bedCeiling;
    if (onBed) {
      bedArea += area;
      continue;
    }

    const nz = normals[t * 3 + 2];
    if (-nz > sinThreshold) {
      faceMask[t] = 1;
      overhangArea += area;
    }
  }

  return {
    faceMask,
    overhangAreaFraction: totalArea > 0 ? overhangArea / totalArea : 0,
    bedContactAreaFraction: totalArea > 0 ? bedArea / totalArea : 0,
    thresholdDeg,
  };
}
