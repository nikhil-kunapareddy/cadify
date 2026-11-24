/**
 * Imperative Three.js engine for the model viewport. Kept separate from
 * React so rendering runs on demand (only when the camera or scene changes)
 * and resources are disposed deterministically.
 *
 * Conventions: CAD Z-up. The model is centered in X/Y and rests on Z = 0.
 */
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  OrthographicCamera,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
  type Material,
  type Sphere,
  type Texture,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { MeshData } from "./stlWorker";

export type ViewPreset = "iso" | "front" | "back" | "top" | "bottom" | "right" | "left";
export type DisplayMode = "shaded-edges" | "shaded" | "wireframe";
export type Projection = "perspective" | "orthographic";

export interface ViewerAppearance {
  background: string;
  dark: boolean;
}

export interface ViewerSettings {
  grid: boolean;
  axes: boolean;
  display: DisplayMode;
  projection: Projection;
}

const UP = new Vector3(0, 0, 1);
const FOV = 32;
const GIZMO_SIZE = 84;

const PRESET_DIRECTIONS: Record<ViewPreset, Vector3> = {
  iso: new Vector3(1, -1, 0.82).normalize(),
  front: new Vector3(0, -1, 0),
  back: new Vector3(0, 1, 0),
  right: new Vector3(1, 0, 0),
  left: new Vector3(-1, 0, 0),
  // Tiny offsets keep the camera off the up-axis singularity.
  top: new Vector3(0, -1e-4, 1).normalize(),
  bottom: new Vector3(0, -1e-4, -1).normalize(),
};

const AXIS_COLORS = { x: 0xe5534b, y: 0x57ab5a, z: 0x539bf5 };

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * pow;
}

function labelSprite(text: string, color: number): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "600 38px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.fillText(text, 32, 34);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(0.42, 0.42, 1);
  return sprite;
}

interface CameraTween {
  from: { pos: Vector3; target: Vector3; zoom: number };
  to: { pos: Vector3; target: Vector3; zoom: number };
  start: number;
  duration: number;
}

