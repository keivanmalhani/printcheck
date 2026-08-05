import { describe, expect, it } from "vitest";

import { PRESETS } from "../src/core/bedfit";
import { applyRotation, orientationOptions, rotationMatrices } from "../src/core/orient";
import { overhangReport } from "../src/core/overhang";
import { computeNormals } from "../src/core/parse";
import { demoModel, soupToMesh, box } from "../src/core/shapes";
import { computeBounds, computeVolume } from "../src/core/stats";

describe("rotation matrices", () => {
  it("there are exactly 24, all distinct", () => {
    const matrices = rotationMatrices();
    expect(matrices.length).toBe(24);
    expect(new Set(matrices.map((m) => m.join(","))).size).toBe(24);
  });

  it("every one preserves volume", () => {
    const cube = soupToMesh(box(1, 2, 3, 4, 6, 8));
    const reference = computeVolume(cube.positions, cube.triCount);
    for (const matrix of rotationMatrices()) {
      const rotated = applyRotation(cube.positions, matrix);
      expect(computeVolume(rotated, cube.triCount)).toBeCloseTo(reference, 3);
    }
  });
});

describe("orientation advisor", () => {
  it("suggests flipping the table upside down", () => {
    const table = demoModel();
    const bounds = computeBounds(table.positions);
    const current = overhangReport(table.positions, table.normals, table.triCount);
    const options = orientationOptions(
      table.positions,
      table.normals,
      table.triCount,
      bounds,
      PRESETS[1],
      45,
      current.overhangAreaFraction,
    );
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThanOrEqual(3);
    const best = options[0];
    expect(best.label).toBe("upside down");
    expect(best.overhangAreaFraction).toBeLessThan(current.overhangAreaFraction);
    expect(best.deltaFraction).toBeLessThan(0);
  });

  it("applying the suggested rotation really reduces overhang", () => {
    const table = demoModel();
    const bounds = computeBounds(table.positions);
    const current = overhangReport(table.positions, table.normals, table.triCount);
    const best = orientationOptions(
      table.positions, table.normals, table.triCount,
      bounds, PRESETS[1], 45, current.overhangAreaFraction,
    )[0];

    const rotated = applyRotation(table.positions, best.matrix);
    const normals = computeNormals(rotated, table.triCount);
    const after = overhangReport(rotated, normals, table.triCount);
    expect(after.overhangAreaFraction).toBeLessThan(current.overhangAreaFraction);
    expect(after.overhangAreaFraction).toBeCloseTo(best.overhangAreaFraction, 2);
  });

  it("non-fitting orientations sort behind fitting ones", () => {
    // a plank that only fits lying down
    const plank = soupToMesh(box(0, 0, 5, 179, 100, 10));
    const bounds = computeBounds(plank.positions);
    const options = orientationOptions(
      plank.positions, plank.normals, plank.triCount,
      bounds, PRESETS[0], 45, 0,
    );
    expect(options[0].fits).toBe(true);
  });
});
