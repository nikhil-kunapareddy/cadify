import { create } from "zustand";
import type { DisplayMode, Projection } from "@/components/viewer/viewerEngine";

export type ViewerBackground = "theme" | "graphite" | "black" | "light" | "white";

export const VIEWER_BACKGROUNDS: Record<Exclude<ViewerBackground, "theme">, { color: string; dark: boolean; label: string }> = {
  graphite: { color: "#2a2c31", dark: true, label: "Graphite" },
  black: { color: "#0a0a0b", dark: true, label: "Black" },
  light: { color: "#e6e7ea", dark: false, label: "Light gray" },
  white: { color: "#ffffff", dark: false, label: "White" },
};

interface ViewerState {
  grid: boolean;
  axes: boolean;
  display: DisplayMode;
  projection: Projection;
  background: ViewerBackground;
  set: (patch: Partial<Omit<ViewerState, "set">>) => void;
}

/** Viewport preferences shared by every viewer instance (survives remounts). */
export const useViewerStore = create<ViewerState>((set) => ({
  grid: true,
  axes: false,
  display: "shaded-edges",
  projection: "perspective",
  background: "theme",
  set: (patch) => set(patch),
}));
