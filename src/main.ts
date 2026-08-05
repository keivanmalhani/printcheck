import "./style.css";

import { analyze, remesh } from "./core/analyze";
import { PRESETS } from "./core/bedfit";
import { applyRotation } from "./core/orient";
import { StlParseError, parseSTL } from "./core/parse";
import { demoModel } from "./core/shapes";
import type { ParsedMesh, PrinterPreset } from "./core/types";
import { renderOrientations, renderStats, renderVerdicts, toast } from "./ui";
import { Viewer } from "./viewer";

const viewport = document.getElementById("viewport")!;
const viewer = new Viewer(viewport);

interface State {
  mesh: ParsedMesh | null;
  preset: PrinterPreset;
  overhangDeg: number;
  thinMm: number;
}

const state: State = {
  mesh: null,
  preset: PRESETS[1],
  overhangDeg: 45,
  thinMm: 0.8,
};

// --- controls -------------------------------------------------------------

const presetSelect = document.getElementById("preset") as HTMLSelectElement;
for (const preset of PRESETS) {
  const option = document.createElement("option");
  option.value = preset.id;
  option.textContent = preset.label;
  presetSelect.appendChild(option);
}
presetSelect.value = state.preset.id;
presetSelect.addEventListener("change", () => {
  state.preset = PRESETS.find((p) => p.id === presetSelect.value) ?? PRESETS[1];
  viewer.setPreset(state.preset);
  rerun();
});

const overhangSlider = document.getElementById("overhang") as HTMLInputElement;
const overhangValue = document.getElementById("overhang-value")!;
overhangSlider.addEventListener("input", () => {
  state.overhangDeg = Number(overhangSlider.value);
  overhangValue.textContent = overhangSlider.value;
  rerunDebounced();
});

const thinSlider = document.getElementById("thin") as HTMLInputElement;
const thinValue = document.getElementById("thin-value")!;
thinSlider.addEventListener("input", () => {
  state.thinMm = Number(thinSlider.value);
  thinValue.textContent = state.thinMm.toFixed(1);
  rerunDebounced();
});

document.getElementById("demo-btn")!.addEventListener("click", () => {
  loadMesh(demoModel());
});

const fileInput = document.getElementById("file-input") as HTMLInputElement;
document.getElementById("file-btn")!.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void loadFile(file);
  fileInput.value = "";
});

// --- drag and drop --------------------------------------------------------

const overlay = document.getElementById("drop-overlay")!;
let dragDepth = 0;

window.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth++;
  overlay.hidden = false;
});
window.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) overlay.hidden = true;
});
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  overlay.hidden = true;
  const file = event.dataTransfer?.files?.[0];
  if (file) void loadFile(file);
});

// --- pipeline -------------------------------------------------------------

async function loadFile(file: File): Promise<void> {
  try {
    const mesh = parseSTL(await file.arrayBuffer());
    loadMesh(mesh);
  } catch (error) {
    toast(
      error instanceof StlParseError
        ? error.message
        : "Could not read that file as an STL.",
    );
  }
}

function loadMesh(mesh: ParsedMesh): void {
  state.mesh = mesh;
  viewer.setMesh(mesh);
  rerun();
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function rerunDebounced(): void {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(rerun, 160);
}

function rerun(): void {
  if (!state.mesh) return;
  const analysis = analyze(state.mesh, state.preset, {
    overhangDeg: state.overhangDeg,
    thinMm: state.thinMm,
  });

  viewer.colorize(analysis);

  document.getElementById("empty-state")!.hidden = true;
  const results = document.getElementById("results")!;
  results.hidden = false;
  document.getElementById("verdicts")!.innerHTML = renderVerdicts(analysis);
  document.getElementById("stats")!.innerHTML = renderStats(analysis);
  renderOrientations(
    analysis.orientations,
    document.getElementById("orientations")!,
    (option) => {
      if (!state.mesh) return;
      loadMesh(remesh(applyRotation(state.mesh.positions, option.matrix), state.mesh.format));
    },
  );
}

viewer.setPreset(state.preset);
