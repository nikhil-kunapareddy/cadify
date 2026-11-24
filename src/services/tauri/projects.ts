import { invoke } from "@tauri-apps/api/core";
import type { AttachDrawingInput, ProjectService } from "@/services/contracts";
import type { GenerationResult } from "@/types/generation";
import type { ArtifactKind, Project, ProjectGenerationStatus, ProjectSummary } from "@/types/project";
import { toAppError } from "@/utils/errors";
import { call, callBytes } from "./ipc";

/** Projects persisted in SQLite; files live in the project directory on disk. */
export class TauriProjectService implements ProjectService {
  readonly persistent = true;
  readonly canReveal = true;

  list(): Promise<ProjectSummary[]> {
    return call("project_list");
  }

  get(id: string): Promise<Project> {
    return call("project_get", { id });
  }

  create(name: string): Promise<Project> {
    return call("project_create", { name });
  }

  async attachDrawing(projectId: string, input: AttachDrawingInput): Promise<Project> {
    let sourcePath: string | null = null;
    if (input.source.kind === "path") {
      sourcePath = input.source.path;
    } else {
      await this.writeArtifactRaw(projectId, "drawing", input.bytes);
    }
    return call("project_attach_drawing", {
      projectId,
      sourcePath,
      drawing: input.drawing,
      thumbnail: input.thumbnail ?? null,
    });
  }

  removeDrawing(projectId: string): Promise<Project> {
    return call("project_remove_drawing", { projectId });
  }

  readDrawing(projectId: string): Promise<Uint8Array> {
    return callBytes("project_read_file", { projectId, kind: "drawing" });
  }

  readArtifact(projectId: string, kind: ArtifactKind): Promise<Uint8Array> {
    return callBytes("project_read_file", { projectId, kind });
  }

  writeArtifact(projectId: string, kind: ArtifactKind, bytes: Uint8Array): Promise<number> {
    return this.writeArtifactRaw(projectId, kind, bytes);
  }

  private async writeArtifactRaw(projectId: string, kind: string, bytes: Uint8Array): Promise<number> {
    try {
      // Raw IPC body avoids JSON-encoding binary data.
      return await invoke<number>("project_write_artifact", bytes, {
        headers: { "x-project-id": projectId, "x-artifact-kind": kind },
      });
    } catch (err) {
      throw toAppError(err, "STORAGE_ERROR");
    }
  }

  recordGeneration(projectId: string, status: ProjectGenerationStatus, result?: GenerationResult): Promise<Project> {
    return call("project_record_generation", { projectId, status, result: result ?? null });
  }

  rename(id: string, name: string): Promise<Project> {
    return call("project_rename", { id, name });
  }

  remove(id: string): Promise<void> {
    return call("project_delete", { id });
  }

  reveal(id: string): Promise<void> {
    return call("project_reveal", { id });
  }
}
