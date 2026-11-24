/**
 * Cross-store workflow actions triggered from several places in the UI
 * (header, sidebar, empty state, drag-and-drop, keyboard shortcuts).
 */
import { create } from "zustand";
import { services } from "@/services";
import type { DrawingSource } from "@/types/drawing";
import { toAppError } from "@/utils/errors";
import { useGenerationStore } from "./generationStore";
import { useProjectStore } from "./projectStore";
import { toast } from "./toastStore";

interface WorkflowState {
  /** Upload waiting for the user to confirm replacing a generated model. */
  pendingReplace: DrawingSource | null;
  confirmRemove: boolean;
}

export const useWorkflowStore = create<WorkflowState>(() => ({ pendingReplace: null, confirmRemove: false }));

function blockedByGeneration(): boolean {
  if (useGenerationStore.getState().isBusy()) {
    toast.warning("Generation in progress", { description: "Cancel the current generation first." });
    return true;
  }
  return false;
}

/** Uploads immediately, or asks first when it would discard a generated model. */
export function requestUpload(source: DrawingSource): void {
  if (blockedByGeneration()) return;
  const { project } = useProjectStore.getState();
  const hasModel = Boolean(useGenerationStore.getState().result);
  if (project?.drawing && hasModel) {
    useWorkflowStore.setState({ pendingReplace: source });
    return;
  }
  void useProjectStore.getState().uploadDrawing(source);
}

export async function pickAndUpload(): Promise<void> {
  if (blockedByGeneration()) return;
  try {
    const source = await services.files.pick();
    if (source) requestUpload(source);
  } catch (err) {
    toast.error("Could not open the file picker", { description: toAppError(err).message });
  }
}

export async function confirmReplace(): Promise<void> {
  const source = useWorkflowStore.getState().pendingReplace;
  useWorkflowStore.setState({ pendingReplace: null });
  if (source) await useProjectStore.getState().uploadDrawing(source);
}

export function cancelReplace(): void {
  useWorkflowStore.setState({ pendingReplace: null });
}

export function requestRemoveDrawing(): void {
  if (blockedByGeneration()) return;
  useWorkflowStore.setState({ confirmRemove: true });
}

export function startNewProject(): void {
  if (blockedByGeneration()) return;
  useProjectStore.getState().newProject();
}
