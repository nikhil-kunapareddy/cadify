import { FileText } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { ProjectGenerationStatus, ProjectSummary } from "@/types/project";
import { cn } from "@/utils/cn";

const STATUS: Record<ProjectGenerationStatus, { label: string; tone: BadgeTone }> = {
  none: { label: "Not generated", tone: "neutral" },
  succeeded: { label: "Generated", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  needs_clarification: { label: "Needs input", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function GenerationStatusBadge({ status }: { status: ProjectGenerationStatus }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

export function ModelAvailability({ project }: { project: ProjectSummary }) {
  return (
    <div className="flex items-center gap-1">
      {(["step", "stl"] as const).map((f) => {
        const has = project.availableFormats.includes(f);
        return (
          <span
            key={f}
            className={cn(
              "rounded-xs px-1 font-mono text-2xs font-medium uppercase",
              has ? "bg-accent-soft text-accent" : "text-fg-faint ring-1 ring-line ring-inset",
            )}
            title={has ? `${f.toUpperCase()} available` : `${f.toUpperCase()} not available`}
          >
            {f}
          </span>
        );
      })}
    </div>
  );
}

export function ProjectThumb({ project, size = "md" }: { project: ProjectSummary; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-8 w-11" : "h-10 w-14";
  return project.thumbnail ? (
    <img src={project.thumbnail} alt="" draggable={false} className={cn(cls, "shrink-0 rounded-[3px] bg-paper object-contain ring-1 ring-line-strong")} />
  ) : (
    <div className={cn(cls, "flex shrink-0 items-center justify-center rounded-[3px] bg-sunken text-fg-faint ring-1 ring-line")}>
      <FileText size={14} />
    </div>
  );
}
