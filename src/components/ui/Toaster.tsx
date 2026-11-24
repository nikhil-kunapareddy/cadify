import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToastStore, type Toast, type ToastKind } from "@/stores/toastStore";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/utils/cn";
import { Button } from "./Button";

const ICONS: Record<ToastKind, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "text-success" },
  error: { icon: XCircle, className: "text-danger" },
  warning: { icon: AlertTriangle, className: "text-warning" },
  info: { icon: Info, className: "text-accent" },
};

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.duration);
  const startedAt = useRef(0);

  useEffect(() => {
    if (toast.duration === 0 || paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => dismiss(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, toast.id, toast.duration, dismiss]);

  const { icon: Icon, className } = ICONS[toast.kind];
  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto flex w-[360px] animate-slide-up items-start gap-2.5 rounded-lg bg-elevated py-2.5 pr-2 pl-3 shadow-popover"
    >
      <Icon size={16} className={cn("mt-0.5 shrink-0", className)} />
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-fg">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-sm break-words text-fg-muted">{toast.description}</p>}
        {toast.action && (
          <Button
            size="xs"
            variant="secondary"
            className="mt-2"
            onClick={() => {
              toast.action?.onClick();
              dismiss(toast.id);
            }}
          >
            {toast.action.label}
          </Button>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => dismiss(toast.id)}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:bg-hover hover:text-fg"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  // Centered over the workspace, above the floating viewer toolbars, so
  // notifications never cover the sidebars' primary actions or the toolbars.
  const left = useUiStore((s) => (s.view === "workspace" && s.leftOpen ? 248 : 0));
  const right = useUiStore((s) => (s.view === "workspace" && s.rightOpen ? 300 : 0));
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed z-[90] flex flex-col items-center gap-2"
      style={{ bottom: "calc(var(--statusbar-height) + 64px)", left, right }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
