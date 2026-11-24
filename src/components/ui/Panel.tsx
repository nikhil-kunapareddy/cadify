import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";

interface PanelSectionProps {
  title: string;
  children: ReactNode;
  /** Element shown at the right side of the header (count, button). */
  aside?: ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
  className?: string;
}

/** Collapsible section used in the sidebars and inspector. */
export function PanelSection({ title, children, aside, defaultOpen = true, collapsible = true, className }: PanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cn("border-b border-line last:border-b-0", className)}>
      <div className="flex h-9 items-center gap-1 pr-2 pl-3">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="-ml-1 flex h-6 flex-1 items-center gap-1 rounded-sm pl-1 text-left hover:text-fg"
          >
            <ChevronRight size={12} className={cn("text-fg-subtle transition-transform duration-150", open && "rotate-90")} />
            <span className="label-caps">{title}</span>
          </button>
        ) : (
          <span className="label-caps flex-1">{title}</span>
        )}
        {aside}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

interface PropertyRowProps {
  label: string;
  children: ReactNode;
  mono?: boolean;
  muted?: boolean;
  title?: string;
}

/** Label/value row used for metadata. */
export function PropertyRow({ label, children, mono, muted, title }: PropertyRowProps) {
  return (
    <div className="flex min-h-[24px] items-center justify-between gap-3 text-sm">
      <span className="shrink-0 text-fg-subtle">{label}</span>
      <span
        title={title}
        className={cn("min-w-0 truncate text-right", muted ? "text-fg-subtle" : "text-fg", mono && "tabular font-mono text-xs")}
      >
        {children}
      </span>
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-line", className)} />;
}
