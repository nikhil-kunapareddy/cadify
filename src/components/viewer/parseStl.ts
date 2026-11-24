import type { MeshData, StlWorkerRequest, StlWorkerResponse } from "./stlWorker";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (m: MeshData) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./stlWorker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<StlWorkerResponse>) => {
    const entry = pending.get(e.data.id);
    if (!entry) return;
    pending.delete(e.data.id);
    if (e.data.ok) entry.resolve(e.data.mesh);
    else entry.reject(new Error(e.data.message));
  };
  worker.onerror = (e) => {
    for (const entry of pending.values()) entry.reject(new Error(e.message || "STL worker crashed"));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/** Parsed meshes keyed by the source bytes, so remounting a viewer is instant. */
const cache = new WeakMap<Uint8Array, Promise<MeshData>>();

/** Parses STL bytes in a Web Worker so large meshes never block the UI. */
export function parseStl(bytes: Uint8Array): Promise<MeshData> {
  const hit = cache.get(bytes);
  if (hit) return hit;
  const promise = parseUncached(bytes);
  cache.set(bytes, promise);
  promise.catch(() => cache.delete(bytes));
  return promise;
}

function parseUncached(bytes: Uint8Array): Promise<MeshData> {
  const id = ++seq;
  const buffer = bytes.slice().buffer as ArrayBuffer;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, buffer } satisfies StlWorkerRequest, [buffer]);
  });
}

export type { MeshData };
