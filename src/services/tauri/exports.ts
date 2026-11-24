import { open, save } from "@tauri-apps/plugin-dialog";
import type { ExportOutcome, ExportService } from "@/services/contracts";
import type { ModelArtifact } from "@/types/generation";
import { call } from "./ipc";

const FILTERS: Record<ModelArtifact["format"], { name: string; extensions: string[] }> = {
  step: { name: "STEP CAD Model", extensions: ["step", "stp"] },
  stl: { name: "STL Mesh", extensions: ["stl"] },
};

export class TauriExportService implements ExportService {
  readonly canReveal = true;

  async exportOne(projectId: string, artifact: ModelArtifact, baseName: string): Promise<ExportOutcome | null> {
    const destination = await save({
      title: `Export ${artifact.format.toUpperCase()}`,
      defaultPath: `${baseName}.${artifact.format}`,
      filters: [FILTERS[artifact.format]],
    });
    if (!destination) return null;
    return call<ExportOutcome>("export_artifact", { projectId, format: artifact.format, destination });
  }

  async chooseDirectory(): Promise<string | null> {
    const selected = await open({ title: "Choose Export Folder", directory: true, multiple: false, canCreateDirectories: true });
    if (!selected || Array.isArray(selected)) return null;
    return selected;
  }

  exportToDirectory(
    projectId: string,
    artifacts: ModelArtifact[],
    directory: string,
    baseName: string,
    overwrite: boolean,
  ): Promise<ExportOutcome[]> {
    return call<ExportOutcome[]>("export_to_directory", {
      projectId,
      formats: artifacts.map((a) => a.format),
      directory,
      baseName,
      overwrite,
    });
  }

  reveal(path: string): Promise<void> {
    return call("reveal_path", { path });
  }
}
