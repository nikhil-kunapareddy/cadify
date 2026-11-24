import { Check, Circle, X } from "lucide-react";
import { GENERATION_STAGES } from "@/config/app";
import { Spinner } from "@/components/ui/ProgressIndicator";
import { ProgressBar } from "@/components/ui/ProgressIndicator";
import type { StageId, StageState } from "@/types/generation";
import { cn } from "@/utils/cn";
import { formatDuration } from "@/utils/format";

function StatusIcon({ state, paused }: { state: StageState; paused: boolean }) {
  switch (state.status) {
    case "completed":
      return (
        <span className="flex size-5 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Check size={12} strokeWidth={2.75} />
        </span>
      );
    case "active":
      return paused ? (
        <span className="flex size-5 items-center justify-center rounded-full bg-warning-soft text-warning ring-1 ring-warning/30">
          <span className="text-[11px] font-bold">?</span>
        </span>
      ) : (
        <span className="flex size-5 items-center justify-center text-accent">
          <Spinner size={16} />
        </span>
      );
    case "failed":
      return (
        <span className="flex size-5 items-center justify-center rounded-full bg-danger text-white">
          <X size={12} strokeWidth={2.75} />
        </span>
      );
    default:
      return (
        <span className="flex size-5 items-center justify-center text-fg-faint">
          <Circle size={14} strokeWidth={1.5} />
        </span>
      );
  }
}

const STATUS_TEXT = { waiting: "Waiting", active: "In progress", completed: "Completed", failed: "Failed" } as const;

interface StageListProps {
  stages: Record<StageId, StageState>;
  now: number;
  paused: boolean;
  dense?: boolean;
}

export function StageList({ stages, now, paused, dense }: StageListProps) {
  return (
    <ol className="relative" aria-label="Generation stages">
      {GENERATION_STAGES.map((def, i) => {
        const state = stages[def.id];
        const isLast = i === GENERATION_STAGES.length - 1;
        const duration =
          state.startedAt && (state.finishedAt ?? (state.status === "active" ? now : undefined))
            ? (state.finishedAt ?? now) - state.startedAt
            : null;
        const showDescription = !dense || state.status === "active" || state.status === "failed";
        return (
          <li key={def.id} className="relative flex gap-3">
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-[22px] bottom-[-2px] left-[9.5px] w-px",
                  state.status === "completed" ? "bg-accent-line" : "bg-line-strong",
                )}
              />
            )}
            <div className="relative z-10 mt-[1px] shrink-0 bg-elevated">
              <StatusIcon state={state} paused={paused && state.status === "active"} />
            </div>
            <div className={cn("min-w-0 flex-1", dense ? "pb-2.5" : "pb-3.5")}>
              <div className="flex items-baseline justify-between gap-3">
                <p
                  className={cn(
                    "text-base",
                    state.status === "waiting" && "text-fg-subtle",
                    state.status === "active" && "font-medium text-fg",
                    state.status === "completed" && "text-fg-muted",
                    state.status === "failed" && "font-medium text-danger",
                  )}
                >
                  {def.label}
                </p>
                <span
                  className={cn(
                    "tabular shrink-0 text-xs",
                    state.status === "active" ? (paused ? "text-warning" : "text-accent") : "text-fg-subtle",
                    state.status === "failed" && "text-danger",
                  )}
                >
                  {state.status === "active" && paused
                    ? "Waiting for input"
                    : state.status === "completed" && duration !== null
                      ? formatDuration(duration)
                      : state.status === "waiting"
                        ? ""
                        : STATUS_TEXT[state.status]}
                  <span className="sr-only">{STATUS_TEXT[state.status]}</span>
                </span>
              </div>
              {showDescription && (
                <p className="mt-0.5 text-sm text-fg-subtle">{state.detail && state.status !== "waiting" ? state.detail : def.description}</p>
              )}
              {dense && state.status === "completed" && state.detail && (
                <p className="mt-0.5 text-xs text-fg-subtle">{state.detail}</p>
              )}
              {state.status === "active" && typeof state.progress === "number" && (
                <ProgressBar value={state.progress} className="mt-2" label={`${def.label} progress`} />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
