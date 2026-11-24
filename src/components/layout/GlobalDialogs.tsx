import { FileUp } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { RecentProjectsDialog } from "@/components/history/RecentProjectsDialog";
import type { DropState } from "@/hooks/useDrawingDrop";
import { useExportStore } from "@/stores/exportStore";
import { useProjectStore } from "@/stores/projectStore";
import { cancelReplace, confirmReplace, useWorkflowStore } from "@/stores/workflow";
import { cn } from "@/utils/cn";
import { HelpDialog, PrivacyDialog } from "./HelpDialogs";

export function GlobalDialogs() {
  const pendingReplace = useWorkflowStore((s) => s.pendingReplace);
  const confirmRemove = useWorkflowStore((s) => s.confirmRemove);
  const removeDrawing = useProjectStore((s) => s.removeDrawing);
  const hasModel = useProjectStore((s) => s.project?.generationStatus === "succeeded");
  const overwrite = useExportStore((s) => s.pendingOverwrite);
  const confirmOverwrite = useExportStore((s) => s.confirmOverwrite);
  const cancelOverwrite = useExportStore((s) => s.cancelOverwrite);
  const [removing, setRemoving] = useState(false);

  return (
    <>
      <HelpDialog />
      <PrivacyDialog />
      <RecentProjectsDialog />

      <ConfirmDialog
        open={pendingReplace !== null}
        onOpenChange={(o) => !o && cancelReplace()}
        title="Replace the drawing?"
        description={`“${pendingReplace?.fileName ?? ""}” will replace the current drawing. The generated model belongs to the old drawing and will be cleared from this project.`}
        confirmLabel="Replace drawing"
        destructive
        onConfirm={() => void confirmReplace()}
      />

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={(o) => !o && useWorkflowStore.setState({ confirmRemove: false })}
        title="Remove the drawing?"
        description={
          hasModel
            ? "The PDF and the generated model files are removed from this project. The project itself is kept."
            : "The PDF is removed from this project. The project itself is kept."
        }
        confirmLabel="Remove drawing"
        destructive
        busy={removing}
        onConfirm={async () => {
          setRemoving(true);
          await removeDrawing();
          setRemoving(false);
          useWorkflowStore.setState({ confirmRemove: false });
        }}
      />

      <ConfirmDialog
        open={overwrite !== null}
        onOpenChange={(o) => !o && cancelOverwrite()}
        title="Replace existing files?"
        description={`${overwrite?.files.join(", ") ?? "Some files"} already ${overwrite && overwrite.files.length > 1 ? "exist" : "exists"} in “${overwrite?.directory.split("/").pop() ?? ""}”.`}
        confirmLabel="Replace"
        destructive
        onConfirm={() => void confirmOverwrite()}
      />
    </>
  );
}

export function DropOverlay({ state }: { state: DropState }) {
  if (state === "idle") return null;
  const invalid = state === "invalid";
  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex animate-fade-in items-center justify-center bg-app/70 p-8 backdrop-blur-[2px]">
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed",
          invalid ? "border-danger/70 bg-danger-soft/40" : "border-accent bg-accent-soft/50",
        )}
      >
        <div className={cn("flex size-12 items-center justify-center rounded-xl bg-elevated shadow-popover", invalid ? "text-danger" : "text-accent")}>
          <FileUp size={22} />
        </div>
        <p className="text-lg font-semibold text-fg">{invalid ? "Drop a single PDF drawing" : "Drop to upload drawing"}</p>
        <p className="text-sm text-fg-muted">{invalid ? "Only one .pdf file is supported per project." : "The PDF is copied into the current project."}</p>
      </div>
    </div>
  );
}
