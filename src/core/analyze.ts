/** One call that runs every analysis pass over a parsed mesh. */

import { bedFit } from "./bedfit";
import { orientationOptions } from "./orient";
import { DEFAULT_OVERHANG_DEG, overhangReport } from "./overhang";
import { computeNormals } from "./parse";
import { computeStats } from "./stats";
import { DEFAULT_THIN_MM, thinReport } from "./thin";
import { manifoldReport } from "./topology";
import type { Analysis, ParsedMesh, PrinterPreset } from "./types";

export interface AnalyzeOptions {
  overhangDeg?: number;
  thinMm?: number;
}

export function analyze(
  mesh: ParsedMesh,
  preset: PrinterPreset,
  options: AnalyzeOptions = {},
): Analysis {
  const overhangDeg = options.overhangDeg ?? DEFAULT_OVERHANG_DEG;
  const thinMm = options.thinMm ?? DEFAULT_THIN_MM;

  const stats = computeStats(mesh.positions, mesh.triCount);
  const manifold = manifoldReport(mesh.positions, mesh.triCount);
  const overhang = overhangReport(mesh.positions, mesh.normals, mesh.triCount, overhangDeg);
  const thin = thinReport(mesh.positions, mesh.normals, mesh.triCount, thinMm);
  const fit = bedFit(stats.bounds, preset);
  const orientations = orientationOptions(
    mesh.positions,
    mesh.normals,
    mesh.triCount,
    stats.bounds,
    preset,
    overhangDeg,
    overhang.overhangAreaFraction,
  );

  return { stats, manifold, overhang, thin, bedFit: fit, orientations };
}

/** Rebuild a mesh around new positions (after a rotation). */
export function remesh(positions: Float32Array, format: ParsedMesh["format"]): ParsedMesh {
  const triCount = positions.length / 9;
  return { positions, normals: computeNormals(positions, triCount), triCount, format };
}