export class ViewerEngine {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly persp = new PerspectiveCamera(FOV, 1, 0.1, 10_000);
  private readonly ortho = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10_000);
  private camera: PerspectiveCamera | OrthographicCamera = this.persp;
  private readonly controls: OrbitControls;
  private readonly pmrem: PMREMGenerator;
  private readonly envTexture: Texture;

  private readonly modelGroup = new Group();
  private mesh: Mesh | null = null;
  private edges: LineSegments | null = null;
  private readonly shadedMaterial = new MeshStandardMaterial({
    color: 0xbfc3ca,
    metalness: 0.22,
    roughness: 0.46,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  private readonly wireMaterial = new MeshBasicMaterial({ color: 0x9aa3b2, wireframe: true, transparent: true, opacity: 0.55 });
  private readonly edgeMaterial = new LineBasicMaterial({ color: 0x0b0c0f, transparent: true, opacity: 0.8 });
  private grid: Group | null = null;
  private axes: Group | null = null;

  private readonly gizmoScene = new Scene();
  private readonly gizmoCamera = new OrthographicCamera(-1.6, 1.6, 1.6, -1.6, 0.1, 10);

  private radius = 50;
  private settings: ViewerSettings = { grid: true, axes: true, display: "shaded-edges", projection: "perspective" };
  private appearance: ViewerAppearance = { background: "#15161a", dark: true };
  private needsRender = true;
  private frame = 0;
  private tween: CameraTween | null = null;
  private disposed = false;
  private readonly resizeObserver: ResizeObserver;

  onContextLost?: () => void;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.autoClear = false;
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.outline = "none";
    container.appendChild(this.canvas);

    this.canvas.addEventListener("webglcontextlost", this.handleContextLost);

    this.pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envTexture = this.pmrem.fromScene(room, 0.04).texture;
    room.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      (m.material as Material | undefined)?.dispose?.();
    });
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.85;

    const key = new DirectionalLight(0xffffff, 1.15);
    key.position.set(2, -3, 4);
    const fill = new DirectionalLight(0xdfe7ff, 0.35);
    fill.position.set(-3, 2, 1.5);
    this.scene.add(key, fill, new AmbientLight(0xffffff, 0.12));
    this.scene.add(this.modelGroup);

    for (const cam of [this.persp, this.ortho]) cam.up.copy(UP);
    this.persp.position.set(150, -150, 120);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.14;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;
    this.controls.rotateSpeed = 0.9;
    this.controls.addEventListener("change", this.requestRender);
    this.controls.addEventListener("start", () => {
      this.tween = null;
    });

    this.buildGizmo();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  // ------------------------------------------------------------ public API

  setAppearance(appearance: ViewerAppearance): void {
    this.appearance = appearance;
    this.scene.background = new Color(appearance.background);
    this.edgeMaterial.color.set(appearance.dark ? 0x07080a : 0x23262d);
    this.edgeMaterial.opacity = appearance.dark ? 0.85 : 0.7;
    this.wireMaterial.color.set(appearance.dark ? 0xa9b1bf : 0x4a5160);
    this.rebuildGrid();
    this.requestRender();
  }

  setSettings(next: Partial<ViewerSettings>): void {
    const prev = this.settings;
    this.settings = { ...prev, ...next };
    if (next.projection && next.projection !== prev.projection) this.switchProjection(next.projection);
    this.applyDisplay();
    if (this.grid) this.grid.visible = this.settings.grid;
    if (this.axes) this.axes.visible = this.settings.axes;
    this.requestRender();
  }

  setMesh(data: MeshData | null): void {
    this.clearMesh();
    if (!data) {
      this.requestRender();
      return;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(data.normals, 3));

    const [minX, minY, minZ] = data.min;
    const [maxX, maxY, maxZ] = data.max;
    // Center in X/Y and rest on Z = 0 via the group transform, leaving the
    // (cached, shareable) vertex arrays untouched.
    const offset = new Vector3(-(minX + maxX) / 2, -(minY + maxY) / 2, -minZ);
    this.modelGroup.position.copy(offset);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    this.mesh = new Mesh(geometry, this.shadedMaterial);
    this.modelGroup.add(this.mesh);

    if (data.edges) {
      const eg = new BufferGeometry();
      eg.setAttribute("position", new BufferAttribute(data.edges, 3));
      this.edges = new LineSegments(eg, this.edgeMaterial);
      this.modelGroup.add(this.edges);
    }

    const size = new Vector3(maxX - minX, maxY - minY, maxZ - minZ);
    this.radius = Math.max(geometry.boundingSphere?.radius ?? size.length() / 2, 1e-3);
    this.persp.near = this.radius / 200;
    this.persp.far = this.radius * 400;
    this.persp.updateProjectionMatrix();
    this.controls.maxDistance = this.radius * 60;
    this.controls.minDistance = this.radius * 0.05;

    this.applyDisplay();
    this.rebuildGrid(size);
    this.rebuildAxes(size);
    this.setView("iso", false);
  }

  setView(preset: ViewPreset, animate = true): void {
    const target = this.modelCenter();
    const dir = PRESET_DIRECTIONS[preset].clone();
    const dist = this.fitDistance();
    const pos = target.clone().addScaledVector(dir, this.camera === this.ortho ? Math.max(dist, this.radius * 6) : dist);
    this.moveCamera(pos, target, 1, animate);
  }

  fit(animate = true): void {
    const target = this.modelCenter();
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.lengthSq() < 1e-6) dir.copy(PRESET_DIRECTIONS.iso);
    const dist = this.fitDistance();
    const pos = target.clone().addScaledVector(dir, this.camera === this.ortho ? Math.max(dist, this.radius * 6) : dist);
    this.moveCamera(pos, target, 1, animate);
  }

  reset(): void {
    this.setView("iso", true);
  }

  resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    this.updateOrthoFrustum(this.orthoHalfHeight());
    this.requestRender();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.controls.dispose();
    this.clearMesh();
    this.disposeGroup(this.grid);
    this.disposeGroup(this.axes);
    this.gizmoScene.traverse((o) => {
      const any = o as Mesh & Sprite;
      any.geometry?.dispose?.();
      const mat = any.material as (Material & { map?: Texture }) | undefined;
      mat?.map?.dispose();
      mat?.dispose?.();
    });
    this.shadedMaterial.dispose();
    this.wireMaterial.dispose();
    this.edgeMaterial.dispose();
    this.envTexture.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  // ------------------------------------------------------------ internals

  private readonly requestRender = () => {
    this.needsRender = true;
  };

  private readonly handleContextLost = (e: Event) => {
    e.preventDefault();
    this.onContextLost?.();
  };

  private loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    if (this.tween) this.stepTween();
    const changed = this.controls.update();
    if (changed || this.needsRender) {
      this.needsRender = false;
      this.render();
    }
  };

  private render(): void {
    const { renderer } = this;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    renderer.setViewport(0, 0, w, h);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    // Orientation gizmo in the bottom-left corner.
    this.gizmoCamera.position.copy(this.camera.position).sub(this.controls.target).normalize().multiplyScalar(4);
    this.gizmoCamera.quaternion.copy(this.camera.quaternion);
    renderer.clearDepth();
    renderer.setScissorTest(true);
    renderer.setScissor(10, 10, GIZMO_SIZE, GIZMO_SIZE);
    renderer.setViewport(10, 10, GIZMO_SIZE, GIZMO_SIZE);
    const bg = this.scene.background;
    this.scene.background = null;
    renderer.render(this.gizmoScene, this.gizmoCamera);
    this.scene.background = bg;
    renderer.setScissorTest(false);
  }

  private modelCenter(): Vector3 {
    const sphere: Sphere | null | undefined = this.mesh?.geometry.boundingSphere;
    return sphere ? sphere.center.clone().add(this.modelGroup.position) : new Vector3(0, 0, 0);
  }

  private fitDistance(): number {
    const aspect = this.persp.aspect || 1;
    const vFov = (FOV * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const limiting = Math.min(vFov, hFov);
    return (this.radius * 1.18) / Math.sin(limiting / 2);
  }

  private orthoHalfHeight(): number {
    const aspect = this.persp.aspect || 1;
    const r = this.radius * 1.18;
    return aspect >= 1 ? r : r / aspect;
  }

  private updateOrthoFrustum(halfHeight: number): void {
    const aspect = this.persp.aspect || 1;
    this.ortho.top = halfHeight;
    this.ortho.bottom = -halfHeight;
    this.ortho.left = -halfHeight * aspect;
    this.ortho.right = halfHeight * aspect;
    this.ortho.near = this.radius / 100;
    this.ortho.far = this.radius * 400;
    this.ortho.updateProjectionMatrix();
  }

  private switchProjection(projection: Projection): void {
    const target = this.controls.target.clone();
    const dir = this.camera.position.clone().sub(target);
    const distance = dir.length();
    dir.normalize();
    const tanHalf = Math.tan((FOV * Math.PI) / 360);

    if (projection === "orthographic") {
      const halfHeight = distance * tanHalf;
      this.updateOrthoFrustum(halfHeight);
      this.ortho.zoom = 1;
      this.ortho.position.copy(target).addScaledVector(dir, Math.max(distance, this.radius * 6));
      this.ortho.quaternion.copy(this.persp.quaternion);
      this.ortho.updateProjectionMatrix();
      this.camera = this.ortho;
    } else {
      const halfHeight = this.ortho.top / this.ortho.zoom;
      const d = halfHeight / tanHalf;
      this.persp.position.copy(target).addScaledVector(dir, d);
      this.persp.quaternion.copy(this.ortho.quaternion);
      this.camera = this.persp;
      this.updateOrthoFrustum(this.orthoHalfHeight());
    }
    this.controls.object = this.camera;
    this.controls.update();
  }

  private moveCamera(pos: Vector3, target: Vector3, zoom: number, animate: boolean): void {
    if (this.camera === this.ortho) this.updateOrthoFrustum(this.orthoHalfHeight());
    if (!animate) {
      this.tween = null;
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      if (this.camera === this.ortho) {
        this.ortho.zoom = zoom;
        this.ortho.updateProjectionMatrix();
      }
      this.controls.update();
      this.requestRender();
      return;
    }
    this.tween = {
      from: { pos: this.camera.position.clone(), target: this.controls.target.clone(), zoom: this.camera.zoom },
      to: { pos, target, zoom },
      start: performance.now(),
      duration: 320,
    };
  }

  private stepTween(): void {
    const tw = this.tween!;
    const t = Math.min(1, (performance.now() - tw.start) / tw.duration);
    const k = easeOutCubic(t);
    // Interpolate on a sphere around the target for a natural orbit.
    const fromOffset = tw.from.pos.clone().sub(tw.from.target);
    const toOffset = tw.to.pos.clone().sub(tw.to.target);
    const fromLen = fromOffset.length();
    const toLen = toOffset.length();
    const dir = fromOffset.normalize().lerp(toOffset.normalize(), k);
    if (dir.lengthSq() < 1e-8) dir.copy(toOffset);
    dir.normalize();
    const target = tw.from.target.clone().lerp(tw.to.target, k);
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(dir, fromLen + (toLen - fromLen) * k);
    if (this.camera === this.ortho) {
      this.ortho.zoom = tw.from.zoom + (tw.to.zoom - tw.from.zoom) * k;
      this.ortho.updateProjectionMatrix();
    }
    this.requestRender();
    if (t >= 1) this.tween = null;
  }

  private applyDisplay(): void {
    if (!this.mesh) return;
    const wire = this.settings.display === "wireframe";
    this.mesh.material = wire ? this.wireMaterial : this.shadedMaterial;
    if (this.edges) this.edges.visible = this.settings.display === "shaded-edges";
  }

  private clearMesh(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.modelGroup.remove(this.mesh);
      this.mesh = null;
    }
    if (this.edges) {
      this.edges.geometry.dispose();
      this.modelGroup.remove(this.edges);
      this.edges = null;
    }
  }

  private disposeGroup(group: Group | null): void {
    if (!group) return;
    group.traverse((o) => {
      const any = o as LineSegments;
      any.geometry?.dispose?.();
      (any.material as Material | undefined)?.dispose?.();
    });
    group.removeFromParent();
  }

  private lastSize: Vector3 | null = null;

  private rebuildGrid(size?: Vector3): void {
    if (size) this.lastSize = size;
    const s = this.lastSize;
    this.disposeGroup(this.grid);
    this.grid = null;
    if (!s) return;
    const span = Math.max(s.x, s.y, 1);
    const minor = niceStep(span / 8);
    const major = minor * 5;
    const extent = Math.ceil((span * 3) / major) * major;
    const group = new Group();
    const dark = this.appearance.dark;
    const minorGrid = new GridHelper(extent, Math.round(extent / minor), dark ? 0x26282e : 0xcbcdd2, dark ? 0x26282e : 0xcbcdd2);
    const majorGrid = new GridHelper(extent, Math.round(extent / major), dark ? 0x353840 : 0xb3b6bd, dark ? 0x353840 : 0xb3b6bd);
    for (const g of [minorGrid, majorGrid]) {
      g.rotation.x = Math.PI / 2;
      const mat = g.material as LineBasicMaterial;
      mat.transparent = true;
      mat.opacity = g === minorGrid ? 0.55 : 0.9;
      mat.depthWrite = false;
      group.add(g);
    }
    group.position.z = -0.001 * span;
    group.renderOrder = -1;
    group.visible = this.settings.grid;
    this.grid = group;
    this.scene.add(group);
  }

  private rebuildAxes(size: Vector3): void {
    this.disposeGroup(this.axes);
    const len = Math.max(size.x, size.y, size.z) * 0.6;
    const group = new Group();
    const make = (to: [number, number, number], color: number) => {
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0, ...to]), 3));
      const line = new LineSegments(g, new LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }));
      line.renderOrder = 2;
      return line;
    };
    group.add(make([len, 0, 0], AXIS_COLORS.x), make([0, len, 0], AXIS_COLORS.y), make([0, 0, len], AXIS_COLORS.z));
    group.visible = this.settings.axes;
    this.axes = group;
    this.scene.add(group);
  }

  private buildGizmo(): void {
    const axis = (to: [number, number, number], color: number, label: string) => {
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0, ...to]), 3));
      const line = new LineSegments(g, new LineBasicMaterial({ color, depthTest: false }));
      const sprite = labelSprite(label, color);
      sprite.position.set(to[0] * 1.32, to[1] * 1.32, to[2] * 1.32);
      this.gizmoScene.add(line, sprite);
    };
    axis([1, 0, 0], AXIS_COLORS.x, "X");
    axis([0, 1, 0], AXIS_COLORS.y, "Y");
    axis([0, 0, 1], AXIS_COLORS.z, "Z");
    this.gizmoCamera.up.copy(UP);
  }
}
