/** Panel rendering: verdict chips, stats, orientation buttons.
 * Plain DOM, no framework, every warning names its fix. */

import type { Analysis, OrientationOption } from "./core/types";

function chip(kind: "pass" | "warn" | "fail", text: string, fix?: string): string {
  const icon = kind === "pass" ? "&#10003;" : kind === "warn" ? "!" : "&#10007;";
  return (
    `<div class="chip ${kind}"><span class="icon">${icon}</span>` +
    `<span>${text}${fix ? `<span class="fix">${fix}</span>` : ""}</span></div>`
  );
}

const pct = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

export function renderVerdicts(analysis: Analysis): string {
  const parts: string[] = [];
  const { manifold, overhang, thin, bedFit } = analysis;

  if (bedFit.fits) {
    parts.push(chip("pass", `fits the ${bedFit.preset.label.split(" (")[0]} build volume`));
  } else {
    const axes = ["wide", "deep", "tall"];
    const over = bedFit.overflow
      .map((mm, i) => (mm > 0 ? `${mm.toFixed(1)} mm too ${axes[i]}` : null))
      .filter(Boolean)
      .join(", ");
    parts.push(
      chip("fail", `does not fit this printer: ${over}`,
        "scale it down, split it, or pick a bigger machine"),
    );
  }

  if (manifold.watertight) {
    parts.push(chip("pass", "watertight, no holes or bad edges"));
  } else {
    const problems: string[] = [];
    if (manifold.boundaryEdgeCount > 0) {
      problems.push(`${manifold.boundaryEdgeCount} open edge${manifold.boundaryEdgeCount === 1 ? "" : "s"}`);
    }
    if (manifold.nonManifoldEdgeCount > 0) {
      problems.push(`${manifold.nonManifoldEdgeCount} non-manifold edge${manifold.nonManifoldEdgeCount === 1 ? "" : "s"}`);
    }
    parts.push(
      chip("fail", `not watertight: ${problems.join(", ")} (cyan lines)`,
        "run it through a mesh repair before slicing"),
    );
  }

  if (overhang.overhangAreaFraction === 0) {
    parts.push(chip("pass", `no overhangs past ${overhang.thresholdDeg}&deg;`));
  } else {
    const kind = overhang.overhangAreaFraction > 0.15 ? "fail" : "warn";
    parts.push(
      chip(kind,
        `${pct(overhang.overhangAreaFraction)} of the surface overhangs past ${overhang.thresholdDeg}&deg; (red)`,
        "reorient it below, add supports, or chamfer the undersides"),
    );
  }

  if (thin.thinSampleHits === 0) {
    parts.push(chip("pass", `no walls under ${thin.thresholdMm} mm found (${thin.samplesTaken} samples)`));
  } else {
    parts.push(
      chip("warn",
        `thin walls under ${thin.thresholdMm} mm found (amber, sampled heuristic)`,
        "thicken them or print with a smaller nozzle"),
    );
  }

  return parts.join("");
}

export function renderStats(analysis: Analysis): string {
  const { stats, manifold } = analysis;
  const [w, d, h] = stats.bounds.size;
  const volumeLabel = manifold.watertight ? "volume" : "volume (estimate)";
  const rows: [string, string][] = [
    ["size", `${w.toFixed(1)} x ${d.toFixed(1)} x ${h.toFixed(1)} mm`],
    ["triangles", stats.triCount.toLocaleString()],
    [volumeLabel, `${(stats.volume / 1000).toFixed(1)} cm&sup3;`],
    ["solid PLA", `${stats.massSolidPla.toFixed(0)} g`],
  ];
  return rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

export function renderOrientations(
  options: OrientationOption[],
  container: HTMLElement,
  onApply: (option: OrientationOption) => void,
): void {
  container.innerHTML = "";
  if (options.length === 0) {
    container.innerHTML = '<p class="quiet">no orientation data</p>';
    return;
  }
  for (const option of options) {
    const button = document.createElement("button");
    button.className = "orient-btn";
    const deltaPct = -option.deltaFraction * 100;
    const identity = option.label === "as loaded" && Math.abs(option.deltaFraction) < 1e-9;
    const deltaText = identity
      ? "current"
      : deltaPct > 0.05
        ? `-${deltaPct.toFixed(1)}% overhang`
        : deltaPct < -0.05
          ? `+${(-deltaPct).toFixed(1)}% overhang`
          : "same overhang";
    const fitNote = option.fits ? "" : " (does not fit!)";
    button.innerHTML =
      `<span>${option.label}${fitNote}</span>` +
      `<span class="delta ${deltaPct > 0.05 ? "better" : "worse"}">${deltaText}</span>`;
    if (identity) button.disabled = true;
    else button.addEventListener("click", () => onApply(option));
    container.appendChild(button);
  }
}

export function toast(message: string): void {
  document.getElementById("toast")?.remove();
  const el = document.createElement("div");
  el.id = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}
