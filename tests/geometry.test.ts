import { describe, expect, it } from "vitest";

import { bedFit, PRESETS } from "../src/core/bedfit";
import { overhangReport } from "../src/core/overhang";
import { box, demoModel, soupToMesh } from "../src/core/shapes";
import { computeBounds, computeVolume } from "../src/core/stats";
import { manifoldReport } from "../src/core/topology";
import { thinReport } from "../src/core/thin";

const cube = soupToMesh(box(0, 0, 5, 10, 10, 10));

describe("stats", () => {
  it("unit-ish cube volume is exact", () => {
    expect(computeVolume(cube.positions, cube.triCount)).toBeCloseTo(1000, 5);
  });

  it("bounds are tight", () => {
    const bounds = computeBounds(cube.positions);
    expect(bounds.size).toEqual([10, 10, 10]);
    expect(bounds.min[2]).toBe(0);
  });
});

describe("manifold", () => {
  it("closed cube is watertight", () => {
    const report = manifoldReport(cube.positions, cube.triCount);
    expect(report.watertight).toBe(true);
    expect(report.boundaryEdgeCount).toBe(0);
    expect(report.nonManifoldEdgeCount).toBe(0);
  });

  it("removing one face leaves a 4-edge hole", () => {
    // drop the last 2 triangles (one cube face)
    const open = soupToMesh([...box(0, 0, 5, 10, 10, 10)].slice(0, 10 * 9));
    const report = manifoldReport(open.positions, open.triCount);
    expect(report.watertight).toBe(false);
    expect(report.boundaryEdgeCount).toBe(4);
    expect(report.boundarySegments.length).toBe(4 * 6);
  });

  it("an extra dangling triangle makes a non-manifold edge", () => {
    const coords = [...box(0, 0, 5, 10, 10, 10)];
    // a triangle hanging off the cube's bottom-front edge
    coords.push(-5, -5, 0, 5, -5, 0, 0, -12, -4);
    const mesh = soupToMesh(coords);
    const report = manifoldReport(mesh.positions, mesh.triCount);
    expect(report.nonManifoldEdgeCount).toBe(1);
    expect(report.watertight).toBe(false);
  });

  it("two separate closed shells stay watertight", () => {
    const mesh = soupToMesh([
      ...box(0, 0, 5, 10, 10, 10),
      ...box(30, 0, 5, 10, 10, 10),
    ]);
    expect(manifoldReport(mesh.positions, mesh.triCount).watertight).toBe(true);
  });
});

describe("overhang", () => {
  it("a plain cube has no overhang: bottom is bed contact", () => {
    const report = overhangReport(cube.positions, cube.normals, cube.triCount);
    expect(report.overhangAreaFraction).toBe(0);
    expect(report.bedContactAreaFraction).toBeGreaterThan(0);
  });

  it("a floating slab's underside is all overhang", () => {
    const table = demoModel();
    const report = overhangReport(table.positions, table.normals, table.triCount);
    expect(report.overhangAreaFraction).toBeGreaterThan(0.05);
    // masked faces must exist and face downward
    let masked = 0;
    for (let t = 0; t < table.triCount; t++) {
      if (report.faceMask[t]) {
        masked++;
        expect(table.normals[t * 3 + 2]).toBeLessThan(0);
      }
    }
    expect(masked).toBeGreaterThan(0);
  });

  it("threshold slider changes the verdict for a 60 degree face", () => {
    // a face whose normal is (sin60, 0, -cos... built directly: normal
    // (0.5, 0, -0.866), i.e. a surface 60 degrees from vertical facing
    // down. Overhang at threshold 45, acceptable at threshold 70. A base
    // triangle at z=0 keeps the ramp away from the bed-contact band.
    const ramp = soupToMesh([
      0, 0, 0, 1, 0, 0, 0, 1, 0, // bed helper
      0, 0, 10,
      0, 1, 10,
      0.866, 0, 10.5,
    ]);
    const at45 = overhangReport(ramp.positions, ramp.normals, ramp.triCount, 45);
    const at70 = overhangReport(ramp.positions, ramp.normals, ramp.triCount, 70);
    expect(at45.overhangAreaFraction).toBeGreaterThan(0);
    expect(at70.overhangAreaFraction).toBe(0);
  });
});

describe("thin features", () => {
  it("a 0.6 mm fin is caught, a 10 mm cube is not", () => {
    const fin = soupToMesh(box(0, 0, 6, 0.6, 18, 12));
    const finReport = thinReport(fin.positions, fin.normals, fin.triCount);
    expect(finReport.thinSampleHits).toBeGreaterThan(0);

    const chunky = thinReport(cube.positions, cube.normals, cube.triCount);
    expect(chunky.thinSampleHits).toBe(0);
  });

  it("threshold controls the verdict", () => {
    const wall = soupToMesh(box(0, 0, 6, 1.5, 18, 12));
    const strict = thinReport(wall.positions, wall.normals, wall.triCount, 2.0);
    const loose = thinReport(wall.positions, wall.normals, wall.triCount, 0.8);
    expect(strict.thinSampleHits).toBeGreaterThan(0);
    expect(loose.thinSampleHits).toBe(0);
  });

  it("the demo model's fin trips the check", () => {
    const table = demoModel();
    const report = thinReport(table.positions, table.normals, table.triCount);
    expect(report.thinSampleHits).toBeGreaterThan(0);
  });
});

describe("bed fit", () => {
  const mini = PRESETS[0];

  it("small part fits", () => {
    expect(bedFit(computeBounds(cube.positions), mini).fits).toBe(true);
  });

  it("overflow names the axis and the amount", () => {
    const tall = soupToMesh(box(0, 0, 100, 10, 10, 200));
    const report = bedFit(computeBounds(tall.positions), mini);
    expect(report.fits).toBe(false);
    expect(report.overflow[2]).toBeCloseTo(20);
    expect(report.overflow[0]).toBe(0);
  });

  it("a long flat part fits by swapping footprint axes", () => {
    const plank = soupToMesh(box(0, 0, 5, 170, 200, 10));
    // 170x200 fails neither way on a 180x180 bed? width 200 > 180: straight
    // fails on depth; swapped (200x170) fails on width. It truly does not fit.
    expect(bedFit(computeBounds(plank.positions), mini).fits).toBe(false);
    // but 170x179 fits as-is and 179x170 fits swapped
    const ok = soupToMesh(box(0, 0, 5, 179, 170, 10));
    expect(bedFit(computeBounds(ok.positions), mini).fits).toBe(true);
    const swapped = soupToMesh(box(0, 0, 5, 170, 179, 10));
    expect(bedFit(computeBounds(swapped.positions), mini).fits).toBe(true);
  });
});
