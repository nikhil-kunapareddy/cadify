/**
 * MOCK generation backend — development only.
 *
 * Plays back a realistic stage sequence and returns the bundled sample model
 * (a CadQuery-built mounting bracket, see samples/scripts/build_sample.py)
 * regardless of the uploaded drawing. Results are tagged `backend: "mock"` so
 * the UI can label them. Replace with TauriGenerationService for real output.
 */
import type { GenerationHandle, GenerationService, ProjectService } from "@/services/contracts";
import type {
  ClarificationAnswer,
  ClarificationRequest,
  DetectedFeature,
  GenerationEvent,
  GenerationRequest,
  GenerationResult,
  GenerationWarning,
  ModelArtifact,
  StageId,
} from "@/types/generation";
import type { AppError } from "@/types/errors";
import { appError } from "@/utils/errors";
import { formatBytes } from "@/utils/format";
import { newId, sleep } from "@/utils/platform";
import sampleMeta from "./assets/mounting-bracket.meta.json";
import sampleStepUrl from "./assets/mounting-bracket.step?url";
import sampleStlUrl from "./assets/mounting-bracket.stl?url";
import type { MockScenario } from "./scenarios";

const STAGE_TIMING_MS: Record<StageId, number> = {
  prepare: 500,
  extract: 900,
  analyze: 3600,
  identify: 1700,
  reconstruct: 2000,
  solid: 1500,
  validate: 1000,
  export: 700,
};

const FAILURES: Partial<Record<MockScenario, { stage: StageId; error: AppError }>> = {
  auth_failed: {
    stage: "analyze",
    error: appError("API_AUTH_FAILED", "Anthropic API authentication failed", "401 authentication_error: invalid x-api-key"),
  },
  interpretation_failed: {
    stage: "analyze",
    error: appError(
      "INTERPRETATION_FAILED",
      "Drawing interpretation failed",
      "No dimensioned orthographic views were found on the selected sheet.",
    ),
  },
  insufficient_dimensions: {
    stage: "identify",
    error: appError(
      "INSUFFICIENT_DIMENSIONS",
      "Insufficient dimensions",
      "Wall height and hole positions are not dimensioned in any view.",
    ),
  },
  geometry_failed: {
    stage: "solid",
    error: appError("GEOMETRY_FAILED", "Geometry generation failed", "Boolean cut of slot feature produced a non-manifold result."),
  },
  validation_failed: {
    stage: "validate",
    error: appError("VALIDATION_FAILED", "Model validation failed", "BRepCheck reported 2 invalid faces after filleting."),
  },
};

const CLARIFICATION: ClarificationRequest = {
  id: "clarify-1",
  summary: "Two dimensions on the drawing are ambiguous. Confirm them so the model matches your intent.",
  questions: [
    {
      id: "slot-depth",
      prompt: "How deep is the 30 × 10 slot?",
      context: "Sheet 1 · Top view — slot depth is not dimensioned",
      kind: "choice",
      options: [
        { id: "through", label: "Through all", description: "Cuts the full 10 mm base thickness (matches sheet 2, note 4)" },
        { id: "blind-5", label: "Blind, 5 mm", description: "Pocket from the top face" },
      ],
    },
    {
      id: "rear-corner-radius",
      prompt: "What radius should the rear vertical corners use?",
      context: "Sheet 1 · Top view — only the front corners are dimensioned (2× R8)",
      kind: "dimension",
      unit: "mm",
      suggestedValue: 0,
    },
  ],
};

