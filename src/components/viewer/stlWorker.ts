/**
 * Parses STL off the main thread and prepares render-ready buffers:
 * creased vertex normals (smooth cylinders, crisp edges) and feature edges.
 */
import { EdgesGeometry } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface StlWorkerRequest {
  id: number;
  buffer: ArrayBuffer;
}

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  edges: Float32Array | null;
  triangleCount: number;
  min: [number, number, number];
  max: [number, number, number];
}

export type StlWorkerResponse = { id: number; ok: true; mesh: MeshData } | { id: number; ok: false; message: string };

const CREASE_LIMIT = 1_500_000; // triangles
const EDGE_LIMIT = 600_000;

/** Minimal typing for the dedicated worker scope (avoids pulling in the WebWorker lib). */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<StlWorkerRequest>) => void) | null;
  postMessage(message: StlWorkerResponse, transfer?: Transferable[]): void;
};

scope.onmessage = (event: MessageEvent<StlWorkerRequest>) => {
  const { id, buffer } = event.data;
  try {
    const raw = new STLLoader().parse(buffer);
    const triangleCount = raw.getAttribute("position").count / 3;
    if (!Number.isFinite(triangleCount) || triangleCount < 1) throw new Error("The mesh contains no triangles.");

    const shaded = triangleCount <= CREASE_LIMIT ? toCreasedNormals(raw, Math.PI / 7) : raw;
    if (!shaded.getAttribute("normal")) shaded.computeVertexNormals();
    shaded.computeBoundingBox();
    const box = shaded.boundingBox!;

    let edges: Float32Array | null = null;
    if (triangleCount <= EDGE_LIMIT) {
      const eg = new EdgesGeometry(raw, 24);
      edges = eg.getAttribute("position").array as Float32Array;
    }

    const positions = shaded.getAttribute("position").array as Float32Array;
    const normals = shaded.getAttribute("normal").array as Float32Array;
    const mesh: MeshData = {
      positions,
      normals,
      edges,
      triangleCount,
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
    };
    const transfer: Transferable[] = [positions.buffer, normals.buffer];
    if (edges) transfer.push(edges.buffer);
    scope.postMessage({ id, ok: true, mesh }, transfer);
  } catch (err) {
    scope.postMessage({
      id,
      ok: false,
      message: err instanceof Error ? err.message : "The STL file could not be parsed.",
    });
  }
};
