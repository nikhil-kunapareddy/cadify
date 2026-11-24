import { AlertTriangle, Check, X } from "lucide-react";
import { Spinner } from "@/components/ui/ProgressIndicator";
import { useExportStore } from "@/stores/exportStore";
import { useGenerationStore } from "@/stores/generationStore";
import { useProjectStore } from "@/stores/projectStore";
import { cn } from "@/utils/cn";

type StepState = "pending" | "current" | "active" | "complete" | "error" | "attention";

interface Step {
  label: string;
  state: StepState;
}

function useSteps(): Step[] {
  const hasDrawing = useProjectStore((s) => Boolean(s.project?.drawing && s.pdf));
  const loading = useProjectStore((s) => ["reading", "parsing", "rendering", "saving"].includes(s.load.phase));
  const status = useGenerationStore((s) => s.status);
  const hasResult = useGenerationStore((s) => Boolean(s.result));
  const exported = useExportStore((s) => Object.keys(s.lastExport).length > 0);

  const upload: StepState = loading ? "active" : hasDrawing ? "complete" : "current";
  let generate: StepState = "pending";
  if (hasDrawing) {
    if (status === "running") generate = "active";
    else if (status === "clarification") generate = "attention";
    else if (status === "failed" && !hasResult) generate = "error";
    else if (hasResult) generate = "complete";
    else generate = "current";
  }
  const preview: StepState = hasResult && status !== "running" ? (exported ? "complete" : "current") : "pending";
  const exportStep: StepState = hasResult ? (exported ? "complete" : "current") : "pending";
  return [
    { label: loading ? "Uploading" : "Upload", state: upload },
    {
      label:
        generate === "active" ? "Generating" : generate === "attention" ? "Needs input" : generate === "error" ? "Failed" : "Generate",
      state: generate,
    },
    { label: "Preview", state: preview },
    { label: "Export", state: exportStep },
  ];
}

function StepIcon({ state, index }: { state: StepState; index: number }) {
  const base = "flex size-4 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold";
  switch (state) {
    case "complete":
      return (
        <span className={cn(base, "bg-accent text-accent-fg")}>
          <Check size={10} strokeWidth={3} />
        </span>
      );
    case "active":
      return (
        <span className={cn(base, "text-accent")}>
          <Spinner size={14} />
        </span>
      );
    case "error":
      return (
        <span className={cn(base, "bg-danger text-white")}>
          <X size={10} strokeWidth={3} />
        </span>
      );
    case "attention":
      return (
        <span className={cn(base, "bg-warning text-black")}>
          <AlertTriangle size={9} strokeWidth={2.5} />
        </span>
      );
    case "current":
      return <span className={cn(base, "bg-accent-soft text-accent ring-1 ring-accent-line")}>{index + 1}</span>;
    default:
      return <span className={cn(base, "text-fg-faint ring-1 ring-line-strong")}>{index + 1}</span>;
  }
}

/** Compact Upload → Generate → Preview → Export indicator for the header. */
export function WorkflowStepper() {
  const steps = useSteps();
  return (
    <ol className="flex items-center gap-1.5" aria-label="Workflow progress">
      {steps.map((step, i) => (
        <li key={step.label + i} className="flex items-center gap-1.5">
          {i > 0 && <span className={cn("h-px w-5", step.state === "pending" ? "bg-line-strong" : "bg-accent-line")} aria-hidden />}
          <div className="flex items-center gap-1.5" aria-current={step.state === "current" || step.state === "active" ? "step" : undefined}>
            <StepIcon state={step.state} index={i} />
            <span
              className={cn(
                "text-xs font-medium whitespace-nowrap",
                step.state === "pending" && "text-fg-faint",
                (step.state === "current" || step.state === "active") && "text-fg",
                step.state === "complete" && "text-fg-muted",
                step.state === "error" && "text-danger",
                step.state === "attention" && "text-warning",
              )}
            >
              {step.label}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
