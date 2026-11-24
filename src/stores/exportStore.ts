import { create } from "zustand";
import { services } from "@/services";
import type { ExportOutcome } from "@/services/contracts";
import type { AppError } from "@/types/errors";
import type { ExportFormat, ModelArtifact } from "@/types/generation";
import { errorCopy, toAppError } from "@/utils/errors";
import { exportBaseName } from "@/utils/format";
import { useGenerationStore } from "./generationStore";
import { useProjectStore } from "./projectStore";
import { toast } from "./toastStore";

type ExportTarget = ExportFormat | "all";

interface PendingOverwrite {
  directory: string;
  files: string[];
  artifacts: ModelArtifact[];
}

interface ExportState {
  busy: ExportTarget | null;
  lastExport: Partial<Record<ExportFormat, ExportOutcome>>;
  lastError: AppError | null;
  pendingOverwrite: PendingOverwrite | null;
  exportOne: (format: ExportFormat) => Promise<void>;
  exportAll: () => Promise<void>;
  confirmOverwrite: () => Promise<void>;
  cancelOverwrite: () => void;
  reset: () => void;
}

function context() {
  const project = useProjectStore.getState().project;
  const result = useGenerationStore.getState().result;
  if (!project || !result) return null;
  const validated = result.artifacts.filter((a) => a.validated);
  return { project, result, validated, baseName: exportBaseName(result.modelName || project.name) };
}

function revealAction(path: string) {
  return services.exports.canReveal
    ? { label: "Show in Finder", onClick: () => void services.exports.reveal(path).catch(() => undefined) }
    : undefined;
}

function reportFailure(format: string, err: unknown): AppError {
  const error = toAppError(err, "EXPORT_FAILED");
  toast.error(`${format} export failed`, {
    description: error.message && error.code === "EXPORT_FAILED" ? error.message : errorCopy(error.code).description,
  });
  return error;
}

export const useExportStore = create<ExportState>((set, get) => {
  const writeAll = async (directory: string, artifacts: ModelArtifact[], overwrite: boolean) => {
    const ctx = context();
    if (!ctx) return;
    try {
      const outcomes = await services.exports.exportToDirectory(ctx.project.id, artifacts, directory, ctx.baseName, overwrite);
      const last = { ...get().lastExport };
      for (const o of outcomes) last[o.format] = o;
      set({ busy: null, lastExport: last, pendingOverwrite: null, lastError: null });
      const names = outcomes.map((o) => o.format.toUpperCase()).join(" and ");
      toast.success(`${names} exported successfully`, {
        description: services.runtime === "tauri" ? directory : "Saved to your downloads",
        action: outcomes[0] ? revealAction(outcomes[0].path) : undefined,
      });
    } catch (err) {
      const error = toAppError(err, "EXPORT_FAILED");
      if (error.code === "EXPORT_EXISTS") {
        set({ busy: null, pendingOverwrite: { directory, artifacts, files: (error.detail ?? "").split(",").filter(Boolean) } });
        return;
      }
      set({ busy: null, lastError: reportFailure("Model", error) });
    }
  };

  return {
    busy: null,
    lastExport: {},
    lastError: null,
    pendingOverwrite: null,

    exportOne: async (format) => {
      const ctx = context();
      if (!ctx || get().busy) return;
      const artifact = ctx.validated.find((a) => a.format === format);
      if (!artifact) {
        toast.error(`${format.toUpperCase()} is not available`, { description: "This format was not generated or did not pass validation." });
        return;
      }
      set({ busy: format, lastError: null });
      try {
        const outcome = await services.exports.exportOne(ctx.project.id, artifact, ctx.baseName);
        if (!outcome) {
          set({ busy: null });
          return;
        }
        set((s) => ({ busy: null, lastExport: { ...s.lastExport, [format]: outcome } }));
        toast.success(`${format.toUpperCase()} exported successfully`, {
          description: outcome.path.split("/").pop(),
          action: revealAction(outcome.path),
        });
      } catch (err) {
        set({ busy: null, lastError: reportFailure(format.toUpperCase(), err) });
      }
    },

    exportAll: async () => {
      const ctx = context();
      if (!ctx || get().busy || ctx.validated.length === 0) return;
      set({ busy: "all", lastError: null });
      try {
        const directory = await services.exports.chooseDirectory();
        if (!directory) {
          set({ busy: null });
          return;
        }
        await writeAll(directory, ctx.validated, false);
      } catch (err) {
        set({ busy: null, lastError: reportFailure("Model", err) });
      }
    },

    confirmOverwrite: async () => {
      const pending = get().pendingOverwrite;
      if (!pending) return;
      set({ busy: "all", pendingOverwrite: null });
      await writeAll(pending.directory, pending.artifacts, true);
    },

    cancelOverwrite: () => set({ pendingOverwrite: null }),

    reset: () => set({ busy: null, lastExport: {}, lastError: null, pendingOverwrite: null }),
  };
});
