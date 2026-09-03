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

// Boundary cases added 2026-09-02 after mutation testing. All 28 tests passed with
// bedFit's rotation collapsed to `const overflow = straight`, and with overhang's
// `-nz > sinThreshold` widened to `>=`. Both are behaviours the README advertises.
describe("bed fit rotation", () => {
  const mk4 = PRESETS.find((p) => p.id === "prusa-mk4")!;

  it("a 200x240 footprint fits a 250x210 bed only when it is turned", () => {
    // The existing rotation test uses the 180x180 mini preset, where a square bed
    // makes both arrangements identical, so it cannot see the rotation at all.
    // On the MK4S the two arrangements disagree: straight is 30 mm over on depth,
    // turned is inside the plate. Deleting the swap made this part unprintable and
    // the whole suite stayed green.
    const part = soupToMesh(box(0, 0, 25, 200, 240, 50));
    const report = bedFit(computeBounds(part.positions), mk4);
    expect(report.fits).toBe(true);
    expect(report.overflow).toEqual([0, 0, 0]);
  });

  it("the same footprint straight on would be 30 mm over on depth", () => {
    // Pins the number the rotation is saving, so the test above cannot pass just
    // because the bed happens to be big enough.
    const part = soupToMesh(box(0, 0, 25, 200, 240, 50));
    const bounds = computeBounds(part.positions);
    expect(bounds.size[1] - mk4.depth).toBeCloseTo(30);
  });

  it("a part too big both ways still does not fit", () => {
    // The negative half: without it, `fits` could be hardcoded true.
    const part = soupToMesh(box(0, 0, 25, 300, 300, 50));
    const report = bedFit(computeBounds(part.positions), mk4);
    expect(report.fits).toBe(false);
    expect(report.overflow[0]).toBeGreaterThan(0);
    expect(report.overflow[1]).toBeGreaterThan(0);
  });
});

describe("overhang threshold boundary", () => {
  // A surface sitting exactly ON the threshold must stay clean: the docstring says a
  // triangle is an overhang when its angle *exceeds* the threshold. Widening
  // `-nz > sinThreshold` to `>=` left all 28 tests green.
  //
  // The comparison can only decide anything when -nz equals sinThreshold to the bit.
  // Normals are a Float32Array and sinThreshold is a double, so that happens only
  // where sin(threshold) is exactly representable in float32. Sweeping every integer
  // degree from 0 to 90, that is true at 0 (sin = 0) and 90 (sin = 1) and nowhere
  // else - 45 degrees included, where the float32 normal is 0.70710676908493042 and
  // sin(45 deg) is 0.70710678118654746. So these two are the whole boundary.
  const cube10 = soupToMesh(box(0, 0, 5, 10, 10, 10));
  const ceiling = soupToMesh([
    0, 0, 0, 1, 0, 0, 0, 1, 0, // helper on the plate, so the slab is not bed contact
    ...box(0, 0, 40, 20, 20, 10),
  ]);

  it("a vertical wall is not an overhang at threshold 0", () => {
    // threshold 0 is the strictest setting: anything past vertical is an overhang.
    // A wall sitting exactly at vertical (nz === 0) is printable and must stay clean.
    // With `>=` the cube's four sides become 67% overhang.
    const report = overhangReport(cube10.positions, cube10.normals, cube10.triCount, 0);
    expect(report.overhangAreaFraction).toBe(0);
  });

  it("a flat ceiling is not an overhang at threshold 90", () => {
    // threshold 90 is the loosest setting: nothing can be an overhang. A flat
    // down-facing ceiling (nz === -1) sits exactly on it. With `>=` it is flagged.
    const report = overhangReport(ceiling.positions, ceiling.normals, ceiling.triCount, 90);
    expect(report.overhangAreaFraction).toBe(0);
  });

  it("that same ceiling is an overhang at the default 45", () => {
    // The positive control: without it the two tests above are satisfied by a rule
    // that never flags anything.
    const report = overhangReport(ceiling.positions, ceiling.normals, ceiling.triCount, 45);
    expect(report.overhangAreaFraction).toBeGreaterThan(0.2);
  });
});
