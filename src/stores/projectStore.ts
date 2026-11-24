import { create } from "zustand";
import { services } from "@/services";
import { closePdf, openPdf, readMetadata, renderThumbnail, type PdfDocument } from "@/services/pdf/pdfService";
import type { DrawingDocument, DrawingSource } from "@/types/drawing";
import type { AppError } from "@/types/errors";
import type { Project, ProjectSummary } from "@/types/project";
import { errorCopy, toAppError } from "@/utils/errors";
import { projectNameFromFile } from "@/utils/format";
import { useGenerationStore } from "./generationStore";
import { toast } from "./toastStore";
import { useUiStore } from "./uiStore";

export type DrawingLoadPhase = "idle" | "reading" | "parsing" | "rendering" | "saving" | "ready" | "error";

export interface DrawingLoadState {
  phase: DrawingLoadPhase;
  fileName?: string;
  sizeBytes?: number;
  /** Real read progress (0..1) when the platform reports it. */
  progress?: number;
  error?: AppError;
}

export type PersistState = "saved" | "saving" | "unsaved" | "error";

interface ProjectState {
  project: Project | null;
  pdf: PdfDocument | null;
  page: number;
  load: DrawingLoadState;
  persist: PersistState;
  recent: ProjectSummary[];
  recentLoaded: boolean;
  opening: string | null;

  refreshRecent: () => Promise<void>;
  newProject: () => void;
  uploadDrawing: (source: DrawingSource) => Promise<boolean>;
  removeDrawing: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<boolean>;
  deleteProject: (id: string) => Promise<boolean>;
  revealProject: (id: string) => Promise<void>;
  setPage: (page: number) => void;
  setProject: (project: Project) => void;
  clearLoadError: () => void;
}

