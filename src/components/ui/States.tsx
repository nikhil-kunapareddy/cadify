import { AlertOctagon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Spinner } from "./ProgressIndicator";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-10", className)}>
      {icon && (
        <div
          className={cn(
            "flex items-center justify-center rounded-xl border border-line bg-panel text-fg-subtle shadow-xs",
            compact ? "size-9" : "size-11",
          )}
        >
          {icon}
        </div>
      )}
      <div className="max-w-[320px]">
        <p className={cn("font-medium text-fg", compact ? "text-sm" : "text-base")}>{title}</p>
        {description && <p className={cn("mt-1 text-fg-subtle", compact ? "text-xs" : "text-sm")}>{description}</p>}
      </div>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  title: string;
  description?: ReactNode;
  detail?: string;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({ title, description, detail, action, className }: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-10 text-center", className)} role="alert">
      <div className="flex size-11 items-center justify-center rounded-xl border border-danger/25 bg-danger-soft text-danger">
        <AlertOctagon size={20} />
      </div>
      <div className="max-w-[380px]">
        <p className="text-base font-medium text-fg">{title}</p>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
        {detail && <p className="mt-2 font-mono text-xs break-words text-fg-subtle" data-selectable>{detail}</p>}
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 text-fg-subtle", className)} role="status">
      <Spinner size={18} />
      <p className="text-sm">{label}</p>
    </div>
  );
}
