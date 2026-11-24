import { useEffect } from "react";
import { useGenerationStore } from "@/stores/generationStore";
import { useThemeStore } from "@/stores/themeStore";
import { useUiStore } from "@/stores/uiStore";
import { pickAndUpload, startNewProject } from "@/stores/workflow";
import { isMac } from "@/utils/platform";
import { useGenerateAvailability } from "./useGenerateAvailability";

export interface ShortcutDescription {
  keys: string;
  label: string;
  group: "General" | "Workspace" | "Drawing" | "3D viewer";
}

const M = isMac ? "⌘" : "Ctrl+";
const SHIFT = isMac ? "⇧" : "Shift+";
const ALT = isMac ? "⌥" : "Alt+";

/** Single source of truth for the shortcuts listed in the Help dialog. */
export const SHORTCUTS: ShortcutDescription[] = [
  { keys: `${M}N`, label: "New project", group: "General" },
  { keys: `${M}O`, label: "Upload drawing", group: "General" },
  { keys: `${M}P`, label: "Open recent project", group: "General" },
  { keys: `${M},`, label: "Settings", group: "General" },
  { keys: `${M}${SHIFT}L`, label: "Toggle light/dark theme", group: "General" },
  { keys: "?", label: "Help and shortcuts", group: "General" },
  { keys: `${M}↵`, label: "Generate 3D model", group: "Workspace" },
  { keys: `${M}1`, label: "Show drawing", group: "Workspace" },
  { keys: `${M}2`, label: "Show 3D model", group: "Workspace" },
  { keys: `${M}3`, label: "Split view", group: "Workspace" },
  { keys: `${M}${ALT}S`, label: "Toggle drawing panel", group: "Workspace" },
  { keys: `${M}${ALT}I`, label: "Toggle inspector", group: "Workspace" },
  { keys: "← →", label: "Previous / next page", group: "Drawing" },
  { keys: `${M}+  ${M}−`, label: "Zoom in / out", group: "Drawing" },
  { keys: `${M}0`, label: "Fit page to screen", group: "Drawing" },
  { keys: "F", label: "Fit model to view", group: "3D viewer" },
  { keys: "1 · 3 · 7 · 0", label: "Front · right · top · isometric", group: "3D viewer" },
  { keys: "O", label: "Toggle orthographic", group: "3D viewer" },
  { keys: "G  ·  A  ·  W", label: "Grid · axes · wireframe", group: "3D viewer" },
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** App-level shortcuts. Viewer-specific keys are handled by the viewers. */
export function useKeyboardShortcuts(): void {
  const { canGenerate } = useGenerateAvailability();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const ui = useUiStore.getState();
      if (document.querySelector("[role=dialog]") && e.key !== "Escape") return;

      if (!mod && e.key === "?" && !isTyping(e.target)) {
        e.preventDefault();
        ui.openDialog("help");
        return;
      }
      if (e.key === "Escape" && ui.view !== "workspace" && !document.querySelector("[role=dialog]")) {
        ui.navigate("workspace");
        return;
      }
      if (!mod) return;

      const key = e.key.toLowerCase();
      if (key === "n" && !e.shiftKey) {
        e.preventDefault();
        startNewProject();
      } else if (key === "o" && !e.shiftKey) {
        e.preventDefault();
        void pickAndUpload();
      } else if (key === "p" && !e.shiftKey) {
        e.preventDefault();
        ui.openDialog("recent");
      } else if (key === ",") {
        e.preventDefault();
        ui.navigate(ui.view === "settings" ? "workspace" : "settings");
      } else if (key === "l" && e.shiftKey) {
        e.preventDefault();
        useThemeStore.getState().toggle();
      } else if (key === "enter") {
        if (canGenerate) {
          e.preventDefault();
          void useGenerationStore.getState().start();
        }
      } else if (e.altKey && (e.code === "KeyS" || key === "s")) {
        e.preventDefault();
        ui.toggleLeft();
      } else if (e.altKey && (e.code === "KeyI" || key === "i")) {
        e.preventDefault();
        ui.toggleRight();
      } else if (["1", "2", "3"].includes(key) && ui.view === "workspace") {
        const gen = useGenerationStore.getState();
        if (key !== "1" && !gen.result) return;
        e.preventDefault();
        if (gen.showRun && gen.status !== "running" && gen.status !== "clarification") gen.dismissRun();
        ui.setWorkspaceMode(key === "1" ? "drawing" : key === "2" ? "model" : "split");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canGenerate]);
}
