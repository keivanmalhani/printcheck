/** Three.js viewer: renders the mesh with per-face verdict colors, hole
 * outlines, and the printer's build volume. All analysis colors come in
 * as masks from the core; this file never computes geometry verdicts. */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Analysis, ParsedMesh, PrinterPreset } from "./core/types";

const BASE = new THREE.Color("#7f8ea6");
const OVERHANG = new THREE.Color("#ff5544");
const THIN = new THREE.Color("#ffaa22");

export class Viewer {
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private model: THREE.Mesh | null = null;
  private holes: THREE.LineSegments | null = null;
  private volume: THREE.LineSegments | null = null;
  private bed: THREE.GridHelper | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene.background = new THREE.Color("#0f1218");
    this.scene.fog = new THREE.Fog("#0f1218", 900, 2400);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    this.camera.up.set(0, 0, 1); // z-up, the printing convention

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    const hemi = new THREE.HemisphereLight("#cfd8e8", "#20242e", 1.1);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight("#ffffff", 1.4);
    key.position.set(180, -220, 320);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight("#8899bb", 0.5);
    fill.position.set(-200, 160, 120);
    this.scene.add(fill);

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.animate();
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.container;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  setPreset(preset: PrinterPreset): void {
    if (this.bed) this.scene.remove(this.bed);
    if (this.volume) this.scene.remove(this.volume);

    const bedSize = Math.max(preset.width, preset.depth);
    this.bed = new THREE.GridHelper(bedSize, Math.round(bedSize / 10), "#2a3345", "#1b2230");
    this.bed.rotation.x = Math.PI / 2; // grid is xy at z=0 in z-up world
    this.scene.add(this.bed);

    const volumeGeometry = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(preset.width, preset.depth, preset.height),
    );
    this.volume = new THREE.LineSegments(
      volumeGeometry,
      new THREE.LineBasicMaterial({ color: "#26405a", transparent: true, opacity: 0.9 }),
    );
    this.volume.position.set(0, 0, preset.height / 2);
    this.scene.add(this.volume);
  }

  /** Replace the displayed mesh. Colors arrive via colorize(). */
  setMesh(mesh: ParsedMesh): void {
    this.clearModel();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(mesh.positions.length), 3),
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.05,
      flatShading: true,
    });
    this.model = new THREE.Mesh(geometry, material);

    // Sit the model on the plate, centered.
    const box = geometry.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    this.model.position.set(-center.x, -center.y, -box.min.z);
    this.scene.add(this.model);

    this.frame(box);
  }

  private frame(box: THREE.Box3): void {
    const size = new THREE.Vector3();
    box.getSize(size);
    const radius = Math.max(size.x, size.y, size.z, 20);
    // A low vantage looking slightly up, so undersides (where overhangs
    // live) are visible on first load instead of hidden by the model.
    this.camera.position.set(radius * 1.8, -radius * 1.9, radius * 0.28);
    this.controls.target.set(0, 0, size.z * 0.55);
    this.controls.update();
  }

  /** Paint per-face verdicts. thin wins over overhang for visibility. */
  colorize(analysis: Analysis): void {
    if (!this.model) return;
    const colors = this.model.geometry.getAttribute("color") as THREE.BufferAttribute;
    const triCount = colors.count / 3;
    for (let t = 0; t < triCount; t++) {
      const color = analysis.thin.faceMask[t]
        ? THIN
        : analysis.overhang.faceMask[t]
          ? OVERHANG
          : BASE;
      for (let v = 0; v < 3; v++) {
        colors.setXYZ(t * 3 + v, color.r, color.g, color.b);
      }
    }
    colors.needsUpdate = true;

    if (this.holes) {
      this.scene.remove(this.holes);
      this.holes = null;
    }
    if (analysis.manifold.boundarySegments.length > 0 && this.model) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(analysis.manifold.boundarySegments, 3),
      );
      this.holes = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color: "#37d0e6" }),
      );
      this.holes.position.copy(this.model.position);
      this.scene.add(this.holes);
    }
  }

  private clearModel(): void {
    if (this.model) {
      this.scene.remove(this.model);
      this.model.geometry.dispose();
      (this.model.material as THREE.Material).dispose();
      this.model = null;
    }
    if (this.holes) {
      this.scene.remove(this.holes);
      this.holes = null;
    }
  }
}
