import { create } from "zustand";
import type { ResolvedTheme, ThemePreference } from "@/types/settings";
import { isTauri } from "@/utils/platform";

const STORAGE_KEY = "cadify.theme";

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "dark" || v === "light" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  return "dark";
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolve(pref: ThemePreference): ResolvedTheme {
  return pref === "system" ? systemTheme() : pref;
}

function apply(pref: ThemePreference, resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved;
  if (isTauri()) {
    // Keep native chrome (traffic lights, menus, dialogs) in sync.
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(pref === "system" ? null : resolved))
      .catch(() => undefined);
  }
}

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
  toggle: () => void;
}

const initialPref = readPreference();

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: initialPref,
  resolved: resolve(initialPref),
  setPreference: (preference) => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* non-critical */
    }
    const resolved = resolve(preference);
    apply(preference, resolved);
    set({ preference, resolved });
  },
  toggle: () => get().setPreference(get().resolved === "dark" ? "light" : "dark"),
}));

/** Applies the stored theme and follows the OS when preference is "system". */
export function initTheme(): () => void {
  const { preference, resolved } = useThemeStore.getState();
  apply(preference, resolved);
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!mq) return () => undefined;
  const onChange = () => {
    const { preference: pref } = useThemeStore.getState();
    if (pref !== "system") return;
    const next = systemTheme();
    document.documentElement.dataset.theme = next;
    useThemeStore.setState({ resolved: next });
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
