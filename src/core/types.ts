/** Shared geometry-core types. Zero Three.js imports anywhere in core/. */

/** Triangle soup straight from the parser. positions is 9 floats per
 * triangle (three xyz vertices); normals is one xyz per triangle,
 * recomputed from winding, never trusted from the file. */
export interface ParsedMesh {
  positions: Float32Array;
  normals: Float32Array;
  triCount: number;
  format: "binary" | "ascii";
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
}

export interface ManifoldReport {
  watertight: boolean;
  boundaryEdgeCount: number;
  nonManifoldEdgeCount: number;
  /** Flattened xyz pairs (start,end per edge) for rendering hole outlines. */
  boundarySegments: Float32Array;
}

export interface OverhangReport {
  /** 1 per triangle when the face is a steeper-than-threshold overhang. */
  faceMask: Uint8Array;
  overhangAreaFraction: number;
  bedContactAreaFraction: number;
  thresholdDeg: number;
}

export interface ThinReport {
  /** 1 per triangle when a sampled ray found an opposing wall too close. */
  faceMask: Uint8Array;
  thinSampleHits: number;
  samplesTaken: number;
  thresholdMm: number;
}

export interface PrinterPreset {
  id: string;
  label: string;
  width: number;
  depth: number;
  height: number;
}

export interface BedFitReport {
  fits: boolean;
  /** Per-axis overflow in mm, 0 when that axis fits. [w, d, h] */
  overflow: [number, number, number];
  preset: PrinterPreset;
}

export interface OrientationOption {
  /** Row-major 3x3 rotation matrix of signed axis permutations. */
  matrix: number[];
  label: string;
  overhangAreaFraction: number;
  fits: boolean;
  /** Delta vs the current orientation, negative is better. */
  deltaFraction: number;
}

export interface Stats {
  triCount: number;
  bounds: Bounds;
  /** mm^3; exact for watertight meshes, an estimate otherwise. */
  volume: number;
  /** grams, solid PLA at 1.24 g/cm3. */
  massSolidPla: number;
}

export interface Analysis {
  stats: Stats;
  manifold: ManifoldReport;
  overhang: OverhangReport;
  thin: ThinReport;
  bedFit: BedFitReport;
  orientations: OrientationOption[];
}
