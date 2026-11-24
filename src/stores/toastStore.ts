import { create } from "zustand";
import { newId } from "@/utils/platform";

export type ToastKind = "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  action?: ToastAction;
  /** ms before auto-dismiss; 0 keeps it until dismissed. */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id" | "duration"> & { duration?: number }) => string;
  dismiss: (id: string) => void;
}

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 4000,
  info: 4000,
  warning: 7000,
  error: 9000,
};

const MAX_VISIBLE = 4;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = newId();
    const entry: Toast = { ...toast, id, duration: toast.duration ?? DEFAULT_DURATION[toast.kind] };
    set((s) => ({ toasts: [...s.toasts, entry].slice(-MAX_VISIBLE) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

type ToastOptions = { description?: string; action?: ToastAction; duration?: number };

const push = (kind: ToastKind) => (title: string, options: ToastOptions = {}) =>
  useToastStore.getState().push({ kind, title, ...options });

export const toast = {
  success: push("success"),
  error: push("error"),
  warning: push("warning"),
  info: push("info"),
};