const basePersist = (): PersistState => (services.projects.persistent ? "saved" : "unsaved");

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  pdf: null,
  page: 1,
  load: { phase: "idle" },
  persist: basePersist(),
  recent: [],
  recentLoaded: false,
  opening: null,

  refreshRecent: async () => {
    try {
      const recent = await services.projects.list();
      set({ recent, recentLoaded: true });
    } catch (err) {
      set({ recentLoaded: true });
      const e = toAppError(err, "STORAGE_ERROR");
      toast.error("Could not load recent projects", { description: e.message });
    }
  },

  newProject: () => {
    const { pdf } = get();
    void closePdf(pdf);
    useGenerationStore.getState().reset();
    set({ project: null, pdf: null, page: 1, load: { phase: "idle" }, persist: basePersist() });
    useUiStore.getState().setWorkspaceMode("drawing");
    useUiStore.getState().navigate("workspace");
  },

  uploadDrawing: async (source) => {
    const fileName = source.fileName;
    set({ load: { phase: "reading", fileName } });
    let doc: PdfDocument | null = null;
    try {
      const { bytes, sizeBytes } = await services.files.read(source, (progress) =>
        set((s) => ({ load: { ...s.load, progress } })),
      );
      set({ load: { phase: "parsing", fileName, sizeBytes } });
      doc = await openPdf(bytes);
      const metadata = await readMetadata(doc);

      set({ load: { phase: "rendering", fileName, sizeBytes } });
      const thumbnail = await renderThumbnail(doc, 1, 360).catch(() => undefined);

      set({ load: { phase: "saving", fileName, sizeBytes }, persist: "saving" });
      const drawing: DrawingDocument = { ...metadata, fileName, sizeBytes, importedAt: new Date().toISOString() };
      const existing = get().project;
      const target = existing ?? (await services.projects.create(projectNameFromFile(fileName)));
      const project = await services.projects.attachDrawing(target.id, { source, drawing, bytes, thumbnail });

      void closePdf(get().pdf);
      useGenerationStore.getState().reset();
      set({ project, pdf: doc, page: 1, load: { phase: "ready" }, persist: basePersist() });
      useUiStore.getState().setWorkspaceMode("drawing");
      useUiStore.getState().navigate("workspace");
      toast.success("Drawing uploaded successfully", {
        description: `${fileName} · ${metadata.pageCount} ${metadata.pageCount === 1 ? "page" : "pages"}`,
      });
      void get().refreshRecent();
      return true;
    } catch (err) {
      void closePdf(doc);
      const error = toAppError(err, "PDF_CORRUPTED");
      const hasDrawing = Boolean(get().project?.drawing);
      set({ load: hasDrawing ? { phase: "ready" } : { phase: "error", fileName, error }, persist: basePersist() });
      // The dropzone shows the error inline when visible; otherwise notify.
      if (hasDrawing) {
        toast.error(errorCopy(error.code).title, { description: errorCopy(error.code).description });
      }
      return false;
    }
  },

  removeDrawing: async () => {
    const { project, pdf } = get();
    if (!project) return;
    try {
      set({ persist: "saving" });
      const updated = await services.projects.removeDrawing(project.id);
      void closePdf(pdf);
      useGenerationStore.getState().reset();
      set({ project: updated, pdf: null, page: 1, load: { phase: "idle" }, persist: basePersist() });
      useUiStore.getState().setWorkspaceMode("drawing");
      toast.info("Drawing removed");
      void get().refreshRecent();
    } catch (err) {
      set({ persist: "error" });
      toast.error("Could not remove the drawing", { description: toAppError(err).message });
    }
  },

  openProject: async (id) => {
    if (useGenerationStore.getState().isBusy()) {
      toast.warning("Generation in progress", { description: "Cancel the current generation before opening another project." });
      return;
    }
    set({ opening: id });
    let doc: PdfDocument | null = null;
    try {
      const project = await services.projects.get(id);
      if (project.drawing) {
        const bytes = await services.projects.readDrawing(id);
        doc = await openPdf(bytes);
      }
      void closePdf(get().pdf);
      set({ project, pdf: doc, page: 1, load: { phase: doc ? "ready" : "idle" }, persist: basePersist(), opening: null });
      const gen = useGenerationStore.getState();
      gen.loadFromProject(project);
      const hasModel = Boolean(project.generation) && project.availableFormats.length > 0;
      useUiStore.getState().setWorkspaceMode(hasModel ? "model" : "drawing");
      useUiStore.getState().navigate("workspace");
      useUiStore.getState().closeDialog();
      toast.info(`Opened “${project.name}”`, {
        description: hasModel ? "Model and drawing restored" : project.drawing ? "Drawing restored" : "No drawing yet",
      });
    } catch (err) {
      void closePdf(doc);
      set({ opening: null });
      const e = toAppError(err, "PROJECT_NOT_FOUND");
      toast.error("Could not open project", { description: e.message });
    }
  },

  renameProject: async (id, name) => {
    try {
      const updated = await services.projects.rename(id, name);
      if (get().project?.id === id) set({ project: { ...get().project!, name: updated.name, updatedAt: updated.updatedAt } });
      await get().refreshRecent();
      return true;
    } catch (err) {
      toast.error("Could not rename project", { description: toAppError(err).message });
      return false;
    }
  },

  deleteProject: async (id) => {
    try {
      await services.projects.remove(id);
      if (get().project?.id === id) get().newProject();
      await get().refreshRecent();
      toast.info(services.projects.persistent ? "Project moved to Trash" : "Project deleted");
      return true;
    } catch (err) {
      toast.error("Could not delete project", { description: toAppError(err).message });
      return false;
    }
  },

  revealProject: async (id) => {
    try {
      await services.projects.reveal(id);
    } catch (err) {
      toast.error("Could not reveal in Finder", { description: toAppError(err).message });
    }
  },

  setPage: (page) => {
    const count = get().pdf?.numPages ?? 1;
    set({ page: Math.min(Math.max(1, page), count) });
  },

  setProject: (project) => set({ project }),

  clearLoadError: () => set((s) => (s.load.phase === "error" ? { load: { phase: "idle" } } : s)),
}));
