import type { DrawingDocument } from "./drawing";
import type { ExportFormat, GenerationResult } from "./generation";

export type ProjectGenerationStatus =
  | "none"
  | "succeeded"
  | "failed"
  | "needs_clarification"
  | "cancelled";

export interface ProjectSummary {
  id: string;
  name: string;
  drawingFileName?: string;
  createdAt: string;
  updatedAt: string;
  generationStatus: ProjectGenerationStatus;
  availableFormats: ExportFormat[];
  thumbnail?: string;
}

export interface Project extends ProjectSummary {
  directory?: string;
  drawing?: DrawingDocument;
  generation?: GenerationResult;
}

export type ArtifactKind = ExportFormat | "preview";
