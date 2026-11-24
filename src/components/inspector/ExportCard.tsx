import { CheckCircle2, Download, FileBox, Triangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import type { ExportFormat, ModelArtifact } from "@/types/generation";
import { cn } from "@/utils/cn";
import { formatBytes } from "@/utils/format";

const FORMAT_INFO: Record<ExportFormat, { name: string; ext: string; description: string; use: string }> = {
  step: {
    name: "STEP",
    ext: ".step",
    description: "CAD exchange format",
    use: "Exact B-rep geometry for SolidWorks, Fusion, Onshape, FreeCAD and other CAD tools.",
  },
  stl: {
    name: "STL",
    ext: ".stl",
    description: "3D mesh format",
    use: "Triangulated mesh for 3D printing and visualization.",
  },
};

interface ExportCardProps {
  format: ExportFormat;
  artifact?: ModelArtifact;
  busy: boolean;
  disabled: boolean;
  onExport: () => void;
}

export function ExportCard({ format, artifact, busy, disabled, onExport }: ExportCardProps) {
  const info = FORMAT_INFO[format];
  const available = Boolean(artifact?.validated);
  const reason = !artifact
    ? `${info.name} was not generated. Select it in Output format and regenerate.`
    : !artifact.validated
      ? `${info.name} did not pass export validation.`
      : null;

  return (
    <div className={cn("rounded-lg border border-line bg-sunken/40 p-2.5", !available && "opacity-70")}>
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md",
            format === "step" ? "bg-accent-soft text-accent" : "bg-success-soft text-success",
          )}
        >
          {format === "step" ? <FileBox size={16} /> : <Triangle size={14} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-fg">{info.name}</p>
            <span className="rounded-xs bg-active px-1 font-mono text-2xs text-fg-muted">{info.ext}</span>
            {artifact && <span className="tabular ml-auto text-xs text-fg-subtle">{formatBytes(artifact.sizeBytes)}</span>}
          </div>
          <p className="text-xs text-fg-muted">{info.description}</p>
          <p className="mt-0.5 text-xs text-fg-subtle">{info.use}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        {available ? (
          <span className="flex items-center gap-1 text-xs text-success">
            <CheckCircle2 size={12} /> Validated
          </span>
        ) : (
          <span className="text-xs text-fg-subtle">{artifact ? "Validation failed" : "Not generated"}</span>
        )}
        <Tooltip content={reason ?? undefined} wrapDisabled={!available}>
          <Button size="sm" icon={<Download size={13} />} onClick={onExport} loading={busy} disabled={!available || disabled}>
            Download {info.name}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
