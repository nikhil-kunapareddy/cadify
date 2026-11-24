import { create } from "zustand";

export type AppView = "workspace" | "settings" | "projects";
export type SettingsSection = "ai" | "appearance" | "storage" | "about" | "developer";
export type WorkspaceMode = "drawing" | "model" | "split";
export type AppDialog = "help" | "recent" | "privacy" | null;

interface UiState {
  view: AppView;
  settingsSection: SettingsSection;
  leftOpen: boolean;
  rightOpen: boolean;
  workspaceMode: WorkspaceMode;
  dialog: AppDialog;
  navigate: (view: AppView, section?: SettingsSection) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  openDialog: (dialog: Exclude<AppDialog, null>) => void;
  closeDialog: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: "workspace",
  settingsSection: "ai",
  leftOpen: true,
  rightOpen: true,
  workspaceMode: "drawing",
  dialog: null,
  navigate: (view, section) => set((s) => ({ view, settingsSection: section ?? s.settingsSection })),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  setWorkspaceMode: (workspaceMode) => set({ workspaceMode }),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
}));
