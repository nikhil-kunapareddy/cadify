import { Box, Download, FileUp, Sparkles } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Kbd } from "@/components/ui/Kbd";
import { Button } from "@/components/ui/Button";
import { SHORTCUTS } from "@/hooks/useKeyboardShortcuts";
import { services } from "@/services";
import { useUiStore } from "@/stores/uiStore";

const STEPS = [
  { icon: FileUp, title: "Upload a drawing", text: "Drop a PDF with dimensioned orthographic views. Multi-page drawings are supported." },
  { icon: Sparkles, title: "Generate", text: "Claude interprets views, dimensions and notes; the CAD kernel builds and validates a solid." },
  { icon: Box, title: "Preview", text: "Orbit, pan and zoom the preview mesh. Compare it against the drawing in split view." },
  { icon: Download, title: "Export", text: "Download STEP for CAD software or STL for printing and visualization." },
];

export function HelpDialog() {
  const open = useUiStore((s) => s.dialog === "help");
  const close = useUiStore((s) => s.closeDialog);
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title="CADify guide" description="How the workflow fits together, plus keyboard shortcuts." width={640}>
      <div className="grid grid-cols-2 gap-2.5">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <div key={title} className="flex gap-2.5 rounded-lg border border-line bg-sunken/40 p-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Icon size={14} />
            </span>
            <div>
              <p className="text-sm font-medium text-fg">
                {i + 1}. {title}
              </p>
              <p className="mt-0.5 text-xs text-fg-subtle">{text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4">
        {groups.map((group) => (
          <div key={group}>
            <p className="label-caps mb-1.5">{group}</p>
            {SHORTCUTS.filter((s) => s.group === group).map((s) => (
              <div key={s.label} className="flex h-7 items-center justify-between gap-3 text-sm">
                <span className="text-fg-muted">{s.label}</span>
                <Kbd>{s.keys}</Kbd>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Dialog>
  );
}

export function PrivacyDialog() {
  const open = useUiStore((s) => s.dialog === "privacy");
  const close = useUiStore((s) => s.closeDialog);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title="Privacy"
      width={520}
      footer={
        <Button variant="primary" onClick={close}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-fg-muted">
        <p>
          <span className="font-medium text-fg">Stays on your Mac.</span> Projects, original PDFs and generated STEP/STL files are stored in your
          project folder. Project metadata is kept in a local SQLite database. CADify has no cloud account and sends no analytics.
        </p>
        <p>
          <span className="font-medium text-fg">Sent to Anthropic.</span> When you generate a model, the drawing’s content is sent to the
          Anthropic API using your own API key so Claude can interpret it. Nothing is sent until you click Generate.
        </p>
        <p>
          <span className="font-medium text-fg">Your API key.</span> Stored in the macOS Keychain and used only by CADify’s native backend.
        </p>
        {services.generation.backend === "mock" && (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
            The mock generation backend is active: no drawing data leaves this Mac during generation.
          </p>
        )}
      </div>
    </Dialog>
  );
}
