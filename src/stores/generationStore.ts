import { create } from "zustand";
import { GENERATION_STAGES } from "@/config/app";
import { services } from "@/services";
import type { GenerationHandle } from "@/services/contracts";
import type { AppError } from "@/types/errors";
import type {
  ClarificationAnswer,
  ClarificationRequest,
  ExportFormat,
  GenerationEvent,
  GenerationResult,
  GenerationWarning,
  OutputSelection,
  StageId,
  StageState,
} from "@/types/generation";
import type { Project } from "@/types/project";
import { errorCopy, needsSettings, toAppError } from "@/utils/errors";
import { useProjectStore } from "./projectStore";
import { toast } from "./toastStore";
import { useUiStore } from "./uiStore";

export type RunStatus = "idle" | "running" | "clarification" | "succeeded" | "failed" | "cancelled";

export interface PreviewState {
  status: "idle" | "loading" | "ready" | "error";
  bytes?: Uint8Array;
  /** Identifies which result the bytes belong to. */
  runId?: string;
  error?: AppError;
}

interface GenerationState {
  outputs: OutputSelection;
  status: RunStatus;
  runId: string | null;
  handle: GenerationHandle | null;
  stages: Record<StageId, StageState>;
  activeStage: StageId | null;
  startedAt: number | null;
  finishedAt: number | null;
  error: AppError | null;
  failedStage: StageId | null;
  clarification: ClarificationRequest | null;
  submittingAnswers: boolean;
  warnings: GenerationWarning[];
  result: GenerationResult | null;
  /** Whether the dedicated generation view is shown in the workspace. */
  showRun: boolean;
  preview: PreviewState;

  setOutputs: (outputs: OutputSelection) => void;
  start: () => Promise<void>;
  cancel: () => Promise<void>;
  answer: (answers: ClarificationAnswer[]) => Promise<void>;
  dismissRun: () => void;
  reset: () => void;
  loadFromProject: (project: Project) => void;
  loadPreview: () => Promise<void>;
  isBusy: () => boolean;
}

export function freshStages(): Record<StageId, StageState> {
  return Object.fromEntries(GENERATION_STAGES.map((s) => [s.id, { status: "waiting" }])) as Record<StageId, StageState>;
}

export function selectedFormats(outputs: OutputSelection): ExportFormat[] {
  return outputs === "both" ? ["step", "stl"] : [outputs];
}

