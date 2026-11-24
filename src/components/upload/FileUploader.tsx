import { AlertCircle, FileText, FileUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProgressBar, StageSegments } from "@/components/ui/ProgressIndicator";
import type { DropState } from "@/hooks/useDrawingDrop";
import { MAX_DRAWING_BYTES } from "@/config/app";
import { useProjectStore, type DrawingLoadPhase } from "@/stores/projectStore";
import { pickAndUpload } from "@/stores/workflow";
import { cn } from "@/utils/cn";
import { errorCopy } from "@/utils/errors";
import { formatBytes } from "@/utils/format";

const STEPS: Array<{ phase: DrawingLoadPhase; label: string }> = [
  { phase: "reading", label: "Reading file" },
  { phase: "parsing", label: "Validating PDF" },
  { phase: "rendering", label: "Rendering preview" },
  { phase: "saving", label: "Saving to project" },
];

interface FileUploaderProps {
  dropState: DropState;
}

/** Large drop target with inline progress and error states. */
export function FileUploader({ dropState }: FileUploaderProps) {
  const load = useProjectStore((s) => s.load);
  const clearLoadError = useProjectStore((s) => s.clearLoadError);
  const stepIndex = STEPS.findIndex((s) => s.phase === load.phase);
  const busy = stepIndex >= 0;

  if (busy) {
    const step = STEPS[stepIndex]!;
    return (
      <div className="flex h-[188px] w-full flex-col justify-center rounded-xl border border-line-strong bg-panel px-6" role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-9 shrink-0 items-center justify-center rounded-[4px] bg-danger-soft text-danger">
            <FileText size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-medium text-fg">{load.fileName}</p>
            <p className="text-sm text-fg-subtle">
              {step.label}…{load.sizeBytes ? ` · ${formatBytes(load.sizeBytes)}` : ""}
            </p>
          </div>
          <span className="tabular text-xs text-fg-subtle">
            Step {stepIndex + 1} of {STEPS.length}
          </span>
        </div>
        <div className="mt-4">
          {load.phase === "reading" && typeof load.progress === "number" ? (
            <ProgressBar value={load.progress} label="Reading file" />
          ) : (
            <StageSegments total={STEPS.length} completed={stepIndex} active />
          )}
        </div>
      </div>
    );
  }

  if (load.phase === "error" && load.error) {
    const copy = errorCopy(load.error.code);
    return (
      <div className="flex h-[188px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-danger/40 bg-danger-soft/40 px-6 text-center" role="alert">
        <AlertCircle size={22} className="text-danger" />
        <div>
          <p className="text-base font-medium text-fg">{copy.title}</p>
          <p className="mt-0.5 max-w-[420px] text-sm text-fg-muted">
            {load.fileName && <span className="text-fg">“{load.fileName}”. </span>}
            {copy.description}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={clearLoadError}>
            Dismiss
          </Button>
          <Button size="sm" onClick={() => void pickAndUpload()}>
            Choose another file
          </Button>
        </div>
      </div>
    );
  }

  const over = dropState !== "idle";
  const invalid = dropState === "invalid";
  return (
    <div
      className={cn(
        "flex h-[188px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 text-center transition-colors duration-150",
        over && !invalid && "border-accent bg-accent-soft",
        invalid && "border-danger bg-danger-soft/50",
        !over && "border-line-strong bg-panel/60 hover:border-fg-faint",
      )}
    >
      <div
        className={cn(
          "flex size-11 items-center justify-center rounded-xl border bg-panel shadow-xs",
          over && !invalid ? "border-accent-line text-accent" : invalid ? "border-danger/40 text-danger" : "border-line text-fg-muted",
        )}
      >
        <FileUp size={20} />
      </div>
      <div>
        <p className="text-base font-medium text-fg">
          {invalid ? "Only a single PDF can be dropped" : over ? "Release to upload" : "Drop your engineering drawing here."}
        </p>
        <p className="mt-0.5 text-sm text-fg-subtle">PDF files supported · up to {formatBytes(MAX_DRAWING_BYTES)}</p>
      </div>
      <Button size="sm" onClick={() => void pickAndUpload()}>
        Browse Files
      </Button>
    </div>
  );
}
