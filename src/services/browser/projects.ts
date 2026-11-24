import type { AttachDrawingInput, ProjectService } from "@/services/contracts";
import type { ExportFormat, GenerationResult } from "@/types/generation";
import type { ArtifactKind, Project, ProjectGenerationStatus, ProjectSummary } from "@/types/project";
import { appError } from "@/utils/errors";
import { newId } from "@/utils/platform";

interface StoredProject {
  project: Project;
  files: Map<ArtifactKind | "drawing", Uint8Array>;
}

/**
 * In-memory project store for running the UI in a plain browser. Nothing is
 * persisted; the UI shows an "unsaved" indicator when this service is active.
 */
export class BrowserProjectService implements ProjectService {
  readonly persistent = false;
  readonly canReveal = false;
  private readonly projects = new Map<string, StoredProject>();

  private require(id: string): StoredProject {
    const entry = this.projects.get(id);
    if (!entry) throw appError("PROJECT_NOT_FOUND");
    return entry;
  }

  private touch(entry: StoredProject): Project {
    entry.project = { ...entry.project, updatedAt: new Date().toISOString() };
    return structuredClone(entry.project);
  }

  async list(): Promise<ProjectSummary[]> {
    return [...this.projects.values()]
      .map(({ project }) => {
        const { drawing: _d, generation: _g, directory: _dir, ...summary } = project;
        return summary;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Project> {
    return structuredClone(this.require(id).project);
  }

  async create(name: string): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      id: newId(),
      name: name.trim() || "Untitled project",
      createdAt: now,
      updatedAt: now,
      generationStatus: "none",
      availableFormats: [],
    };
    this.projects.set(project.id, { project, files: new Map() });
    return structuredClone(project);
  }

  async attachDrawing(projectId: string, input: AttachDrawingInput): Promise<Project> {
    const entry = this.require(projectId);
    entry.files.clear();
    entry.files.set("drawing", input.bytes.slice());
    entry.project = {
      ...entry.project,
      drawing: input.drawing,
      drawingFileName: input.drawing.fileName,
      thumbnail: input.thumbnail,
      generation: undefined,
      generationStatus: "none",
      availableFormats: [],
    };
    return this.touch(entry);
  }

  async removeDrawing(projectId: string): Promise<Project> {
    const entry = this.require(projectId);
    entry.files.clear();
    entry.project = {
      ...entry.project,
      drawing: undefined,
      drawingFileName: undefined,
      thumbnail: undefined,
      generation: undefined,
      generationStatus: "none",
      availableFormats: [],
    };
    return this.touch(entry);
  }

  async readDrawing(projectId: string): Promise<Uint8Array> {
    const bytes = this.require(projectId).files.get("drawing");
    if (!bytes) throw appError("FILE_NOT_FOUND", "The drawing is missing from this project");
    return bytes.slice();
  }

  async readArtifact(projectId: string, kind: ArtifactKind): Promise<Uint8Array> {
    const bytes = this.require(projectId).files.get(kind);
    if (!bytes) throw appError("ARTIFACT_NOT_FOUND");
    return bytes.slice();
  }

  async writeArtifact(projectId: string, kind: ArtifactKind, bytes: Uint8Array): Promise<number> {
    this.require(projectId).files.set(kind, bytes.slice());
    return bytes.byteLength;
  }

  async recordGeneration(projectId: string, status: ProjectGenerationStatus, result?: GenerationResult): Promise<Project> {
    const entry = this.require(projectId);
    const formats: ExportFormat[] = result ? result.artifacts.filter((a) => a.validated).map((a) => a.format) : [];
    entry.project = {
      ...entry.project,
      generationStatus: status,
      generation: status === "succeeded" ? result : entry.project.generation,
      availableFormats: status === "succeeded" ? formats : entry.project.availableFormats,
    };
    return this.touch(entry);
  }

  async rename(id: string, name: string): Promise<Project> {
    const entry = this.require(id);
    entry.project = { ...entry.project, name: name.trim() || entry.project.name };
    return this.touch(entry);
  }

  async remove(id: string): Promise<void> {
    this.projects.delete(id);
  }

  async reveal(): Promise<void> {
    throw appError("UNKNOWN", "Reveal in Finder needs the desktop app");
  }
}