export const useGenerationStore = create<GenerationState>((set, get) => {
  const updateStage = (id: StageId, patch: Partial<StageState>) =>
    set((s) => ({ stages: { ...s.stages, [id]: { ...s.stages[id], ...patch } } }));

  const handleEvent = (runId: string, event: GenerationEvent) => {
    if (get().runId !== runId) return; // stale run
    const now = Date.now();
    switch (event.type) {
      case "stage_started":
        updateStage(event.stage, { status: "active", startedAt: now, detail: event.detail });
        set({ activeStage: event.stage });
        break;
      case "stage_progress":
        updateStage(event.stage, { progress: event.progress, ...(event.detail ? { detail: event.detail } : {}) });
        break;
      case "stage_completed":
        updateStage(event.stage, { status: "completed", finishedAt: now, detail: event.detail, progress: undefined });
        if (get().status === "clarification") set({ status: "running", clarification: null });
        break;
      case "warning":
        set((s) => ({ warnings: [...s.warnings, event.warning] }));
        break;
      case "clarification_required":
        set({ status: "clarification", clarification: event.request, submittingAnswers: false });
        break;
      case "completed":
        void onCompleted(runId, event.result);
        break;
      case "failed": {
        const failedStage = event.stage ?? get().activeStage;
        if (failedStage) updateStage(failedStage, { status: "failed", finishedAt: now });
        set({ status: "failed", error: event.error, failedStage, finishedAt: now, handle: null, clarification: null });
        const project = useProjectStore.getState().project;
        if (project) {
          void services.projects
            .recordGeneration(project.id, "failed")
            .then((p) => useProjectStore.getState().setProject({ ...p, generation: get().result ?? p.generation }))
            .catch(() => undefined);
        }
        // The generation view already shows the error inline; only notify
        // when the user has navigated away from it.
        if (useUiStore.getState().view === "workspace") break;
        const copy = errorCopy(event.error.code);
        toast.error(event.error.message || copy.title, {
          description: copy.description,
          action: needsSettings(event.error.code)
            ? { label: "Open Settings", onClick: () => useUiStore.getState().navigate("settings", "ai") }
            : { label: "Retry", onClick: () => void get().start() },
        });
        break;
      }
      case "cancelled": {
        const hadResult = Boolean(get().result);
        set({ status: hadResult ? "succeeded" : "cancelled", handle: null, showRun: false, clarification: null, finishedAt: now });
        useUiStore.getState().setWorkspaceMode(hadResult ? "model" : "drawing");
        toast.info("Generation cancelled", { description: hadResult ? "The previous model is unchanged." : undefined });
        break;
      }
    }
  };

  const onCompleted = async (runId: string, result: GenerationResult) => {
    const project = useProjectStore.getState().project;
    set({ status: "succeeded", result, finishedAt: Date.now(), handle: null, activeStage: null });
    if (project) {
      try {
        const updated = await services.projects.recordGeneration(project.id, "succeeded", result);
        useProjectStore.getState().setProject(updated);
        void useProjectStore.getState().refreshRecent();
      } catch (err) {
        useProjectStore.setState({ persist: "error" });
        toast.error("Model generated but not saved", { description: toAppError(err).message });
      }
    }
    if (get().runId !== runId) return;
    set({ showRun: false });
    const wide = window.innerWidth >= 1500;
    useUiStore.getState().setWorkspaceMode(wide ? "split" : "model");
    void get().loadPreview();
    toast.success("3D model generated", {
      description: `${result.features.reduce((n, f) => n + f.count, 0)} features · ${result.artifacts
        .map((a) => a.format.toUpperCase())
        .join(" + ")} ready to export`,
    });
    if (result.warnings.length > 0) {
      toast.warning(result.warnings.length === 1 ? "1 warning" : `${result.warnings.length} warnings`, {
        description: result.warnings[0]?.message,
      });
    }
  };

  return {
    outputs: "both",
    status: "idle",
    runId: null,
    handle: null,
    stages: freshStages(),
    activeStage: null,
    startedAt: null,
    finishedAt: null,
    error: null,
    failedStage: null,
    clarification: null,
    submittingAnswers: false,
    warnings: [],
    result: null,
    showRun: false,
    preview: { status: "idle" },

    setOutputs: (outputs) => set({ outputs }),

    isBusy: () => get().status === "running" || get().status === "clarification",

    start: async () => {
      const { project } = useProjectStore.getState();
      if (!project?.drawing || get().isBusy()) return;
      const runIdPlaceholder = `pending-${Date.now()}`;
      set({
        status: "running",
        runId: runIdPlaceholder,
        handle: null,
        stages: freshStages(),
        activeStage: null,
        startedAt: Date.now(),
        finishedAt: null,
        error: null,
        failedStage: null,
        clarification: null,
        warnings: [],
        showRun: true,
      });
      useUiStore.getState().navigate("workspace");
      try {
        let realRunId: string | null = null;
        const queued: GenerationEvent[] = [];
        const handle = await services.generation.start(
          {
            projectId: project.id,
            outputs: selectedFormats(get().outputs),
            drawingFileName: project.drawing.fileName,
            pageCount: project.drawing.pageCount,
            modelName: project.name,
          },
          (event) => {
            if (realRunId === null) queued.push(event);
            else handleEvent(realRunId, event);
          },
        );
        if (get().runId !== runIdPlaceholder) {
          // The user cancelled before the backend acknowledged the run.
          void handle.cancel();
          return;
        }
        realRunId = handle.runId;
        set({ runId: handle.runId, handle });
        for (const event of queued.splice(0)) handleEvent(handle.runId, event);
      } catch (err) {
        const error = toAppError(err);
        set({ status: "failed", error, finishedAt: Date.now() });
        toast.error(errorCopy(error.code).title, { description: error.message });
      }
    },

    cancel: async () => {
      const { handle, status } = get();
      if (status !== "running" && status !== "clarification") return;
      if (!handle) {
        // Not yet acknowledged; invalidate the pending run.
        const hadResult = Boolean(get().result);
        set({ runId: null, status: hadResult ? "succeeded" : "cancelled", showRun: false });
        return;
      }
      try {
        await handle.cancel();
      } catch (err) {
        toast.error("Could not cancel generation", { description: toAppError(err).message });
      }
    },

    answer: async (answers) => {
      const { handle } = get();
      if (!handle) return;
      set({ submittingAnswers: true });
      try {
        await handle.answer(answers);
      } catch (err) {
        set({ submittingAnswers: false });
        toast.error("Could not submit answers", { description: toAppError(err).message });
      }
    },

    dismissRun: () => {
      const hasResult = Boolean(get().result);
      set({ showRun: false });
      useUiStore.getState().setWorkspaceMode(hasResult ? "model" : "drawing");
    },

    reset: () => {
      const { handle } = get();
      if (handle && get().isBusy()) void handle.cancel();
      set({
        status: "idle",
        runId: null,
        handle: null,
        stages: freshStages(),
        activeStage: null,
        startedAt: null,
        finishedAt: null,
        error: null,
        failedStage: null,
        clarification: null,
        warnings: [],
        result: null,
        showRun: false,
        preview: { status: "idle" },
      });
    },

    loadFromProject: (project) => {
      get().reset();
      // A failed or cancelled rerun keeps the previous model available.
      if (project.generation) {
        const result = project.generation;
        const formats = result.artifacts.map((a) => a.format);
        set({
          status: project.generationStatus === "failed" ? "failed" : "succeeded",
          result,
          runId: result.runId,
          warnings: result.warnings,
          outputs: formats.length === 2 ? "both" : (formats[0] ?? "both"),
        });
        void get().loadPreview();
      } else if (project.generationStatus === "failed") {
        set({ status: "failed", showRun: false });
      }
    },

    loadPreview: async () => {
      const { result } = get();
      const project = useProjectStore.getState().project;
      if (!result || !project) return;
      if (get().preview.status === "ready" && get().preview.runId === result.runId) return;
      set({ preview: { status: "loading", runId: result.runId } });
      try {
        const bytes = await services.projects.readArtifact(project.id, "preview");
        if (get().result?.runId !== result.runId) return;
        set({ preview: { status: "ready", bytes, runId: result.runId } });
      } catch (err) {
        set({ preview: { status: "error", runId: result.runId, error: toAppError(err, "ARTIFACT_NOT_FOUND") } });
      }
    },
  };
});
