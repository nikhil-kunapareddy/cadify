import { FolderOpen, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Kbd } from "@/components/ui/Kbd";
import { Tooltip } from "@/components/ui/Tooltip";
import type { DropState } from "@/hooks/useDrawingDrop";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { pickAndUpload } from "@/stores/workflow";
import { MOD } from "@/utils/platform";
import { DrawingTo3DIllustration } from "./DrawingTo3DIllustration";
import { FileUploader } from "./FileUploader";

export function EmptyWorkspace({ dropState }: { dropState: DropState }) {
  const recent = useProjectStore((s) => s.recent);
  const project = useProjectStore((s) => s.project);
  const openDialog = useUiStore((s) => s.openDialog);
  const busy = ["reading", "parsing", "rendering", "saving"].includes(useProjectStore((s) => s.load.phase));
  const hasRecent = recent.length > 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-[680px] flex-col justify-center px-8 py-10">
        <DrawingTo3DIllustration className="mb-7 h-[118px] w-auto self-start" />

        <h1 className="text-2xl font-semibold tracking-[-0.022em] text-fg">Turn engineering drawings into 3D CAD.</h1>
        <p className="mt-2 max-w-[520px] text-md text-fg-muted">
          {project && !project.drawing
            ? `“${project.name}” has no drawing yet. Upload one to continue.`
            : "Upload your engineering drawing and let CADify reconstruct a 3D model you can inspect and export."}
        </p>

        <div className="mt-6 flex items-center gap-2">
          <Button variant="primary" size="xl" icon={<Upload size={16} />} onClick={() => void pickAndUpload()} disabled={busy}>
            Upload Engineering Drawing
          </Button>
          <Tooltip content={hasRecent ? undefined : "No recent projects yet"} wrapDisabled={!hasRecent}>
            <Button size="xl" icon={<FolderOpen size={16} />} onClick={() => openDialog("recent")} disabled={!hasRecent}>
              Open Recent Project
            </Button>
          </Tooltip>
        </div>
        <p className="mt-2.5 flex items-center gap-1.5 text-xs text-fg-subtle">
          <Kbd>{MOD}O</Kbd> to upload <span className="text-fg-faint">·</span> <Kbd>{MOD}P</Kbd> for recent projects
        </p>

        <div className="mt-8">
          <FileUploader dropState={dropState} />
        </div>

        <ol className="mt-6 grid grid-cols-4 gap-3 text-xs text-fg-subtle">
          {[
            ["Upload", "A PDF drawing with dimensioned views"],
            ["Generate", "Claude interprets views and dimensions"],
            ["Preview", "Inspect the reconstructed solid"],
            ["Export", "Download STEP and STL"],
          ].map(([title, text], i) => (
            <li key={title} className="flex gap-2">
              <span className="tabular mt-px flex size-4 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold text-fg-subtle ring-1 ring-line-strong">
                {i + 1}
              </span>
              <span>
                <span className="block font-medium text-fg-muted">{title}</span>
                {text}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
