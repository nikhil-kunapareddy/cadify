import type { AppError } from "./errors";

export type ExportFormat = "step" | "stl";
export type OutputSelection = "both" | "step" | "stl";
export type LengthUnit = "mm" | "in";

export type StageId =
  | "prepare"
  | "extract"
  | "analyze"
  | "identify"
  | "reconstruct"
  | "solid"
  | "validate"
  | "export";

export type StageStatus = "waiting" | "active" | "completed" | "failed";

export interface StageDefinition {
  id: StageId;
  label: string;
  description: string;
}

export interface StageState {
  status: StageStatus;
  startedAt?: number;
  finishedAt?: number;
  /** Short factual note reported by the backend, e.g. "14 dimensions found". */
  detail?: string;
  /** 0..1, only when the backend reports real progress for the stage. */
  progress?: number;
}

export interface GenerationRequest {
  projectId: string;
  outputs: ExportFormat[];
  drawingFileName: string;
  pageCount: number;
  modelName: string;
}

// ---------------------------------------------------------------- results ---

export type FeatureKind =
  | "hole"
  | "slot"
  | "cylinder"
  | "extrusion"
  | "fillet"
  | "chamfer"
  | "cutout"
  | "pocket"
  | "other";

export interface DetectedFeature {
  id: string;
  kind: FeatureKind;
  label: string;
  count: number;
  /** Key parameters as written on the drawing, e.g. "Ø9 THRU". */
  parameters?: string;
  /** True when a dimension had to be inferred rather than read. */
  inferred?: boolean;
}

export type CheckStatus = "pass" | "warn" | "fail" | "not_applicable";

export interface CheckResult {
  status: CheckStatus;
  detail?: string;
}

export interface ValidationReport {
  solidValid: CheckResult;
  watertight: CheckResult;
  dimensionConsistency: CheckResult;
  exportValidation: CheckResult;
}

export interface GenerationWarning {
  code: string;
  message: string;
}

export interface ModelArtifact {
  format: ExportFormat;
  fileName: string;
  sizeBytes: number;
  validated: boolean;
}

export interface PreviewMesh {
  format: "stl";
  sizeBytes: number;
  triangleCount: number;
}

export interface ModelDimensions {
  length: number;
  width: number;
  height: number;
}

/** Claude API usage for one generation, as reported by the worker. */
export interface GenerationUsage {
  model: string;
  servedBy: string[];
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface GenerationResult {
  runId: string;
  modelName: string;
  sourceFileName: string;
  generatedAt: string;
  units: LengthUnit;
  drawingType?: string;
  dimensions: ModelDimensions;
  solidCount: number;
  features: DetectedFeature[];
  validation: ValidationReport;
  artifacts: ModelArtifact[];
  preview: PreviewMesh;
  warnings: GenerationWarning[];
  usage?: GenerationUsage;
  /** Which backend produced the result. "mock" results come from sample data. */
  backend: GenerationBackend;
}

// ---------------------------------------------------------- clarification ---

export interface ClarificationOption {
  id: string;
  label: string;
  description?: string;
}

export interface ClarificationQuestion {
  id: string;
  prompt: string;
  /** Where on the drawing the ambiguity is, e.g. "Sheet 1 · Top view". */
  context?: string;
  kind: "choice" | "dimension";
  options?: ClarificationOption[];
  unit?: LengthUnit;
  suggestedValue?: number;
}

export interface ClarificationRequest {
  id: string;
  summary: string;
  questions: ClarificationQuestion[];
}

export interface ClarificationAnswer {
  questionId: string;
  optionId?: string;
  value?: number;
}

// ----------------------------------------------------------------- events ---

export type GenerationEvent =
  | { type: "stage_started"; stage: StageId; detail?: string }
  | { type: "stage_progress"; stage: StageId; progress?: number; detail?: string }
  | { type: "stage_completed"; stage: StageId; detail?: string }
  | { type: "warning"; warning: GenerationWarning }
  | { type: "clarification_required"; request: ClarificationRequest }
  | { type: "completed"; result: GenerationResult }
  | { type: "failed"; error: AppError; stage?: StageId }
  | { type: "cancelled" };

export type GenerationBackend = "mock" | "worker";
