import { Box, Columns2, FileText } from "lucide-react";
import { lazy, Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GenerationView } from "@/components/generation/GenerationView";
import { PDFViewer } from "@/components/pdf/PDFViewer";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyWorkspace } from "@/components/upload/EmptyWorkspace";
import { LoadingState } from "@/components/ui/States";
import type { DropState } from "@/hooks/useDrawingDrop";
import { useGenerationStore } from "@/stores/generationStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore, type WorkspaceMode } from "@/stores/uiStore";
import { MOD } from "@/utils/platform";

// Three.js is only needed once a model exists; keep it out of the startup bundle.
const ModelViewer = lazy(() => import("@/components/viewer/ModelViewer").then((m) => ({ default: m.ModelViewer })));

function PaneLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-line bg-panel px-3 text-xs font-medium text-fg-muted [&_svg]:size-3.5 [&_svg]:text-fg-subtle">
      {icon}
      {children}
    </div>
  );
}

export function Workspace({ dropState }: { dropState: DropState }) {
  const project = useProjectStore((s) => s.project);
  const pdf = useProjectStore((s) => s.pdf);
  const page = useProjectStore((s) => s.page);
  const setPage = useProjectStore((s) => s.setPage);
  const loadPhase = useProjectStore((s) => s.load.phase);
  const showRun = useGenerationStore((s) => s.showRun);
  const status = useGenerationStore((s) => s.status);
  const dismissRun = useGenerationStore((s) => s.dismissRun);
  const hasModel = useGenerationStore((s) => Boolean(s.result));
  const mode = useUiStore((s) => s.workspaceMode);
  const setMode = useUiStore((s) => s.setWorkspaceMode);

  const loading = ["reading", "parsing", "rendering", "saving"].includes(loadPhase);
  if (!project?.drawing || !pdf || (loading && !pdf)) {
    return <EmptyWorkspace dropState={dropState} />;
  }

  const running = status === "running" || status === "clarification";
  const effectiveMode: WorkspaceMode = hasModel ? mode : "drawing";
  const generating = showRun;

  const onModeChange = (next: WorkspaceMode) => {
    if (showRun && !running) dismissRun();
    setMode(next);
  };

  const drawingPane = (
    <ErrorBoundary label="drawing viewer">
      <PDFViewer doc={pdf} page={page} onPageChange={setPage} compact={effectiveMode === "split"} />
    </ErrorBoundary>
  );
  const modelPane = (
    <ErrorBoundary label="3D viewer">
      <Suspense fallback={<LoadingState label="Loading 3D viewer…" className="h-full bg-viewport" />}>
        <ModelViewer />
      </Suspense>
    </ErrorBoundary>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-3">
        <SegmentedControl<WorkspaceMode>
          label="Workspace view"
          size="sm"
          value={generating ? "drawing" : effectiveMode}
          onChange={onModeChange}
          options={[
            { value: "drawing", label: "Original Drawing", icon: <FileText size={13} />, shortcut: `${MOD}1` },
            {
              value: "model",
              label: "3D Model",
              icon: <Box size={13} />,
              disabled: !hasModel || running,
              tooltip: hasModel ? undefined : "Generate a model first",
              shortcut: hasModel ? `${MOD}2` : undefined,
            },
            {
              value: "split",
              label: "Split",
              icon: <Columns2 size={13} />,
              disabled: !hasModel || running,
              tooltip: hasModel ? "Drawing and model side by side" : "Generate a model first",
              shortcut: hasModel ? `${MOD}3` : undefined,
            },
          ]}
        />
        <p className="truncate text-xs text-fg-subtle">
          {generating
            ? running
              ? "Generation in progress"
              : "Generation stopped"
            : effectiveMode === "model"
              ? "Preview mesh (STL) · STEP holds exact geometry"
              : `${project.drawing.fileName} · Page ${page} of ${pdf.numPages}`}
        </p>
      </div>

      <div className="min-h-0 flex-1">
        {generating ? (
          <GenerationView />
        ) : effectiveMode === "split" ? (
          <div className="grid h-full grid-cols-2">
            <div className="flex min-w-0 flex-col border-r border-line">
              <PaneLabel icon={<FileText />}>Original drawing · page {page}</PaneLabel>
              <div className="min-h-0 flex-1">{drawingPane}</div>
            </div>
            <div className="flex min-w-0 flex-col">
              <PaneLabel icon={<Box />}>3D model</PaneLabel>
              <div className="min-h-0 flex-1">{modelPane}</div>
            </div>
          </div>
        ) : effectiveMode === "model" ? (
          modelPane
        ) : (
          drawingPane
        )}
      </div>
    </div>
  );
}
