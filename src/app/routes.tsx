import { ProjectsView } from "@/components/history/ProjectsView";
import { SettingsView } from "@/components/settings/SettingsView";
import { Workspace } from "@/components/workspace/Workspace";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { DropState } from "@/hooks/useDrawingDrop";
import type { AppView } from "@/stores/uiStore";

/** Top-level views. CADify is a single-window app, so routing is state-based. */
export function RouteView({ view, dropState }: { view: AppView; dropState: DropState }) {
  switch (view) {
    case "settings":
      return (
        <ErrorBoundary label="settings">
          <SettingsView />
        </ErrorBoundary>
      );
    case "projects":
      return (
        <ErrorBoundary label="projects list">
          <ProjectsView />
        </ErrorBoundary>
      );
    default:
      return (
        <ErrorBoundary label="workspace">
          <Workspace dropState={dropState} />
        </ErrorBoundary>
      );
  }
}
