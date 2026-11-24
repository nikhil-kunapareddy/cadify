/**
 * Service contracts. UI code depends only on these interfaces; concrete
 * implementations live in services/tauri (production), services/browser
 * (in-browser preview without native APIs) and services/mock (simulated
 * generation backend for development).
 */
import type { DrawingDocument, DrawingSource } from "@/types/drawing";
import type {
  ClarificationAnswer,
  GenerationBackend,
  GenerationEvent,
  GenerationRequest,
  GenerationResult,
  ModelArtifact,
} from "@/types/generation";
import type { ArtifactKind, Project, ProjectGenerationStatus, ProjectSummary } from "@/types/project";
import type {
  AppInfo,
  CredentialStatus,
  CredentialStorage,
  KeyValidation,
  StorageSettings,
} from "@/types/settings";

export interface ReadDrawingResult {
  bytes: Uint8Array;
  sizeBytes: number;
}

export interface DrawingFileService {
  /** Opens the native file picker. Resolves null when the user cancels. */
  pick(): Promise<DrawingSource | null>;
  /**
   * Reads a drawing and performs cheap structural validation (extension,
   * size limit, PDF header). PDF parsing happens in the PDF service.
   */
  read(source: DrawingSource, onProgress?: (fraction: number) => void): Promise<ReadDrawingResult>;
}

export interface AttachDrawingInput {
  source: DrawingSource;
  drawing: DrawingDocument;
  bytes: Uint8Array;
  thumbnail?: string;
}

export interface ProjectService {
  /** False when projects only live in memory (browser preview). */
  readonly persistent: boolean;
  readonly canReveal: boolean;
  list(): Promise<ProjectSummary[]>;
  get(id: string): Promise<Project>;
  create(name: string): Promise<Project>;
  attachDrawing(projectId: string, input: AttachDrawingInput): Promise<Project>;
  removeDrawing(projectId: string): Promise<Project>;
  readDrawing(projectId: string): Promise<Uint8Array>;
  readArtifact(projectId: string, kind: ArtifactKind): Promise<Uint8Array>;
  /** Stores a generated file inside the project. Returns its size in bytes. */
  writeArtifact(projectId: string, kind: ArtifactKind, bytes: Uint8Array): Promise<number>;
  recordGeneration(
    projectId: string,
    status: ProjectGenerationStatus,
    result?: GenerationResult,
  ): Promise<Project>;
  rename(id: string, name: string): Promise<Project>;
  remove(id: string): Promise<void>;
  reveal(id: string): Promise<void>;
}

export interface ExportOutcome {
  format: ModelArtifact["format"];
  path: string;
  sizeBytes: number;
}

export interface ExportService {
  readonly canReveal: boolean;
  /** Native save dialog, then write. Resolves null when the user cancels. */
  exportOne(projectId: string, artifact: ModelArtifact, baseName: string): Promise<ExportOutcome | null>;
  /** Native folder picker. Resolves null when the user cancels. */
  chooseDirectory(): Promise<string | null>;
  /**
   * Writes several artifacts into a directory. Rejects with EXPORT_EXISTS
   * (detail = comma-separated file names) unless `overwrite` is set.
   */
  exportToDirectory(
    projectId: string,
    artifacts: ModelArtifact[],
    directory: string,
    baseName: string,
    overwrite: boolean,
  ): Promise<ExportOutcome[]>;
  reveal(path: string): Promise<void>;
}

export interface CredentialService {
  readonly storage: CredentialStorage;
  status(): Promise<CredentialStatus>;
  save(apiKey: string): Promise<CredentialStatus>;
  remove(): Promise<CredentialStatus>;
  /** Validates `candidate` if given, otherwise the stored key. */
  validate(candidate?: string): Promise<KeyValidation>;
}

export interface GenerationHandle {
  runId: string;
  cancel(): Promise<void>;
  answer(answers: ClarificationAnswer[]): Promise<void>;
}

export interface GenerationService {
  readonly backend: GenerationBackend;
  start(request: GenerationRequest, onEvent: (event: GenerationEvent) => void): Promise<GenerationHandle>;
}

export interface SettingsService {
  readonly canChangeDirectory: boolean;
  getStorage(): Promise<StorageSettings>;
  chooseProjectDirectory(): Promise<StorageSettings | null>;
  openProjectDirectory(): Promise<void>;
  clearTemporaryFiles(): Promise<{ freedBytes: number }>;
  appInfo(): Promise<AppInfo>;
  openExternal(url: string): Promise<void>;
}

export interface Services {
  runtime: "tauri" | "browser";
  files: DrawingFileService;
  projects: ProjectService;
  exports: ExportService;
  credentials: CredentialService;
  generation: GenerationService;
  settings: SettingsService;
}
