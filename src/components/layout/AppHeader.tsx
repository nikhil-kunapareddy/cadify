import { CircleHelp, FolderClosed, Moon, PanelLeft, PanelRight, Settings, Sun, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { IconButton } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { RenameProjectDialog } from "@/components/history/ProjectDialogs";
import { useNetworkStore } from "@/stores/networkStore";
import { useProjectStore } from "@/stores/projectStore";
import { useThemeStore } from "@/stores/themeStore";
import { useUiStore } from "@/stores/uiStore";
import { cn } from "@/utils/cn";
import { MOD, isMac, isTauri } from "@/utils/platform";
import { LogoMark } from "./Logo";
import { WorkflowStepper } from "./WorkflowStepper";

/** Space reserved for the macOS traffic lights (overlay title bar). */
function useTrafficLightInset(): number {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!isTauri() || !isMac) return;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      setFullscreen(await win.isFullscreen());
      unlisten = await win.onResized(async () => setFullscreen(await win.isFullscreen()));
    });
    return () => unlisten?.();
  }, []);
  return isTauri() && isMac && !fullscreen ? 86 : 12;
}

function ProjectTitle() {
  const project = useProjectStore((s) => s.project);
  const persist = useProjectStore((s) => s.persist);
  const [renaming, setRenaming] = useState(false);
  if (!project) {
    return <span className="truncate text-sm text-fg-subtle">No project</span>;
  }
  const indicator =
    persist === "saving" ? { label: "Saving…", cls: "bg-fg-subtle animate-pulse-soft" } :
    persist === "unsaved" ? { label: "Not saved — browser preview keeps projects in memory only", cls: "bg-warning" } :
    persist === "error" ? { label: "Last change could not be saved", cls: "bg-danger" } : null;
  return (
    <>
      <Tooltip content="Rename project">
        <button
          type="button"
          onClick={() => setRenaming(true)}
          className="no-drag flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm font-medium text-fg hover:bg-hover"
        >
          <span className="truncate">{project.name}</span>
        </button>
      </Tooltip>
      {indicator && (
        <Tooltip content={indicator.label}>
          <span className={cn("size-1.5 shrink-0 rounded-full", indicator.cls)} aria-label={indicator.label} role="status" />
        </Tooltip>
      )}
      <RenameProjectDialog
        open={renaming}
        onOpenChange={setRenaming}
        projectId={project.id}
        currentName={project.name}
      />
    </>
  );
}

export function AppHeader() {
  const inset = useTrafficLightInset();
  const { view, leftOpen, rightOpen, toggleLeft, toggleRight, navigate, openDialog } = useUiStore();
  const theme = useThemeStore();
  const online = useNetworkStore((s) => s.online);
  const inWorkspace = view === "workspace";

  return (
    <header
      data-tauri-drag-region
      className="drag-region relative z-30 flex shrink-0 items-center border-b border-line bg-panel pr-2"
      style={{ height: "var(--header-height)", paddingLeft: inset }}
    >
      <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-1.5">
        <IconButton
          className="no-drag"
          label={leftOpen ? "Hide drawing panel" : "Show drawing panel"}
          shortcut={`${MOD}⌥S`}
          icon={<PanelLeft size={16} />}
          active={leftOpen && inWorkspace}
          disabled={!inWorkspace}
          onClick={toggleLeft}
        />
        <button
          type="button"
          onClick={() => navigate("workspace")}
          className="no-drag ml-0.5 flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-hover"
          aria-label="CADify workspace"
        >
          <LogoMark size={20} />
          <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-fg">CADify</span>
        </button>
        <span className="text-fg-faint select-none" aria-hidden>
          /
        </span>
        <div data-tauri-drag-region className="flex min-w-0 max-w-[260px] items-center gap-1.5">
          {view === "settings" ? (
            <span className="text-sm font-medium text-fg">Settings</span>
          ) : view === "projects" ? (
            <span className="text-sm font-medium text-fg">Projects</span>
          ) : (
            <ProjectTitle />
          )}
        </div>
      </div>

      <div data-tauri-drag-region className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 lg:block">
        <div className="pointer-events-auto">{inWorkspace && <WorkflowStepper />}</div>
      </div>

      <div data-tauri-drag-region className="flex flex-1 items-center justify-end gap-0.5">
        {!online && (
          <Tooltip content="No internet connection. Generation is unavailable until you reconnect.">
            <span className="no-drag mr-1 inline-flex h-6 items-center gap-1 rounded-sm bg-danger-soft px-1.5 text-xs font-medium text-danger">
              <WifiOff size={12} /> Offline
            </span>
          </Tooltip>
        )}
        <IconButton
          className="no-drag"
          label="Projects"
          icon={<FolderClosed size={16} />}
          active={view === "projects"}
          onClick={() => navigate(view === "projects" ? "workspace" : "projects")}
        />
        <IconButton
          className="no-drag"
          label={theme.resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          shortcut={`${MOD}⇧L`}
          icon={theme.resolved === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          onClick={theme.toggle}
        />
        <IconButton className="no-drag" label="Help and shortcuts" shortcut="?" icon={<CircleHelp size={16} />} onClick={() => openDialog("help")} />
        <IconButton
          className="no-drag"
          label="Settings"
          shortcut={`${MOD},`}
          icon={<Settings size={16} />}
          active={view === "settings"}
          onClick={() => navigate(view === "settings" ? "workspace" : "settings")}
        />
        <div className="mx-1 h-4 w-px bg-line" />
        <IconButton
          className="no-drag"
          label={rightOpen ? "Hide inspector" : "Show inspector"}
          shortcut={`${MOD}⌥I`}
          icon={<PanelRight size={16} />}
          active={rightOpen && inWorkspace}
          disabled={!inWorkspace}
          onClick={toggleRight}
        />
      </div>
    </header>
  );
}
