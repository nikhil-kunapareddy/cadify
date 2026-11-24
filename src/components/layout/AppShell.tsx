import { useEffect, useState } from "react";
import { RouteView } from "@/app/routes";
import { DrawingPanel } from "@/components/drawing/DrawingPanel";
import { InspectorPanel } from "@/components/inspector/InspectorPanel";
import { Toaster } from "@/components/ui/Toaster";
import { Spinner } from "@/components/ui/ProgressIndicator";
import { useDrawingDrop } from "@/hooks/useDrawingDrop";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useCredentialStore } from "@/stores/credentialStore";
import { initNetworkMonitor } from "@/stores/networkStore";
import { useProjectStore } from "@/stores/projectStore";
import { initTheme } from "@/stores/themeStore";
import { toast } from "@/stores/toastStore";
import { useUiStore } from "@/stores/uiStore";
import "@/stores/devStore";
import { AppHeader } from "./AppHeader";
import { DropOverlay, GlobalDialogs } from "./GlobalDialogs";
import { LogoMark } from "./Logo";
import { StatusBar } from "./StatusBar";

function LaunchScreen() {
  return (
    <div className="grid h-full place-items-center bg-app" role="status" aria-label="Starting CADify">
      <div className="flex animate-fade-in flex-col items-center gap-4">
        <LogoMark size={44} />
        <Spinner size={16} className="text-fg-subtle" />
      </div>
    </div>
  );
}

function useBoot(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const stopTheme = initTheme();
    const stopNetwork = initNetworkMonitor((online) => {
      if (online) toast.success("Back online", { description: "Generation is available again." });
      else toast.warning("No internet connection", { description: "Generation is paused until you reconnect. Drawings and models stay available." });
    });
    // Load credentials status and recent projects before revealing the UI,
    // but never block launch for long.
    const timeout = setTimeout(() => setReady(true), 1200);
    void Promise.allSettled([useCredentialStore.getState().refresh(), useProjectStore.getState().refreshRecent()]).then(() => {
      clearTimeout(timeout);
      setReady(true);
    });
    return () => {
      stopTheme();
      stopNetwork();
      clearTimeout(timeout);
    };
  }, []);
  return ready;
}

export function AppShell() {
  const ready = useBoot();
  const view = useUiStore((s) => s.view);
  const leftOpen = useUiStore((s) => s.leftOpen);
  const rightOpen = useUiStore((s) => s.rightOpen);
  const hasDrawing = useProjectStore((s) => Boolean(s.project?.drawing && s.pdf));
  const dropState = useDrawingDrop(ready);
  useKeyboardShortcuts();

  if (!ready) return <LaunchScreen />;

  const workspace = view === "workspace";
  return (
    <div className="flex h-full flex-col bg-app">
      <AppHeader />
      <div className="flex min-h-0 flex-1">
        {workspace && leftOpen && <DrawingPanel />}
        <main className="min-w-0 flex-1 bg-canvas" aria-label="Workspace">
          <RouteView view={view} dropState={dropState} />
        </main>
        {workspace && rightOpen && <InspectorPanel />}
      </div>
      <StatusBar />
      <GlobalDialogs />
      <Toaster />
      {/* The empty workspace dropzone highlights itself; elsewhere show a full overlay. */}
      {(hasDrawing || !workspace) && <DropOverlay state={dropState} />}
    </div>
  );
}
