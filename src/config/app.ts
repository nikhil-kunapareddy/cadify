import type { GenerationBackend, StageDefinition } from "@/types/generation";

export const APP_NAME = "CADify";
export const APP_TAGLINE = "AI-powered engineering drawing to 3D CAD conversion.";

/** Upper bound enforced on both the frontend and the Rust backend. */
export const MAX_DRAWING_BYTES = 100 * 1024 * 1024;

/**
 * Which generation backend to use inside the desktop app.
 * - "mock":   simulated pipeline that returns the bundled sample model.
 * - "worker": the Rust backend spawns the local CAD worker process.
 * Set VITE_CADIFY_GENERATION_BACKEND=worker to use the real worker.
 */
export const DESKTOP_GENERATION_BACKEND: GenerationBackend =
  import.meta.env.VITE_CADIFY_GENERATION_BACKEND === "worker" ? "worker" : "mock";

export const ANTHROPIC_KEYS_URL = "https://console.anthropic.com/settings/keys";

export const GENERATION_STAGES: readonly StageDefinition[] = [
  { id: "prepare", label: "Preparing drawing", description: "Checking the document and creating a working copy." },
  { id: "extract", label: "Extracting PDF information", description: "Reading pages, vector geometry and embedded text." },
  { id: "analyze", label: "Analyzing drawing with Claude", description: "Interpreting views, annotations and title block." },
  { id: "identify", label: "Identifying dimensions and features", description: "Matching dimensions to holes, slots, fillets and profiles." },
  { id: "reconstruct", label: "Reconstructing 3D geometry", description: "Building sketches and feature operations from the views." },
  { id: "solid", label: "Generating solid model", description: "Running the CAD kernel to produce a B-rep solid." },
  { id: "validate", label: "Validating geometry", description: "Checking solid validity and dimensional consistency." },
  { id: "export", label: "Preparing STEP and STL files", description: "Writing exchange files and the preview mesh." },
] as const;
