import { cn } from "@/utils/cn";

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={cn("animate-spin-slow", className)}
      role="status"
      aria-label="Loading"
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.75" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

interface ProgressBarProps {
  /** 0..1. Omit for an indeterminate bar. */
  value?: number;
  className?: string;
  tone?: "accent" | "danger" | "success";
  label?: string;
}

const TONES = { accent: "bg-accent", danger: "bg-danger", success: "bg-success" };

export function ProgressBar({ value, className, tone = "accent", label }: ProgressBarProps) {
  const determinate = typeof value === "number";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? Math.round(value * 100) : undefined}
      className={cn("relative h-1 w-full overflow-hidden rounded-full bg-active", className)}
    >
      {determinate ? (
        <div
          className={cn("h-full rounded-full transition-[width] duration-200", TONES[tone])}
          style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        />
      ) : (
        <div className={cn("absolute inset-y-0 w-1/3 rounded-full", TONES[tone])} style={{ animation: "progress-indeterminate 1.3s ease-in-out infinite" }} />
      )}
    </div>
  );
}

interface SegmentsProps {
  total: number;
  completed: number;
  active: boolean;
  failed?: boolean;
  className?: string;
}

/**
 * Stage-level progress: one segment per pipeline stage. Used instead of a
 * percentage because the backend reports stages, not fractions.
 */
export function StageSegments({ total, completed, active, failed, className }: SegmentsProps) {
  return (
    <div className={cn("flex gap-1", className)} aria-hidden>
      {Array.from({ length: total }, (_, i) => {
        const done = i < completed;
        const current = i === completed;
        return (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              done ? "bg-accent" : "bg-active",
              current && active && "animate-pulse-soft bg-accent/60",
              current && failed && "bg-danger",
            )}
          />
        );
      })}
    </div>
  );
}
