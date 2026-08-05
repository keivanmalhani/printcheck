/** Procedural test and demo geometry, plus STL serializers.
 *
 * Everything is triangle soup with outward winding, the same shape the
 * parser produces, so tests and the built-in demo model exercise the
 * exact code paths a dropped file does. */

import { computeNormals } from "./parse";
import type { ParsedMesh } from "./types";

/** Axis-aligned box as 12 outward-wound triangles. */
export function box(
  cx: number, cy: number, cz: number,
  w: number, d: number, h: number,
): number[] {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const y0 = cy - d / 2, y1 = cy + d / 2;
  const z0 = cz - h / 2, z1 = cz + h / 2;
  // prettier-ignore
  return [
    // bottom (z0), normal -z
    x0, y0, z0,  x1, y1, z0,  x1, y0, z0,
    x0, y0, z0,  x0, y1, z0,  x1, y1, z0,
    // top (z1), normal +z
    x0, y0, z1,  x1, y0, z1,  x1, y1, z1,
    x0, y0, z1,  x1, y1, z1,  x0, y1, z1,
    // front (y0), normal -y
    x0, y0, z0,  x1, y0, z0,  x1, y0, z1,
    x0, y0, z0,  x1, y0, z1,  x0, y0, z1,
    // back (y1), normal +y
    x1, y1, z0,  x0, y1, z0,  x0, y1, z1,
    x1, y1, z0,  x0, y1, z1,  x1, y1, z1,
    // left (x0), normal -x
    x0, y1, z0,  x0, y0, z0,  x0, y0, z1,
    x0, y1, z0,  x0, y0, z1,  x0, y1, z1,
    // right (x1), normal +x
    x1, y0, z0,  x1, y1, z0,  x1, y1, z1,
    x1, y0, z0,  x1, y1, z1,  x1, y0, z1,
  ];
}

export function soupToMesh(coords: number[]): ParsedMesh {
  const positions = new Float32Array(coords);
  const triCount = positions.length / 9;
  return {
    positions,
    normals: computeNormals(positions, triCount),
    triCount,
    format: "binary",
  };
}

/** The built-in demo: a little table with a thin fin.
 *
 * - four 4x4x26 legs and a 40x40x4 top: the top's underside spans the
 *   legs, a textbook unsupported overhang
 * - one 0.6 mm fin standing on the bed: trips the thin-wall heuristic
 * - every box is a closed shell, so the mesh reads watertight
 */
export function demoModel(): ParsedMesh {
  const coords: number[] = [];
  const legInset = 4;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      coords.push(
        ...box(sx * (20 - legInset), sy * (20 - legInset), 13, 4, 4, 26),
      );
    }
  }
  coords.push(...box(0, 0, 28, 40, 40, 4)); // top slab
  coords.push(...box(23, 0, 6, 0.6, 18, 12)); // thin fin
  return soupToMesh(coords);
}

export function toBinarySTL(positions: Float32Array): ArrayBuffer {
  const triCount = positions.length / 9;
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triCount, true);
  let offset = 84;
  for (let t = 0; t < triCount; t++) {
    offset += 12; // zero normal, parsers must recompute anyway
    for (let f = 0; f < 9; f++) {
      view.setFloat32(offset, positions[t * 9 + f], true);
      offset += 4;
    }
    offset += 2;
  }
  return buffer;
}

export function toAsciiSTL(positions: Float32Array, name = "shape"): string {
  const lines = [`solid ${name}`];
  for (let t = 0; t < positions.length / 9; t++) {
    const o = t * 9;
    lines.push("  facet normal 0 0 0", "    outer loop");
    for (let v = 0; v < 3; v++) {
      lines.push(
        `      vertex ${positions[o + v * 3]} ${positions[o + v * 3 + 1]} ${positions[o + v * 3 + 2]}`,
      );
    }
    lines.push("    endloop", "  endfacet");
  }
  lines.push(`endsolid ${name}`);
  return lines.join("\n");
}
