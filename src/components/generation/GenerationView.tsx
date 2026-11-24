import { AlertTriangle, ArrowLeft, RotateCcw, Settings, Square } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StageSegments } from "@/components/ui/ProgressIndicator";
import { GENERATION_STAGES } from "@/config/app";
import { useNow } from "@/hooks/useNow";
import { services } from "@/services";
import { selectedFormats, useGenerationStore } from "@/stores/generationStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { errorCopy, isRetryable, needsSettings } from "@/utils/errors";
import { cn } from "@/utils/cn";
import { formatElapsed } from "@/utils/format";
import { ClarificationPanel } from "./ClarificationPanel";
import { StageList } from "./StageList";

/** Dedicated workspace state while a model is being generated. */
export function GenerationView() {
  const gen = useGenerationStore();
  const project = useProjectStore((s) => s.project);
  const navigate = useUiStore((s) => s.navigate);
  const running = gen.status === "running" || gen.status === "clarification";
  const now = useNow(running, 250);

  const completed = GENERATION_STAGES.filter((s) => gen.stages[s.id].status === "completed").length;
  const elapsed = gen.startedAt ? (gen.finishedAt ?? now) - gen.startedAt : 0;
  const failed = gen.status === "failed";
  const clarifying = gen.status === "clarification" && gen.clarification;
  const formats = selectedFormats(gen.outputs).map((f) => f.toUpperCase()).join(" + ");
  const error = gen.error;
  const copy = error ? errorCopy(error.code) : null;
  const failedStage = GENERATION_STAGES.find((s) => s.id === gen.failedStage);

  return (
    <div className="h-full overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-full max-w-[600px] flex-col justify-center px-6 py-10">
        <div className="animate-slide-up rounded-2xl bg-elevated shadow-popover">
          <div className="flex items-start gap-3.5 px-5 pt-5">
            {project?.thumbnail && (
              <img
                src={project.thumbnail}
                alt=""
                className="h-12 w-[68px] shrink-0 rounded-[3px] bg-paper object-contain ring-1 ring-line-strong"
                draggable={false}
              />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-[-0.01em] text-fg">
                {failed ? "Generation failed" : clarifying ? "Input needed to continue" : "Generating 3D model"}
              </h2>
              <p className="truncate text-sm text-fg-subtle">
                {project?.drawing?.fileName} · {formats}
                {services.generation.backend === "mock" && <span className="text-warning"> · mock backend</span>}
              </p>
            </div>
            <div className="text-right">
              <p className="tabular font-mono text-md text-fg">{formatElapsed(elapsed)}</p>
              <p className={cn("tabular text-xs", failed ? "text-danger" : "text-fg-subtle")}>
                {failed ? "Failed at stage" : "Stage"} {Math.min(completed + 1, GENERATION_STAGES.length)} of {GENERATION_STAGES.length}
              </p>
            </div>
          </div>

          <div className="px-5 pt-4">
            <StageSegments total={GENERATION_STAGES.length} completed={completed} active={gen.status === "running"} failed={failed} />
          </div>

          <div className="px-5 pt-5">
            <StageList stages={gen.stages} now={now} paused={Boolean(clarifying)} dense={Boolean(clarifying)} />
          </div>

          {clarifying && gen.clarification && (
            <div className="px-5 pb-1">
              <ClarificationPanel
                request={gen.clarification}
                submitting={gen.submittingAnswers}
                onSubmit={(answers) => void gen.answer(answers)}
                onCancel={() => void gen.cancel()}
              />
            </div>
          )}

          {failed && error && copy && (
            <div className="mx-5 mb-1 rounded-lg border border-danger/30 bg-danger-soft/50 px-3.5 py-3" role="alert">
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    {error.message || copy.title}
                    {failedStage && <span className="font-normal text-fg-subtle"> · during “{failedStage.label}”</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-fg-muted">{copy.description}</p>
                  {error.detail && (
                    <p className="mt-1.5 font-mono text-xs break-words text-fg-subtle" data-selectable>
                      {error.detail}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {gen.warnings.length > 0 && !failed && (
            <div className="mx-5 mb-1 flex flex-col gap-1 rounded-lg border border-warning/25 bg-warning-soft/40 px-3.5 py-2.5">
              {gen.warnings.map((w) => (
                <p key={w.code + w.message} className="flex items-start gap-2 text-sm text-fg-muted">
                  <AlertTriangle size={13} className="mt-[3px] shrink-0 text-warning" />
                  {w.message}
                </p>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-line px-5 py-3.5">
            {failed ? (
              <>
                <Button variant="ghost" size="md" icon={<ArrowLeft size={14} />} onClick={gen.dismissRun}>
                  {gen.result ? "Back to model" : "Back to drawing"}
                </Button>
                <div className="flex gap-2">
                  {error && needsSettings(error.code) && (
                    <Button icon={<Settings size={14} />} onClick={() => navigate("settings", "ai")}>
                      Open Settings
                    </Button>
                  )}
                  <Button
                    variant={error && needsSettings(error.code) ? "secondary" : "primary"}
                    icon={<RotateCcw size={14} />}
                    onClick={() => void gen.start()}
                  >
                    {error && !isRetryable(error.code) && !needsSettings(error.code) ? "Try again" : "Retry"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-fg-subtle">
                  {clarifying ? "Generation is paused until you answer." : "You can keep inspecting the drawing in the sidebar."}
                </p>
                {!clarifying && (
                  <Button icon={<Square size={11} fill="currentColor" />} onClick={() => void gen.cancel()}>
                    Cancel
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
