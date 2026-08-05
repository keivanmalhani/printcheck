/** STL parsing: binary and ASCII autodetect, own implementation so the
 * geometry core stays dependency-free and unit-testable.
 *
 * Normals are always recomputed from vertex winding. Exporters routinely
 * write zero or garbage normal vectors, and every analysis downstream
 * (overhangs above all) depends on them being right. */

import type { ParsedMesh } from "./types";

export const MAX_TRIANGLES = 2_000_000;

export class StlParseError extends Error {}

export function parseSTL(buffer: ArrayBuffer): ParsedMesh {
  if (buffer.byteLength < 15) {
    throw new StlParseError("File is too small to be an STL.");
  }
  return looksBinary(buffer) ? parseBinary(buffer) : parseAscii(buffer);
}

/** A file is binary when its declared triangle count matches its length.
 * "solid" prefixes lie in both directions, so the length test decides. */
function looksBinary(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 84) return false;
  const view = new DataView(buffer);
  const declared = view.getUint32(80, true);
  return buffer.byteLength === 84 + declared * 50;
}

function parseBinary(buffer: ArrayBuffer): ParsedMesh {
  const view = new DataView(buffer);
  const triCount = view.getUint32(80, true);
  if (triCount === 0) throw new StlParseError("STL contains zero triangles.");
  if (triCount > MAX_TRIANGLES) {
    throw new StlParseError(
      `STL has ${triCount.toLocaleString()} triangles; the cap is ` +
        `${MAX_TRIANGLES.toLocaleString()}. Decimate it first.`,
    );
  }

  const positions = new Float32Array(triCount * 9);
  let offset = 84;
  for (let t = 0; t < triCount; t++) {
    offset += 12; // skip the stored normal
    for (let f = 0; f < 9; f++) {
      positions[t * 9 + f] = view.getFloat32(offset, true);
      offset += 4;
    }
    offset += 2; // attribute byte count
  }
  return finish(positions, triCount, "binary");
}

const ASCII_VERTEX = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;

function parseAscii(buffer: ArrayBuffer): ParsedMesh {
  const text = new TextDecoder().decode(buffer);
  if (!/^\s*solid/.test(text)) {
    throw new StlParseError("Not an STL: no binary header match and no 'solid' keyword.");
  }
  const coords: number[] = [];
  for (const match of text.matchAll(ASCII_VERTEX)) {
    coords.push(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  if (coords.length === 0 || coords.length % 9 !== 0) {
    throw new StlParseError(
      "ASCII STL vertex count is not a multiple of three; file is corrupt.",
    );
  }
  const triCount = coords.length / 9;
  if (triCount > MAX_TRIANGLES) {
    throw new StlParseError(
      `STL has ${triCount.toLocaleString()} triangles; the cap is ` +
        `${MAX_TRIANGLES.toLocaleString()}. Decimate it first.`,
    );
  }
  return finish(new Float32Array(coords), triCount, "ascii");
}

function finish(
  positions: Float32Array,
  triCount: number,
  format: "binary" | "ascii",
): ParsedMesh {
  for (const value of positions) {
    if (!Number.isFinite(value)) {
      throw new StlParseError("STL contains non-finite vertex coordinates.");
    }
  }
  return { positions, normals: computeNormals(positions, triCount), triCount, format };
}

export function computeNormals(positions: Float32Array, triCount: number): Float32Array {
  const normals = new Float32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const ux = positions[o + 3] - positions[o];
    const uy = positions[o + 4] - positions[o + 1];
    const uz = positions[o + 5] - positions[o + 2];
    const vx = positions[o + 6] - positions[o];
    const vy = positions[o + 7] - positions[o + 1];
    const vz = positions[o + 8] - positions[o + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }
    normals[t * 3] = nx;
    normals[t * 3 + 1] = ny;
    normals[t * 3 + 2] = nz;
  }
  return normals;
}
