/** Printer presets and the bed fit check.
 *
 * A part can always spin freely on the plate, so footprint W and D are
 * interchangeable: the fit test tries both arrangements and reports the
 * better one. Preset dimensions are editable defaults, not gospel. */

import type { BedFitReport, Bounds, PrinterPreset } from "./types";

export const PRESETS: PrinterPreset[] = [
  { id: "bambu-a1-mini", label: "Bambu A1 mini (180x180x180)", width: 180, depth: 180, height: 180 },
  { id: "bambu-256", label: "Bambu A1 / P1 / X1 (256x256x256)", width: 256, depth: 256, height: 256 },
  { id: "prusa-mk4", label: "Prusa MK4S (250x210x220)", width: 250, depth: 210, height: 220 },
  { id: "ender-3", label: "Ender 3 (220x220x250)", width: 220, depth: 220, height: 250 },
];

export function bedFit(bounds: Bounds, preset: PrinterPreset): BedFitReport {
  const [w, d, h] = bounds.size;

  const straight: [number, number, number] = [
    Math.max(0, w - preset.width),
    Math.max(0, d - preset.depth),
    Math.max(0, h - preset.height),
  ];
  const swapped: [number, number, number] = [
    Math.max(0, d - preset.width),
    Math.max(0, w - preset.depth),
    Math.max(0, h - preset.height),
  ];
  const total = (v: [number, number, number]) => v[0] + v[1] + v[2];
  const overflow = total(swapped) < total(straight) ? swapped : straight;

  return { fits: total(overflow) === 0, overflow, preset };
}
