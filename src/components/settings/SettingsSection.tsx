import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export function SettingsPage({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="animate-fade-in">
      <h1 className="text-xl font-semibold tracking-[-0.015em] text-fg">{title}</h1>
      {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      <div className="mt-6 flex flex-col gap-6">{children}</div>
    </div>
  );
}

export function SettingsSection({ title, description, children, className }: { title?: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title && <h2 className="text-base font-semibold text-fg">{title}</h2>}
      {description && <p className="mt-0.5 text-sm text-fg-subtle">{description}</p>}
      <div className={cn("overflow-hidden rounded-xl border border-line bg-panel", title && "mt-3")}>{children}</div>
    </section>
  );
}

export function SettingsRow({ label, description, children, stacked }: { label: ReactNode; description?: ReactNode; children?: ReactNode; stacked?: boolean }) {
  return (
    <div className={cn("border-b border-line px-4 py-3 last:border-b-0", stacked ? "flex flex-col gap-2.5" : "flex items-center justify-between gap-6")}>
      <div className="min-w-0">
        <div className="text-base text-fg">{label}</div>
        {description && <div className="mt-0.5 text-sm text-fg-subtle">{description}</div>}
      </div>
      {children && <div className={cn(stacked ? "" : "flex shrink-0 items-center gap-2")}>{children}</div>}
    </div>
  );
}