function sampleFeatures(inferred: boolean): DetectedFeature[] {
  return [
    { id: "f-base", kind: "extrusion", label: "Base plate", count: 1, parameters: "120 × 80 × 10" },
    { id: "f-wall", kind: "extrusion", label: "Upright wall", count: 1, parameters: "120 × 12 × 70" },
    { id: "f-holes-base", kind: "hole", label: "Through hole", count: 4, parameters: "Ø9 THRU" },
    { id: "f-holes-wall", kind: "hole", label: "Through hole", count: 2, parameters: "Ø6.5 THRU" },
    { id: "f-bore", kind: "cylinder", label: "Bore", count: 1, parameters: "Ø24 THRU" },
    { id: "f-slot", kind: "slot", label: "Slot", count: 1, parameters: "30 × 10 THRU", inferred },
    { id: "f-fillet-corner", kind: "fillet", label: "Corner fillet", count: 2, parameters: "R8" },
    { id: "f-fillet-bend", kind: "fillet", label: "Bend fillet", count: 1, parameters: "R6" },
    { id: "f-chamfer", kind: "chamfer", label: "Bore chamfer", count: 2, parameters: "1 × 45°" },
  ];
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw appError("UNKNOWN", `Sample asset missing: ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

function stlTriangleCount(bytes: Uint8Array): number {
  // Binary STL: 80-byte header, uint32 count, 50 bytes per triangle.
  if (bytes.byteLength >= 84) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const n = view.getUint32(80, true);
    if (84 + n * 50 === bytes.byteLength) return n;
  }
  // ASCII STL
  const text = new TextDecoder().decode(bytes);
  return (text.match(/\bfacet\s+normal\b/g) ?? []).length;
}

export class MockGenerationService implements GenerationService {
  readonly backend = "mock" as const;

  constructor(
    private readonly projects: ProjectService,
    private readonly scenario: () => MockScenario,
  ) {}

  async start(request: GenerationRequest, onEvent: (event: GenerationEvent) => void): Promise<GenerationHandle> {
    const runId = newId();
    const controller = new AbortController();
    let resolveAnswer: ((answers: ClarificationAnswer[]) => void) | null = null;

    const handle: GenerationHandle = {
      runId,
      cancel: async () => controller.abort(),
      answer: async (answers) => {
        resolveAnswer?.(answers);
        resolveAnswer = null;
      },
    };

    const scenario = this.scenario();
    void this.run(request, runId, scenario, controller.signal, onEvent, () =>
      new Promise<ClarificationAnswer[]>((resolve) => {
        resolveAnswer = resolve;
      }),
    );
    return handle;
  }

  private async run(
    request: GenerationRequest,
    runId: string,
    scenario: MockScenario,
    signal: AbortSignal,
    emit: (event: GenerationEvent) => void,
    waitForAnswers: () => Promise<ClarificationAnswer[]>,
  ): Promise<void> {
    const failure = FAILURES[scenario];
    const warnings: GenerationWarning[] = [];
    let inferred = scenario === "success_with_warnings";
    const wait = (stage: StageId) => sleep(STAGE_TIMING_MS[stage] * (0.85 + Math.random() * 0.3), signal);

    const stage = async (id: StageId, detail: string, body?: () => Promise<string | void>) => {
      emit({ type: "stage_started", stage: id });
      await wait(id);
      if (failure?.stage === id) throw failure.error;
      const override = body ? await body() : undefined;
      emit({ type: "stage_completed", stage: id, detail: override || detail });
    };

    try {
      await stage("prepare", "Working copy created");
      await stage("extract", `${request.pageCount} ${request.pageCount === 1 ? "page" : "pages"} · vector geometry and text found`);
      await stage("analyze", "3 orthographic views, 1 isometric, title block");

      if (scenario === "success_with_warnings") {
        warnings.push(
          { code: "INFERRED_DIMENSIONS", message: "Model contains inferred dimensions: slot depth and rear corner radius." },
          { code: "MULTIPLE_INTERPRETATIONS", message: "Drawing contains multiple possible interpretations of the slot depth." },
        );
        for (const w of warnings) emit({ type: "warning", warning: w });
      }

      await stage("identify", "17 dimensions · 9 feature groups", async () => {
        if (scenario !== "clarification") return;
        emit({ type: "clarification_required", request: CLARIFICATION });
        const answers = await Promise.race([
          waitForAnswers(),
          new Promise<never>((_, reject) =>
            signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }),
          ),
        ]);
        // An answer with neither option nor value means "let CADify decide".
        const delegated = answers.filter((a) => a.optionId === undefined && a.value === undefined).length;
        if (delegated > 0) {
          inferred = true;
          const warning = {
            code: "INFERRED_DIMENSIONS",
            message: `Model contains inferred dimensions: ${delegated} ${delegated === 1 ? "value was" : "values were"} chosen by CADify.`,
          };
          warnings.push(warning);
          emit({ type: "warning", warning });
        }
        const confirmed = answers.length - delegated;
        return `17 dimensions · 9 feature groups${confirmed ? ` · ${confirmed} confirmed` : ""}`;
      });

      await stage("reconstruct", "2 sketches · 7 feature operations");
      await stage("solid", `${sampleMeta.solidCount} solid · ${sampleMeta.faceCount} faces`);
      await stage("validate", "Solid valid · watertight · dimensions consistent");

      emit({ type: "stage_started", stage: "export" });
      await wait("export");
      const [stlBytes, stepBytes] = await Promise.all([fetchBytes(sampleStlUrl), fetchBytes(sampleStepUrl)]);
      const artifacts: ModelArtifact[] = [];
      if (request.outputs.includes("step")) {
        const size = await this.projects.writeArtifact(request.projectId, "step", stepBytes);
        artifacts.push({ format: "step", fileName: "model.step", sizeBytes: size, validated: true });
      }
      if (request.outputs.includes("stl")) {
        const size = await this.projects.writeArtifact(request.projectId, "stl", stlBytes);
        artifacts.push({ format: "stl", fileName: "model.stl", sizeBytes: size, validated: true });
      }
      const previewSize = await this.projects.writeArtifact(request.projectId, "preview", stlBytes);
      emit({
        type: "stage_completed",
        stage: "export",
        detail: artifacts.map((a) => `${a.format.toUpperCase()} ${formatBytes(a.sizeBytes)}`).join(" · "),
      });

      const result: GenerationResult = {
        runId,
        backend: "mock",
        modelName: request.modelName,
        sourceFileName: request.drawingFileName,
        generatedAt: new Date().toISOString(),
        units: "mm",
        drawingType: "Multi-view orthographic · third-angle projection",
        dimensions: {
          length: sampleMeta.boundingBox.x,
          width: sampleMeta.boundingBox.y,
          height: sampleMeta.boundingBox.z,
        },
        solidCount: sampleMeta.solidCount,
        features: sampleFeatures(inferred),
        validation: {
          solidValid: { status: "pass", detail: "Valid B-rep solid" },
          watertight: { status: "pass", detail: "Closed shell, no open edges" },
          dimensionConsistency: inferred
            ? { status: "warn", detail: "15 of 17 dimensions read · 2 inferred" }
            : { status: "pass", detail: "17 of 17 drawing dimensions matched" },
          exportValidation: { status: "pass", detail: "Exported files re-read successfully" },
        },
        artifacts,
        preview: { format: "stl", sizeBytes: previewSize, triangleCount: stlTriangleCount(stlBytes) },
        warnings,
      };
      emit({ type: "completed", result });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError" || signal.aborted) {
        emit({ type: "cancelled" });
        return;
      }
      const error = (err as AppError)?.code ? (err as AppError) : appError("UNKNOWN", (err as Error)?.message);
      emit({ type: "failed", error, stage: failure?.stage });
    }
  }
}
