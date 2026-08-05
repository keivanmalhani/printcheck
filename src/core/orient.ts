/** Orientation advisor: score the 24 axis-aligned orientations.
 *
 * The score is overhang area under that rotation, with bed fit as a
 * hard constraint and a lower center of mass as the tie-break. Only
 * signed-permutation rotations are tried: they cover the flips a person
 * actually applies in a slicer, they keep bounds math exact (a rotated
 * AABB is a permuted AABB), and anything finer is slicer territory. */

import { bedFit } from "./bedfit";
import { triangleArea } from "./stats";
import type { Bounds, OrientationOption, PrinterPreset } from "./types";
import { BED_TOLERANCE_MM } from "./overhang";

const AXES: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** All 24 proper rotations built from signed axis permutations, as
 * row-major 3x3 matrices (rows are the world axes in model space). */
export function rotationMatrices(): number[][] {
  const matrices: number[][] = [];
  for (const x of AXES) {
    for (const y of AXES) {
      if (Math.abs(x[0] * y[0] + x[1] * y[1] + x[2] * y[2]) > 0) continue;
      const z = cross(x, y);
      matrices.push([...x, ...y, ...z]);
    }
  }
  return matrices;
}

const DOWN_LABEL: Record<string, string> = {
  "z-": "as loaded",
  "z+": "upside down",
  "x+": "on its right side",
  "x-": "on its left side",
  "y+": "on its front",
  "y-": "on its back",
};

/** Which model axis points down (world -z) under a rotation.
 *
 * zRow[i] is how much model axis +i contributes to world z. Positive
 * means model -i faces down (identity: zRow=[0,0,1], model -z down,
 * "as loaded"); negative means model +i faces down. */
function downAxis(matrix: number[]): string {
  const zRow = [matrix[6], matrix[7], matrix[8]];
  let bestAxis = "z";
  let bestValue = 0;
  ["x", "y", "z"].forEach((axis, i) => {
    if (Math.abs(zRow[i]) > Math.abs(bestValue)) {
      bestValue = zRow[i];
      bestAxis = axis;
    }
  });
  return bestAxis + (bestValue < 0 ? "+" : "-");
}

function rotatedSize(matrix: number[], bounds: Bounds): [number, number, number] {
  const size = bounds.size;
  const pick = (row: number) => {
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(matrix[row * 3 + axis]) > 0.5) return size[axis];
    }
    return 0;
  };
  return [pick(0), pick(1), pick(2)];
}

export function orientationOptions(
  positions: Float32Array,
  normals: Float32Array,
  triCount: number,
  bounds: Bounds,
  preset: PrinterPreset,
  thresholdDeg: number,
  currentFraction: number,
): OrientationOption[] {
  const sinThreshold = Math.sin((thresholdDeg * Math.PI) / 180);
  const stride = Math.max(1, Math.ceil(triCount / 200_000));

  const options: OrientationOption[] = [];
  for (const matrix of rotationMatrices()) {
    const zRow = [matrix[6], matrix[7], matrix[8]];

    // Transformed z of a point is zRow . p; bed level is its minimum.
    let minZ = Infinity;
    for (let o = 0; o < positions.length; o += 3) {
      const z = zRow[0] * positions[o] + zRow[1] * positions[o + 1] + zRow[2] * positions[o + 2];
      if (z < minZ) minZ = z;
    }
    const bedCeiling = minZ + BED_TOLERANCE_MM;

    let total = 0;
    let overhang = 0;
    for (let t = 0; t < triCount; t += stride) {
      const area = triangleArea(positions, t);
      total += area;
      const o = t * 9;
      const z0 = zRow[0] * positions[o] + zRow[1] * positions[o + 1] + zRow[2] * positions[o + 2];
      const z1 = zRow[0] * positions[o + 3] + zRow[1] * positions[o + 4] + zRow[2] * positions[o + 5];
      const z2 = zRow[0] * positions[o + 6] + zRow[1] * positions[o + 7] + zRow[2] * positions[o + 8];
      if (z0 <= bedCeiling && z1 <= bedCeiling && z2 <= bedCeiling) continue;
      const n = t * 3;
      const nz = zRow[0] * normals[n] + zRow[1] * normals[n + 1] + zRow[2] * normals[n + 2];
      if (-nz > sinThreshold) overhang += area;
    }
    const fraction = total > 0 ? overhang / total : 0;

    const size = rotatedSize(matrix, bounds);
    const fits = bedFit({ min: [0, 0, 0], max: size, size }, preset).fits;

    options.push({
      matrix,
      label: DOWN_LABEL[downAxis(matrix)] ?? "rotated",
      overhangAreaFraction: fraction,
      fits,
      deltaFraction: fraction - currentFraction,
    });
  }

  // One best option per down-axis family, best three families first,
  // fitting orientations always ahead of non-fitting ones.
  const byLabel = new Map<string, OrientationOption>();
  for (const option of options) {
    const existing = byLabel.get(option.label);
    if (
      !existing ||
      (option.fits && !existing.fits) ||
      (option.fits === existing.fits &&
        option.overhangAreaFraction < existing.overhangAreaFraction)
    ) {
      byLabel.set(option.label, option);
    }
  }
  return [...byLabel.values()]
    .sort(
      (a, b) =>
        Number(b.fits) - Number(a.fits) ||
        a.overhangAreaFraction - b.overhangAreaFraction,
    )
    .slice(0, 3);
}

/** Apply a signed-permutation rotation, returning new positions. */
export function applyRotation(positions: Float32Array, matrix: number[]): Float32Array {
  const out = new Float32Array(positions.length);
  for (let o = 0; o < positions.length; o += 3) {
    const x = positions[o], y = positions[o + 1], z = positions[o + 2];
    out[o] = matrix[0] * x + matrix[1] * y + matrix[2] * z;
    out[o + 1] = matrix[3] * x + matrix[4] * y + matrix[5] * z;
    out[o + 2] = matrix[6] * x + matrix[7] * y + matrix[8] * z;
  }
  return out;
}
