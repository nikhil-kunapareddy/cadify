import { Download, PanelRight, RotateCcw, Sparkles, Square } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Kbd } from "@/components/ui/Kbd";
import { EmptyState } from "@/components/ui/States";
import { Tooltip } from "@/components/ui/Tooltip";
import { GENERATION_STAGES } from "@/config/app";
import { useGenerateAvailability } from "@/hooks/useGenerateAvailability";
import { useExportStore } from "@/stores/exportStore";
import { useGenerationStore } from "@/stores/generationStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { MOD } from "@/utils/platform";
import {
  DocumentSection,
  ExportSection,
  FeaturesSection,
  GenerationConfigSection,
  ModelInfoSection,
  ValidationSection,
} from "./InspectorSections";

function GenerateFooter() {
  const { canGenerate, reason, blocker } = useGenerateAvailability();
  const start = useGenerationStore((s) => s.start);
  const navigate = useUiStore((s) => s.navigate);
  return (
    <div className="border-t border-line bg-panel p-3">
      <Tooltip content={reason ?? undefined} side="top" wrapDisabled={!canGenerate} className="w-full">
        <Button
          variant="primary"
          size="xl"
          className="w-full"
          icon={<Sparkles size={15} />}
          disabled={!canGenerate}
          onClick={() => void start()}
          trailing={canGenerate ? <Kbd className="ml-1 border-white/25 text-white/75">{MOD}↵</Kbd> : undefined}
        >
          Generate 3D Model
        </Button>
      </Tooltip>
      {reason && (
        <p className="mt-2 text-center text-xs text-fg-subtle">
          {reason}{" "}
          {blocker === "no_api_key" && (
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => navigate("settings", "ai")}>
              Open Settings
            </button>
          )}
        </p>
      )}
    </div>
  );
}

function RunningFooter() {
  const stages = useGenerationStore((s) => s.stages);
  const status = useGenerationStore((s) => s.status);
  const cancel = useGenerationStore((s) => s.cancel);
  const completed = GENERATION_STAGES.filter((s) => stages[s.id].status === "completed").length;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line bg-panel p-3">
      <div>
        <p className="text-sm font-medium text-fg">{status === "clarification" ? "Waiting for your input" : "Generating…"}</p>
        <p className="tabular text-xs text-fg-subtle">
          Stage {Math.min(completed + 1, GENERATION_STAGES.length)} of {GENERATION_STAGES.length}
        </p>
      </div>
      <Button size="sm" icon={<Square size={10} fill="currentColor" />} onClick={() => void cancel()}>
        Cancel
      </Button>
    </div>
  );
}

function ResultFooter() {
  const result = useGenerationStore((s) => s.result)!;
  const start = useGenerationStore((s) => s.start);
  const { canGenerate, reason } = useGenerateAvailability();
  const busy = useExportStore((s) => s.busy);
  const exportAll = useExportStore((s) => s.exportAll);
  const exportOne = useExportStore((s) => s.exportOne);
  const [confirm, setConfirm] = useState(false);
  const validated = result.artifacts.filter((a) => a.validated);
  const single = validated.length === 1 ? validated[0] : null;

  return (
    <div className="flex gap-2 border-t border-line bg-panel p-3">
      <Tooltip content={canGenerate ? "Regenerate model" : (reason ?? "")} side="top">
        <span className="inline-flex">
          <Button size="xl" icon={<RotateCcw size={15} />} aria-label="Regenerate model" disabled={!canGenerate} onClick={() => setConfirm(true)} className="px-3" />
        </span>
      </Tooltip>
      <Button
        variant="primary"
        size="xl"
        className="flex-1"
        icon={<Download size={15} />}
        loading={busy === "all" || (single ? busy === single.format : false)}
        disabled={validated.length === 0 || busy !== null}
        onClick={() => void (single ? exportOne(single.format) : exportAll())}
      >
        {validated.length === 0 ? "Nothing to export" : single ? `Download ${single.format.toUpperCase()}` : "Download Both"}
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Regenerate the model?"
        description="CADify will run the full pipeline again. The current model stays available until the new one is ready, then it is replaced."
        confirmLabel="Regenerate"
        onConfirm={() => {
          setConfirm(false);
          void start();
        }}
      />
    </div>
  );
}

export function InspectorPanel() {
  const project = useProjectStore((s) => s.project);
  const hasPdf = useProjectStore((s) => Boolean(s.pdf));
  const result = useGenerationStore((s) => s.result);
  const status = useGenerationStore((s) => s.status);
  const running = status === "running" || status === "clarification";
  const showResult = Boolean(result) && !running;

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-line bg-panel" aria-label="Inspector">
      <div className="flex h-10 shrink-0 items-center border-b border-line px-3">
        <span className="text-sm font-medium text-fg">{showResult ? "Model" : "Inspector"}</span>
      </div>
      {!project?.drawing || !hasPdf ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            compact
            icon={<PanelRight size={17} />}
            title="Nothing to inspect yet"
            description="Upload an engineering drawing to see document details and generation options."
          />
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {showResult && result ? (
              <>
                <ModelInfoSection result={result} />
                <ValidationSection result={result} />
                <FeaturesSection result={result} />
                <ExportSection result={result} />
                <GenerationConfigSection />
                <DocumentSection defaultOpen={false} />
              </>
            ) : (
              <>
                <DocumentSection />
                <GenerationConfigSection />
              </>
            )}
          </div>
          {running ? <RunningFooter /> : showResult ? <ResultFooter /> : <GenerateFooter />}
        </>
      )}
    </aside>
  );
}
